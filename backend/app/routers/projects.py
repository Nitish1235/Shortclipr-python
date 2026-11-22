import re
from datetime import datetime, timezone
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from ..core.config import FREE_PLAN_MONTHLY_SECONDS
from ..core.log import get_logger
from ..db import get_pool
from ..dependencies import CurrentUser, current_user
from ..models.schemas import CreateProjectRequest, CreditBalanceResponse, ProjectDownloadResponse, ProjectResponse
from ..services.credits import estimate_credits
from ..services.storage import ObjectStorage

logger = get_logger("shortclipr.projects")
router = APIRouter(prefix="/v1", tags=["projects"])


async def project_payload(row: asyncpg.Record, storage: ObjectStorage) -> dict:
    value = dict(row)
    if row["output_object"]:
        value["output_url"] = f"/v1/projects/{row['id']}/media"
    if row["poster_object"]:
        value["poster_url"] = f"/v1/projects/{row['id']}/poster"
    return value


def title_from_brief(brief: str) -> str:
    title = re.split(r"[.!?\n]", brief.strip(), maxsplit=1)[0].strip()
    return (title or "Untitled production")[:76]


def enforce_plan_duration(plan: str, duration_seconds: int) -> None:
    if plan == "free" and duration_seconds != FREE_PLAN_MONTHLY_SECONDS:
        raise HTTPException(
            status_code=403,
            detail="The Free plan includes one 10-second short each month. Upgrade to a paid plan for longer videos.",
        )


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(request: Request, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200", user.id)
    storage: ObjectStorage = request.app.state.storage
    return [await project_payload(row, storage) for row in rows]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: UUID, request: Request, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow("SELECT * FROM projects WHERE id=$1 AND user_id=$2", project_id, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return await project_payload(row, request.app.state.storage)


@router.get("/projects/{project_id}/download", response_model=ProjectDownloadResponse)
async def download_project(project_id: UUID, request: Request, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    """Return the authenticated media route used by the frontend download action."""
    row = await pool.fetchrow("SELECT title,output_object FROM projects WHERE id=$1 AND user_id=$2", project_id, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    if not row["output_object"]:
        raise HTTPException(status_code=409, detail="The final video is not ready yet")
    return {"download_url": f"/v1/projects/{project_id}/media?download=1"}


@router.get("/projects/{project_id}/media")
async def project_media(project_id: UUID, request: Request, download: int = 0, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow("SELECT output_object,title FROM projects WHERE id=$1 AND user_id=$2", project_id, user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    if not row["output_object"]:
        raise HTTPException(status_code=409, detail="The final video is not ready yet")
    content_type, size = await request.app.state.storage.private_object_info(row["output_object"])
    headers = {}
    if download:
        filename = "".join(char if char.isalnum() or char in " -_." else "_" for char in row["title"]).strip() or "shortclipr-film"
        if not filename.lower().endswith(".mp4"):
            filename += ".mp4"
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    if size is not None:
        headers["Content-Length"] = str(size)
    return StreamingResponse(request.app.state.storage.stream_private(row["output_object"]), media_type=content_type, headers=headers)


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: CreateProjectRequest, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    if user.plan not in {"free", "starter", "creator", "studio"} or (user.plan != "free" and user.subscription_status != "active"):
        raise HTTPException(status_code=402, detail="Choose an active Starter, Creator, or Studio plan to continue")
    enforce_plan_duration(user.plan, payload.duration_seconds)
    credits = estimate_credits(payload.clip_type, payload.duration_seconds, payload.visual_style)
    project_id = uuid4()
    async with pool.acquire() as connection:
        async with connection.transaction():
            account = await connection.fetchrow("SELECT * FROM credit_accounts WHERE user_id=$1 FOR UPDATE", user.id)
            if not account:
                raise HTTPException(status_code=409, detail="Credit account is not initialized")
            if user.plan != "free" and user.subscription_status == "active" and account["cycle_ends_at"] <= datetime.now(timezone.utc):
                raise HTTPException(status_code=402, detail="Your plan cycle has ended; renewal confirmation is pending")
            available = account["total_credits"] - account["spent_credits"] - account["reserved_credits"]
            if credits > available:
                raise HTTPException(status_code=402, detail="Not enough render time for this production")
            row = await connection.fetchrow(
                """
                INSERT INTO projects(id,user_id,title,brief,clip_type,department,language,voice_id,visual_style,duration_seconds,aspect_ratio,status,progress,credits_reserved)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued',2,$12)
                RETURNING *
                """,
                project_id,user.id,title_from_brief(payload.brief),payload.brief,payload.clip_type,payload.department,payload.language,payload.voice_id,payload.visual_style,payload.duration_seconds,payload.aspect_ratio,credits,
            )
            await connection.execute("UPDATE credit_accounts SET reserved_credits=reserved_credits+$2 WHERE user_id=$1", user.id, credits)
            await connection.execute("INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key) VALUES($1,$2,'reserve',$3,$4)", user.id, project_id, credits, f"project:{project_id}:v0:reserve")
            attempt_id = uuid4()
            await connection.execute("INSERT INTO job_attempts(id,project_id,job_class,status) VALUES($1,$2,'api','ready')", attempt_id, project_id)
            await connection.execute("INSERT INTO project_events(project_id,event_type,stage,progress) VALUES($1,'queued','api',2)", project_id)
            await connection.execute("SELECT pg_notify('shortclipr_jobs',$1)", str(attempt_id))
    logger.info(
        "project.queued",
        extra={
            "project_id": str(project_id),
            "attempt_id": str(attempt_id),
            "credits_reserved": credits,
            "clip_type": payload.clip_type,
            "duration_s": payload.duration_seconds,
            "aspect_ratio": payload.aspect_ratio,
        },
    )
    return dict(row)


@router.post("/projects/{project_id}/cancel", status_code=204)
async def cancel_project(project_id: UUID, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    async with pool.acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 AND user_id=$2 FOR UPDATE", project_id, user.id)
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            if project["status"] not in {"queued", "planning", "rendering"}:
                raise HTTPException(status_code=409, detail="Project can no longer be cancelled")
            version = project["credit_reservation_version"]
            released = await connection.fetchval(
                """INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key)
                   VALUES($1,$2,'release',$3,$4) ON CONFLICT DO NOTHING RETURNING id""",
                user.id, project_id, -project["credits_reserved"],
                f"project:{project_id}:v{version}:cancel-release",
            )
            await connection.execute(
                """UPDATE projects SET status='cancelled',cancelled_at=now()
                   WHERE id=$1 AND status IN ('queued','planning','rendering')""",
                project_id,
            )
            await connection.execute(
                """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                   lease_expires_at=NULL,worker_region=NULL
                   WHERE project_id=$1 AND status IN ('ready','leased','running')""",
                project_id,
            )
            if released:
                await connection.execute(
                    "UPDATE credit_accounts SET reserved_credits=GREATEST(0,reserved_credits-$2) WHERE user_id=$1",
                    user.id, project["credits_reserved"],
                )
    return Response(status_code=204)


@router.get("/account/credits", response_model=CreditBalanceResponse)
async def credit_balance(user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    if user.plan not in {"free", "starter", "creator", "studio"} or (user.plan != "free" and user.subscription_status != "active"):
        return {"total": 0, "used": 0, "remaining": 0, "cycle_ends_at": None}
    if user.plan == "free":
        await pool.execute(
            """UPDATE credit_accounts SET total_credits=$2+reserved_credits,spent_credits=0,
               cycle_started_at=date_trunc('month',now()),cycle_ends_at=date_trunc('month',now())+interval '1 month'
               WHERE user_id=$1 AND cycle_ends_at<=now()""",
            user.id, FREE_PLAN_MONTHLY_SECONDS,
        )
    row = await pool.fetchrow("SELECT * FROM credit_accounts WHERE user_id=$1", user.id)
    if not row:
        raise HTTPException(status_code=404, detail="Credit account not found")
    if user.plan != "free" and row["cycle_ends_at"] <= datetime.now(timezone.utc):
        return {"total": 0, "used": 0, "remaining": 0, "cycle_ends_at": row["cycle_ends_at"]}
    used = row["spent_credits"] + row["reserved_credits"]
    return {"total":row["total_credits"],"used":used,"remaining":max(0,row["total_credits"]-used),"cycle_ends_at":row["cycle_ends_at"]}
