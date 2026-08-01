"""
internal.py — internal-only endpoints, dispatched to by the watcher service
(or, in single-service mode, called by jobs.py directly via asyncio.create_task
without going through HTTP at all).

  POST /internal/pipeline/run       — legacy unified pipeline (both stages).
                                       Kept for backward compat with older
                                       WORKER_SERVICE_URLS deployments.
  POST /internal/api-stage/run      — API stage only (split-worker mode).
                                       Called by watcher for API worker pool.
  POST /internal/ffmpeg-stage/run   — FFmpeg stage only (split-worker mode).
                                       Called by watcher for FFmpeg worker pool.
  POST /internal/editor/render      — re-burn captions onto a raw clip.

All /internal/* routes are gated on X-Internal-Secret == INTERNAL_TASK_SECRET.
Only the watcher (and the API service itself, for /editor/render) should
ever call these.
"""

import asyncio
import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.api.editor import _burn_and_upload_from_url
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.api_stage import run_api_stage
from app.pipeline.captions import Caption
from app.pipeline.ffmpeg_stage import run_ffmpeg_stage
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.test_pipeline import run_test_pipeline

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_internal_secret(x_internal_secret: str) -> None:
    if not settings.INTERNAL_TASK_SECRET or x_internal_secret != settings.INTERNAL_TASK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


class InternalRunRequest(BaseModel):
    job_id: str
    user_id: str
    youtube_url: str
    options: dict


@router.post("/pipeline/run", status_code=202)
async def internal_run_pipeline(body: InternalRunRequest, x_internal_secret: str = Header(default="")):
    """Legacy unified pipeline — runs BOTH stages in-process on this instance.
    Used by the pre-split single-pool worker deployment (WORKER_SERVICE_URLS)."""
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_pipeline(body.job_id, body.user_id, body.youtube_url, body.options),
        name=f"pipeline-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


# ── Split-worker endpoints ────────────────────────────────────
# Called by the watcher's dual-queue dispatcher when API_WORKER_URLS /
# FFMPEG_WORKER_URLS are configured. Each Cloud Run instance runs the
# same Docker image but only receives calls for its designated stage
# (the watcher's routing enforces that separation, not the instance).

class InternalApiStageRequest(BaseModel):
    job_id:      str
    user_id:     str
    youtube_url: str
    options:     dict


@router.post("/api-stage/run", status_code=202)
async def internal_run_api_stage(body: InternalApiStageRequest, x_internal_secret: str = Header(default="")):
    """API stage: metadata → transcript → GPT → write ffmpeg_payload → status='api_done'."""
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_api_stage(body.job_id, body.user_id, body.youtube_url, body.options),
        name=f"api-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


class InternalFfmpegStageRequest(BaseModel):
    job_id: str
    # No other fields — FFmpeg stage reads ffmpeg_payload from the jobs table.


@router.post("/ffmpeg-stage/run", status_code=202)
async def internal_run_ffmpeg_stage(body: InternalFfmpegStageRequest, x_internal_secret: str = Header(default="")):
    """FFmpeg stage: DASH download → encode → upload → status='completed'."""
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_ffmpeg_stage(body.job_id),
        name=f"ffmpeg-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


class InternalTestRequest(BaseModel):
    job_id: str
    youtube_url: str
    quality: str = "1080p"


@router.post("/test/run", status_code=202)
async def internal_run_test(body: InternalTestRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_test_pipeline(body.job_id, body.youtube_url, body.quality),
        name=f"test-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


class InternalMarketingRequest(BaseModel):
    job_id: str
    config: dict


@router.post("/marketing/render", status_code=202)
async def internal_run_marketing(body: InternalMarketingRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    from app.api.admin_marketing import run_marketing_render
    asyncio.create_task(
        run_marketing_render(body.job_id, body.config),
        name=f"mktg-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


@router.get("/marketing/jobs/{job_id}", status_code=200)
async def internal_get_marketing_job(job_id: str, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    from app.api.admin_marketing import _marketing_jobs
    job = _marketing_jobs.get(job_id)
    if job is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Marketing job not found")
    return job


@router.get("/test/jobs/{job_id}", status_code=200)
async def internal_get_test_job(job_id: str, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    from app.pipeline.test_pipeline import get_test_job
    job = get_test_job(job_id)
    if job is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Test job not found")
    return job


class InternalRenderRequest(BaseModel):
    job_id: str
    clip_id: str
    raw_url: str
    captions: list[dict]
    config: dict


@router.post("/editor/render")
async def internal_render_clip(body: InternalRenderRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    captions = [Caption(start=c["start"], end=c["end"], text=c["text"]) for c in body.captions]
    video_url = await _burn_and_upload_from_url(
        body.raw_url, captions, body.config, body.job_id, body.clip_id,
    )
    return {"video_url": video_url}


@router.post("/reconcile-stuck-jobs")
async def reconcile_stuck_jobs(x_internal_secret: str = Header(default="")):
    """
    Catches jobs stuck in any pre-terminal state beyond the timeout:
      'created' | 'dispatched' | 'api_processing' | 'api_done' | 'ffmpeg_processing'

    The watcher service runs its own reconciliation loop (every 60s), but
    this endpoint is kept as a manual fallback trigger (same X-Internal-Secret
    gate) for on-call debugging.
    """
    _require_internal_secret(x_internal_secret)

    stuck = await db.find_stuck_jobs(settings.RECONCILE_STUCK_JOB_MINUTES)
    for job in stuck:
        job_id = job["job_id"]
        logger.warning(f"[{job_id}] Stuck in '{job.get('status', '?')}' beyond timeout — failing + refunding")
        await db.fail_job(job_id, "Job could not be scheduled in time — please retry.")
        if job["clip_count"] > 0:
            await db.release_credits(job["user_id"], job["clip_count"])
        if job["reserved_video_minutes"] > 0:
            await db.release_video_minutes(job["user_id"], job["reserved_video_minutes"])

    return {"reconciled": len(stuck)}
