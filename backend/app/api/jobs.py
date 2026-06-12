"""
jobs.py — /jobs endpoints.

POST /jobs              — Validate → check plan → INSERT job → START pipeline immediately
GET  /jobs/{job_id}/stream — SSE progress monitor (pure heartbeat, pipeline already running)
GET  /jobs              — List user's jobs
GET  /jobs/{job_id}     — Single job
GET  /jobs/{job_id}/clips — Clips for a job
DELETE /jobs/{job_id}   — Delete job + clips

No queue. Pipeline fires the moment POST /jobs is received.
asyncio.create_task() launches run_pipeline() in the same event loop —
Cloud Run keeps the CPU alive as long as the task is running.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from app.api.deps import CurrentUser, decode_access_token
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.captions import (
    VALID_COLORS, VALID_HALIGNS, VALID_STYLES,
    VALID_VALIGNS, VALID_WORDS_PER_LINE,
)
from app.pipeline.extractor import VALID_TEMPLATES, VALID_ASPECTS
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.stream import extract_video_id, get_video_metadata
from app.pipeline.uploader import delete_job_from_gcs

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)
settings = get_settings()   # Fix: was imported but never instantiated → NameError


# ── Request / response schemas ─────────────────────────────────

class JobOptions(BaseModel):
    clip_count:   int = 10
    min_duration: int = 30
    max_duration: int = 90
    language:     str = "English"
    style:        str = "minimal"       # caption animation style
    color:        str = "white_black"   # caption colour combo
    h_align:      str = "center"        # horizontal position
    v_align:      str = "bottom"        # vertical position
    words_per_line:  int = 3             # 1 | 2 | 3  — words per screen
    short_template:  str = "blur_bg"    # 9:16 layout template
    bar_color:       str = "#0d0d0d"    # hex colour for bars / frame / gradient
    aspect:          str = "9:16"       # output aspect ratio — 9:16 | 16:9 | 1:1
    topic:           str = ""
    quality:         str = "1080p"      # capped at 1080p; degrades gracefully

    @field_validator("clip_count")
    @classmethod
    def validate_clip_count(cls, v: int) -> int:
        return max(1, min(20, v))

    @field_validator("style")
    @classmethod
    def validate_style(cls, v: str) -> str:
        return v if v in VALID_STYLES else "minimal"

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        return v if v in VALID_COLORS else "white_black"

    @field_validator("h_align")
    @classmethod
    def validate_h_align(cls, v: str) -> str:
        return v if v in VALID_HALIGNS else "center"

    @field_validator("v_align")
    @classmethod
    def validate_v_align(cls, v: str) -> str:
        return v if v in VALID_VALIGNS else "bottom"

    @field_validator("words_per_line")
    @classmethod
    def validate_words_per_line(cls, v: int) -> int:
        return v if v in VALID_WORDS_PER_LINE else 3

    @field_validator("short_template")
    @classmethod
    def validate_short_template(cls, v: str) -> str:
        return v if v in VALID_TEMPLATES else "blur_bg"

    @field_validator("bar_color")
    @classmethod
    def validate_bar_color(cls, v: str) -> str:
        import re
        return v if re.fullmatch(r"#[0-9a-fA-F]{6}", v) else "#0d0d0d"

    @field_validator("aspect")
    @classmethod
    def validate_aspect(cls, v: str) -> str:
        return v if v in VALID_ASPECTS else "9:16"

    @field_validator("quality")
    @classmethod
    def validate_quality(cls, v: str) -> str:
        allowed = {"360p", "480p", "720p", "1080p"}
        return v if v in allowed else "1080p"


class CreateJobRequest(BaseModel):
    youtube_url: str
    options:     JobOptions = JobOptions()


# ── POST /jobs — create + fire immediately ─────────────────────

@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_job(body: CreateJobRequest, current_user: CurrentUser):
    """
    1. Check plan / credit limit
    2. Validate YouTube URL
    3. INSERT job row (status = processing)
    4. asyncio.create_task(run_pipeline(...))  ← starts RIGHT NOW, no queue
    5. Return {job_id} to frontend

    Frontend opens GET /jobs/{job_id}/stream for SSE heartbeats.
    Supabase Realtime delivers clip cards as they are inserted.
    """
    # ── 1. Shorts quota (credits) check ───────────────────────
    allowed, reason = await db.check_user_can_process(current_user.user_id)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=reason)

    # ── 1b. Concurrent job limit ───────────────────────────────
    active_count = await db.count_active_jobs(current_user.user_id)
    if active_count >= settings.MAX_CONCURRENT_JOBS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You already have {active_count} job(s) processing. "
                   f"Wait for them to finish before submitting another.",
        )

    # ── 2. Validate YouTube URL ────────────────────────────────
    video_id = extract_video_id(body.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid YouTube URL — paste a valid youtube.com or youtu.be link.",
        )

    # ── 3. Pre-flight: fetch video metadata + enforce duration limits ──
    #
    # We fetch duration HERE (before creating the job row) so we can
    # reject over-limit videos instantly with a clear error message.
    # The duration is forwarded to the pipeline via options so it
    # doesn't need to make a second InnerTube call.
    try:
        video_meta = await get_video_metadata(video_id)
    except Exception as exc:
        logger.warning(f"Metadata prefetch failed for {video_id}: {exc}")
        video_meta = {"title": "", "duration": 0, "thumbnail": ""}

    video_duration_seconds = int(video_meta.get("duration", 0))

    # Only enforce duration gates when metadata succeeded (duration > 0)
    if video_duration_seconds > 0:
        ok, msg = await db.check_video_quota(
            current_user.user_id,
            video_duration_seconds,
            current_user.plan,
        )
        if not ok:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=msg)

    # ── 4. Insert job row ──────────────────────────────────────
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db._execute(
        """
        INSERT INTO jobs
          (job_id, user_id, youtube_url, status, progress,
           current_step, clip_count, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
        """,
        job_id,
        current_user.user_id,
        body.youtube_url,
        "processing",
        0,
        "Starting pipeline...",
        body.options.clip_count,
        now,
    )

    # ── 5. Fire pipeline immediately ───────────────────────────
    options = body.options.model_dump()
    # Pass prefetched metadata so orchestrator skips a second InnerTube call
    if video_duration_seconds > 0:
        options["prefetched_duration"] = video_duration_seconds
        options["prefetched_title"]    = video_meta.get("title", "")

    asyncio.create_task(
        run_pipeline(job_id, current_user.user_id, body.youtube_url, options),
        name=f"pipeline-{job_id[:8]}",
    )
    logger.info(
        f"[{job_id}] Pipeline started — user={current_user.user_id} "
        f"plan={current_user.plan} duration={video_duration_seconds}s"
    )

    # ── 6. Return instantly ────────────────────────────────────
    return {"job_id": job_id, "status": "processing"}


# ── SSE stream — pure progress monitor ─────────────────────────
# Must be declared BEFORE /{job_id} to avoid route collision.

@router.get("/{job_id}/stream")
async def job_progress_stream(job_id: str, token: str = Query(...)):
    """
    SSE endpoint — pure progress monitor.
    Pipeline is already running (started in POST /jobs).
    This just polls the DB and keeps the frontend connection alive
    so the user sees live progress without relying solely on Realtime.

    Token is passed as query param because EventSource cannot set Auth headers.
    """
    # Verify token
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != payload.sub:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        # If the job is already done/failed when the client connects, close immediately
        terminal = {"complete", "failed", "error"}

        while True:
            try:
                row = await db.get_job(job_id)
            except Exception:
                row = None

            if not row:
                yield "data: error - job not found\n\n"
                break

            job_status = row.get("status", "processing")
            progress   = row.get("progress", 0)
            step       = row.get("current_step", "") or ""

            if job_status == "complete":
                yield f"data: done\n\n"
                break
            elif job_status in {"failed", "error"}:
                err = (row.get("error_message") or row.get("current_step") or "Pipeline failed")
                err = str(err)[:300].replace("\n", " ")
                yield f"data: error - {err}\n\n"
                break
            else:
                # Send progress payload — frontend can parse for rich updates
                yield f"data: {progress}:{step}\n\n"

            await asyncio.sleep(3)          # poll every 3 s

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",     # prevent nginx buffering SSE
        },
    )


# ── GET /jobs — list ───────────────────────────────────────────

@router.get("")
async def list_jobs(current_user: CurrentUser):
    """List all jobs for the authenticated user, newest first."""
    rows = await db._fetch(
        "SELECT * FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        current_user.user_id,
    )
    return {"jobs": [_serialize_job(r) for r in rows]}


# ── GET /jobs/{job_id} ─────────────────────────────────────────

@router.get("/{job_id}")
async def get_job(job_id: str, current_user: CurrentUser):
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize_job(job)


# ── GET /jobs/{job_id}/clips ───────────────────────────────────

@router.get("/{job_id}/clips")
async def get_job_clips(job_id: str, current_user: CurrentUser):
    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")

    clips = await db.get_clips_for_job(job_id)
    return {
        "clips": [_serialize_clip(c) for c in clips],
        "total": len(clips),
    }


# ── DELETE /jobs/{job_id} ──────────────────────────────────────

@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(job_id: str, current_user: CurrentUser):
    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")

    await db._execute("DELETE FROM clips WHERE job_id=$1", job_id)
    await db._execute("DELETE FROM jobs  WHERE job_id=$1", job_id)
    # Fire-and-forget GCS cleanup — don't block the response
    asyncio.create_task(delete_job_from_gcs(job_id), name=f"gcs-cleanup-{job_id[:8]}")


# ── Serialisation helpers ──────────────────────────────────────

def _serialize_job(r: dict) -> dict:
    r = dict(r)
    r["job_id"]  = str(r["job_id"])
    r["user_id"] = str(r["user_id"])
    for ts_field in ("created_at", "updated_at", "completed_at"):
        if r.get(ts_field):
            r[ts_field] = r[ts_field].isoformat()
    r["options"] = {"clip_count": r.get("clip_count", 0)}
    return r


def _serialize_clip(c: dict) -> dict:
    c = dict(c)
    c["clip_id"] = str(c["clip_id"])
    c["job_id"]  = str(c["job_id"])
    c["user_id"] = str(c["user_id"])
    if c.get("created_at"):
        c["created_at"] = c["created_at"].isoformat()
    return c
