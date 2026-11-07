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
    """Reset a failed project back to 'queued' and re-enter it into the pipeline.

    Safe to call on any project with status 'failed'. Resets attempts counter
    so it gets a full 3 more tries. Notifies the watcher immediately.
    """
    async with pool.acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                "SELECT id, status, credits_reserved FROM projects WHERE id=$1 FOR UPDATE",
                project_id,
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            if project["status"] != "failed":
                raise HTTPException(
                    status_code=409,
                    detail=f"Project is '{project['status']}', only 'failed' projects can be requeued",
                )

            # Reset project back to queued state.
            await connection.execute(
                """UPDATE projects
                   SET status='queued', progress=2, error_code=NULL, error_message=NULL
                   WHERE id=$1""",
                project_id,
            )

            # Try to reset an existing api job_attempt first.
            updated = await connection.fetchval(
                """UPDATE job_attempts
                   SET status='ready', attempts=0, due_at=now(),
                       lease_token=NULL, lease_expires_at=NULL, last_error=NULL, worker_region=NULL
                   WHERE project_id=$1 AND job_class='api'
                   RETURNING id""",
                project_id,
            )

            # If no attempt row exists (e.g. it was hard-deleted), create a fresh one.
            if not updated:
                updated = uuid4()
                await connection.execute(
                    "INSERT INTO job_attempts(id, project_id, job_class, status) VALUES($1,$2,'api','ready')",
                    updated, project_id,
                )

            await connection.execute(
                "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'queued','admin',2,'{}') ",
                project_id,
            )

            # Wake the watcher immediately.
            await connection.execute("SELECT pg_notify('shortclipr_jobs',$1)", str(updated))

    return {"requeued": True, "projectId": str(project_id)}
