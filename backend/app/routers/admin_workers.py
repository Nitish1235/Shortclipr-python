import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_pool
from ..dependencies import CurrentUser, admin_user
from ..models.schemas import WorkerFleetResponse


router = APIRouter(prefix="/v1/admin/workers", tags=["admin-workers"])


@router.get("/status", response_model=WorkerFleetResponse)
async def worker_status(
    _: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool),
):
    regions = await pool.fetch(
        """SELECT state.*,COALESCE(active.assigned,0)::integer AS assigned
           FROM worker_region_state state
           LEFT JOIN (
             SELECT job_class,worker_region,count(*) AS assigned
             FROM job_attempts
             WHERE status IN ('leased','running') AND lease_expires_at>now()
             GROUP BY job_class,worker_region
           ) active ON active.job_class=state.job_class AND active.worker_region=state.region
           ORDER BY state.job_class,state.region"""
    )
    counts = await pool.fetchrow(
        """SELECT
             count(*) FILTER (WHERE job_class='api' AND status='ready')::integer AS queued_api,
             count(*) FILTER (WHERE job_class='render' AND status='ready')::integer AS queued_render,
             count(*) FILTER (WHERE job_class='api' AND status IN ('leased','running') AND lease_expires_at>now())::integer AS running_api,
             count(*) FILTER (WHERE job_class='render' AND status IN ('leased','running') AND lease_expires_at>now())::integer AS running_render,
             count(*) FILTER (WHERE status='failed' AND updated_at>now()-interval '24 hours')::integer AS failed_24h
           FROM job_attempts"""
    )
    now = datetime.now(timezone.utc)
    payload = []
    for row in regions:
        assigned = row["assigned"]
        available = max(0, row["capacity"] - assigned)
        if row["blocked_until"] and row["blocked_until"] > now:
            status = "cooldown"
        elif available == 0:
            status = "full"
        else:
            status = "available"
        payload.append({
            "job_class": row["job_class"],
            "region": row["region"],
            "capacity": row["capacity"],
            "assigned": assigned,
            "available": available,
            "status": status,
            "blocked_until": row["blocked_until"],
            "last_error": row["last_error"],
            "last_rejection_at": row["last_rejection_at"],
            "last_success_at": row["last_success_at"],
            "updated_at": row["updated_at"],
        })
    return {
        "regions": payload,
        "queued_api": counts["queued_api"],
        "queued_render": counts["queued_render"],
        "running_api": counts["running_api"],
        "running_render": counts["running_render"],
        "failed_24h": counts["failed_24h"],
        "generated_at": now,
    }


@router.post("/projects/{project_id}/requeue", status_code=status.HTTP_200_OK)
async def requeue_project(
    project_id: UUID,
    _: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool),
):
    """Requeue a failed project with a fresh, idempotent credit reservation."""
    async with pool.acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                """SELECT id,user_id,status,credits_reserved,credit_reservation_version
                   FROM projects WHERE id=$1 FOR UPDATE""",
                project_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            if project["status"] != "failed":
                raise HTTPException(
                    status_code=409,
                    detail=f"Project is '{project['status']}', only 'failed' projects can be requeued",
                )

            account = await connection.fetchrow(
                "SELECT * FROM credit_accounts WHERE user_id=$1 FOR UPDATE",
                project["user_id"],
            )
            if not account:
                raise HTTPException(status_code=409, detail="Credit account is not initialized")
            available = account["total_credits"] - account["spent_credits"] - account["reserved_credits"]
            if project["credits_reserved"] > available:
                raise HTTPException(status_code=402, detail="Not enough render time to requeue this production")

            next_version = project["credit_reservation_version"] + 1
            reserved = await connection.fetchval(
                """INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key,metadata)
                   VALUES($1,$2,'reserve',$3,$4,jsonb_build_object('source','admin_requeue','version',$5))
                   ON CONFLICT DO NOTHING RETURNING id""",
                project["user_id"], project_id, project["credits_reserved"],
                f"project:{project_id}:v{next_version}:reserve", next_version,
            )
            if not reserved:
                raise HTTPException(status_code=409, detail="This requeue reservation was already recorded")
            await connection.execute(
                "UPDATE credit_accounts SET reserved_credits=reserved_credits+$2 WHERE user_id=$1",
                project["user_id"], project["credits_reserved"],
            )

            await connection.execute(
                """UPDATE projects
                   SET status='queued',progress=2,error_code=NULL,error_message=NULL,
                       credit_reservation_version=$2,credits_settled=NULL,
                       output_object=NULL,completed_at=NULL,cancelled_at=NULL
                   WHERE id=$1""",
                project_id, next_version,
            )

            api_attempt = await connection.fetchval(
                """UPDATE job_attempts
                   SET status='ready',attempts=0,due_at=now(),lease_token=NULL,
                       lease_expires_at=NULL,last_error=NULL,worker_region=NULL
                   WHERE project_id=$1 AND job_class='api'
                   RETURNING id""",
                project_id,
            )
            if not api_attempt:
                api_attempt = uuid4()
                await connection.execute(
                    """INSERT INTO job_attempts(id,project_id,job_class,status)
                       VALUES($1,$2,'api','ready')""",
                    api_attempt, project_id,
                )

            await connection.execute(
                """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
                   VALUES($1,'queued','admin',2,$2::jsonb)""",
                project_id,
                json.dumps({"credit_reservation_version": next_version}),
            )
            await connection.execute("SELECT pg_notify('shortclipr_jobs',$1)", str(api_attempt))

    return {"requeued": True, "projectId": str(project_id), "creditReservationVersion": next_version}


@router.get("/projects/{project_id}/events")
async def project_events(
    project_id: UUID,
    _: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool),
):
    """Return the full pipeline event timeline for a project.

    Use this to diagnose stuck or failed jobs without opening the DB console.
    Events are ordered chronologically.
    """
    project = await pool.fetchrow(
        "SELECT id, status, progress, error_code, error_message, created_at, updated_at FROM projects WHERE id=$1",
        project_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    events = await pool.fetch(
        """SELECT id, event_type, stage, progress, payload, created_at
           FROM project_events WHERE project_id=$1 ORDER BY created_at""",
        project_id,
    )

    attempts = await pool.fetch(
        """SELECT id, job_class, status, attempts, max_attempts,
                  worker_region, last_error, due_at, lease_expires_at, created_at, updated_at
           FROM job_attempts WHERE project_id=$1 ORDER BY job_class, created_at""",
        project_id,
    )

    return {
        "projectId": str(project_id),
        "project": {
            "status": project["status"],
            "progress": project["progress"],
            "errorCode": project["error_code"],
            "errorMessage": project["error_message"],
            "createdAt": project["created_at"],
            "updatedAt": project["updated_at"],
        },
        "events": [
            {
                "id": str(e["id"]),
                "eventType": e["event_type"],
                "stage": e["stage"],
                "progress": e["progress"],
                "payload": e["payload"],
                "createdAt": e["created_at"],
            }
            for e in events
        ],
        "attempts": [
            {
                "id": str(a["id"]),
                "jobClass": a["job_class"],
                "status": a["status"],
                "attempts": a["attempts"],
                "maxAttempts": a["max_attempts"],
                "workerRegion": a["worker_region"],
                "lastError": a["last_error"],
                "dueAt": a["due_at"],
                "leaseExpiresAt": a["lease_expires_at"],
                "createdAt": a["created_at"],
                "updatedAt": a["updated_at"],
            }
            for a in attempts
        ],
    }

