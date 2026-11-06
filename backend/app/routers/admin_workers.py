from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends

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
