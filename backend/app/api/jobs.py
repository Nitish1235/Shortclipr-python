"""
jobs.py — /jobs endpoints.

POST /jobs              — Validate → check plan → INSERT job → enqueue/start pipeline
GET  /jobs/{job_id}/stream — SSE progress monitor (pure heartbeat, pipeline already running)
GET  /jobs              — List user's jobs
GET  /jobs/{job_id}     — Single job
GET  /jobs/{job_id}/clips — Clips for a job
DELETE /jobs/{job_id}   — Delete job + clips

Two dispatch modes:
  - Single-service (no worker URLs configured): unified pipeline runs
    in-process via asyncio.create_task(), job row inserted as
    status='processing' since there's no network hop that can silently fail.
  - Split-worker (API_WORKER_URLS + FFMPEG_WORKER_URLS set): job row inserted
    as status='created', pipeline_stage='api' with queue_payload, then
    pg_notify('new_job') fires. Watcher dispatches to an API worker; when
    the API stage completes it flips status='api_done' (Postgres trigger
    fires pg_notify('api_done')), watcher then dispatches to an FFmpeg
    worker. See migrations/005_split_workers.sql for the full status flow.
    (Legacy: if only WORKER_SERVICE_URLS is set, the watcher runs against
    the old unified worker pool via /internal/pipeline/run.)
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
from app.core.plan_limits import (
    get_max_clip_count, get_max_clip_duration_seconds, get_max_transcript_minutes_for_ai,
    get_max_video_minutes,
)
from app.core.worker_routing import has_multi_region_workers
from app.db import supabase as db
from app.pipeline.captions import (
    VALID_COLORS, VALID_FONTS, VALID_HALIGNS, VALID_STYLES,
    VALID_VALIGNS, VALID_WORDS_PER_LINE,
)
from app.pipeline.extractor import VALID_TEMPLATES, VALID_ASPECTS
from app.pipeline.title_box import TITLE_BG_COLORS, TITLE_TEXT_COLORS
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.stream import extract_video_id, get_video_metadata
from app.pipeline.uploader import delete_job_from_gcs

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)
settings = get_settings()   # Fix: was imported but never instantiated → NameError

# "Minutes gateway" — minimum selectable window. Below this, a selection is
# treated as invalid/noise and the full video is used instead. Mirrored in
# orchestrator.py's fallback resolution (when this endpoint's own metadata
# prefetch fails) — keep both in sync if changed.
MIN_GATEWAY_SECONDS = 60


def _min_video_seconds_for_clips(clip_count: int) -> int:
    """Minimum source video length required to request `clip_count` clips —
    below this there isn't enough distinct material to cut that many
    non-overlapping clips from. ~0.7 min of source per requested clip:
    3 clips → must be >2 min, 5 clips → >3 min, 10 clips → >7 min.
    Mirrored in api_stage.py's fallback path — keep both in sync."""
    return int(clip_count * 0.7) * 60


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
    title_permanent: bool = False        # keep the AI hook title on screen for the whole clip
    hook_title_enabled: bool = True      # False = "None" — skip the AI title card entirely
    font:            str = "default"    # one of captions.VALID_FONTS
    title_color:     str = "white"      # title TEXT colour — independent of caption `color`
    title_bg:        str = "none"       # title background box — "none" (default) | swatch key
    title_bg_opacity: float = 0.55      # 0.0-1.0, only used when title_bg != "none"
    short_template:  str = "full_screen"  # 9:16 layout template
    bar_color:       str = "#0d0d0d"    # hex colour for bars / frame / gradient
    aspect:          str = "9:16"       # output aspect ratio — 9:16 | 16:9 | 1:1
    topic:           str = ""
    quality:         str = "1080p"      # capped at 1080p; degrades gracefully

    # "Minutes gateway" — restrict AI clip-finding (and billing!) to a
    # sub-window of the source video instead of the whole thing.
    # gateway_end=None means "full video", resolved once real duration is
    # known (see create_job) — can't validate against video length here,
    # this model has no access to it yet.
    gateway_start: float = 0.0
    gateway_end:   float | None = None

    @field_validator("clip_count")
    @classmethod
    def validate_clip_count(cls, v: int) -> int:
        # Hard cap at 10 for every plan — 15/20 clips per job blows out our
        # processing budget (proxy calls, FFmpeg concurrency) and gives worse
        # per-clip quality since GPT chunks the transcript accordingly.
        return max(1, min(10, v))

    @field_validator("gateway_start")
    @classmethod
    def validate_gateway_start(cls, v: float) -> float:
        return max(0.0, v)

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

    @field_validator("font")
    @classmethod
    def validate_font(cls, v: str) -> str:
        return v if v in VALID_FONTS else "default"

    @field_validator("title_color")
    @classmethod
    def validate_title_color(cls, v: str) -> str:
        return v if v in TITLE_TEXT_COLORS else "white"

    @field_validator("title_bg")
    @classmethod
    def validate_title_bg(cls, v: str) -> str:
        return v if v in TITLE_BG_COLORS else "none"

    @field_validator("title_bg_opacity")
    @classmethod
    def validate_title_bg_opacity(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))

    @field_validator("short_template")
    @classmethod
    def validate_short_template(cls, v: str) -> str:
        return v if v in VALID_TEMPLATES else "full_screen"

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
    1. Validate YouTube URL + concurrent-job limit + free-tier caps
    2. Fetch video metadata
    3. ATOMICALLY reserve credits + video-minutes (the real gate — last,
       right before the INSERT, so nothing after this can fail and orphan
       a reservation without it being rolled back here)
    4. INSERT job row (status = processing)
    5. asyncio.create_task(run_pipeline(...))  ← starts RIGHT NOW, no queue
    6. Return {job_id} to frontend

    Frontend opens GET /jobs/{job_id}/stream for SSE heartbeats.
    Supabase Realtime delivers clip cards as they are inserted.

    Reservations are deliberately the LAST gate before dispatch (not first,
    as it used to be) — see reserve_credits/reserve_video_minutes in
    supabase.py for why a plain "check, then bill later" pattern allowed
    concurrent submissions to double-spend the same remaining quota.
    """
    # ── 1. Validate YouTube URL ────────────────────────────────
    video_id = extract_video_id(body.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid YouTube URL — paste a valid youtube.com or youtu.be link.",
        )

    # ── 1b. Concurrent job limit ───────────────────────────────
    active_count = await db.count_active_jobs(current_user.user_id)
    if active_count >= settings.MAX_CONCURRENT_JOBS_PER_USER:
        limit = settings.MAX_CONCURRENT_JOBS_PER_USER
        detail = (
            "You already have a job processing. Wait for it to finish before submitting another."
            if limit == 1 else
            f"You already have {active_count} job(s) processing. "
            f"Wait for them to finish before submitting another."
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
        )

    # ── 1c. Free-tier feature caps (clip count / clip length) ──
    # Enforced server-side regardless of what the client sent — the
    # frontend also locks these in the UI, but this is the real gate.
    # Applied BEFORE the credits reservation below so we never reserve
    # more than a free user is even allowed to request.
    max_clips = get_max_clip_count(current_user.plan)
    if max_clips is not None:
        body.options.clip_count = min(body.options.clip_count, max_clips)

    max_clip_dur = get_max_clip_duration_seconds(current_user.plan)
    if max_clip_dur is not None:
        body.options.max_duration = min(body.options.max_duration, max_clip_dur)
        body.options.min_duration = min(body.options.min_duration, max_clip_dur)

    # ── 2. Fetch video metadata ────────────────────────────────
    try:
        video_meta = await get_video_metadata(video_id)
    except Exception as exc:
        logger.warning(f"Metadata prefetch failed for {video_id}: {exc}")
        video_meta = {"title": "", "duration": 0, "thumbnail": ""}

    video_duration_seconds = int(video_meta.get("duration", 0))

    # ── 2b. Resolve the "minutes gateway" window ───────────────
    # User-selected sub-range of the video to actually process — AI only
    # reads transcript inside this window (orchestrator.py), and billing
    # is based on the WINDOW length, not the full video. Falls back to the
    # full video if not provided, out of range, or too small to be useful.
    # Only resolvable when metadata succeeded — if it didn't, fall back to
    # the orchestrator's own duration fetch + full-video billing.
    gateway_start_seconds = 0.0
    gateway_end_seconds: float | None = None
    if video_duration_seconds > 0:
        gw_start = max(0.0, min(body.options.gateway_start, video_duration_seconds))
        gw_end = body.options.gateway_end
        gw_end = video_duration_seconds if gw_end is None else max(0.0, min(gw_end, video_duration_seconds))
        if gw_end - gw_start < MIN_GATEWAY_SECONDS:
            # Selection too small (or invalid/reversed) — use the full video
            # rather than reject the job outright over a UI/precision glitch.
            gw_start, gw_end = 0.0, video_duration_seconds
        gateway_start_seconds, gateway_end_seconds = gw_start, gw_end

    # billable_seconds is what actually gets reserved/billed below — the
    # gateway window if one was resolved, otherwise the full video.
    billable_seconds = (
        int(round(gateway_end_seconds - gateway_start_seconds))
        if gateway_end_seconds is not None
        else video_duration_seconds
    )

    # ── 2c. Auto-clamp gateway window to plan's per-video max ──
    # Instead of hard-rejecting a video that exceeds the plan's per-video cap
    # (e.g. 61-min video on free plan with 30-min cap), shrink the window to
    # `max_video_minutes` and process just that. Preserves the job, gives the
    # user their allowed slice, and mirrors reserve_credits/reserve_video_minutes'
    # "clamp what's over, don't reject" philosophy. Only fires when duration
    # is known here — worker's api_stage.py does the same clamp otherwise.
    if video_duration_seconds > 0:
        max_video_sec = get_max_video_minutes(current_user.plan) * 60
        if billable_seconds > max_video_sec:
            old_end = gateway_end_seconds
            gateway_end_seconds = gateway_start_seconds + max_video_sec
            billable_seconds = max_video_sec
            logger.info(
                f"Auto-clamped gateway window for user {current_user.user_id} "
                f"({current_user.plan} plan): [{gateway_start_seconds:.0f}s, "
                f"{old_end:.0f}s] → [{gateway_start_seconds:.0f}s, "
                f"{gateway_end_seconds:.0f}s] (plan max {max_video_sec // 60} min/video)"
            )

    # ── 2d. Minimum video length for the requested clip count ──
    # Reject outright (before reserving anything) rather than clamping —
    # unlike the plan-cap clamp above, there's no sensible smaller clip_count
    # to silently substitute here; the user asked for N clips specifically.
    if video_duration_seconds > 0:
        min_required = _min_video_seconds_for_clips(body.options.clip_count)
        if min_required > 0 and billable_seconds <= min_required:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"This video is too short for {body.options.clip_count} clips — "
                    f"needs more than {min_required // 60} min of video, "
                    f"got {billable_seconds / 60:.1f} min. Reduce the clip count or pick a longer video."
                ),
            )

    # ── 3. Reserve credits (clips) — the real gate, atomic ─────
    # Credits are billed per clip DELIVERED (see orchestrator.py), so a
    # plan advertised as "100 shorts/month" must actually cap total clips
    # at 100. reserve_credits() clamps + reserves in one atomic DB
    # transaction (FOR UPDATE row lock) so two concurrent submissions from
    # the same user can't both reserve from the same "remaining" number.
    reserved_credits = await db.reserve_credits(current_user.user_id, body.options.clip_count)
    if reserved_credits <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Monthly shorts limit reached for your plan. Resets next month — upgrade to continue.",
        )
    body.options.clip_count = reserved_credits

    # ── 3b. Reserve video-minutes (if duration is known) — also atomic ─
    # Billed against `billable_seconds` (the gateway window, if any one was
    # selected) — NOT the full video length, so windowing a long video down
    # to a short segment only costs the segment's minutes, and can also let
    # a video that'd otherwise blow the per-video cap through, since only
    # the window is ever actually downloaded/transcribed/processed.
    # Only enforced here when metadata succeeded; if it didn't, this is
    # deferred to the orchestrator's own re-check with the authoritative
    # duration (see orchestrator.py STEP 2b) — but we still must release
    # the credits reservation above if THIS gate rejects the job.
    video_minutes_reserved = 0.0
    if billable_seconds > 0:
        ok, msg, video_minutes_reserved = await db.reserve_video_minutes(
            current_user.user_id, billable_seconds, current_user.plan,
        )
        if not ok:
            await db.release_credits(current_user.user_id, reserved_credits)
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=msg)

        # reserve_video_minutes CLAMPS to whatever's left rather than
        # rejecting (e.g. user has 12 min left, window was 20 min -> only
        # 12 reserved) — shrink the actual window to match what was
        # billed, so the orchestrator/AI never reads transcript or cuts
        # clips from the unbilled tail of the original selection.
        reserved_seconds = video_minutes_reserved * 60
        if reserved_seconds < billable_seconds - 0.5:  # float-safe "less than"
            logger.info(
                f"Video-minutes clamp: user {current_user.user_id} requested "
                f"{billable_seconds:.0f}s, only {reserved_seconds:.0f}s remaining — window shrunk"
            )
            gateway_end_seconds = gateway_start_seconds + reserved_seconds
            billable_seconds = reserved_seconds

    # ── 4. Build pipeline options payload ─────────────────────
    options = body.options.model_dump()
    if video_duration_seconds > 0:
        options["prefetched_duration"] = video_duration_seconds
        options["prefetched_title"]    = video_meta.get("title", "")
        options["gateway_start"] = gateway_start_seconds
        options["gateway_end"]   = gateway_end_seconds

    options["plan"] = current_user.plan
    options["reserved_credits"] = reserved_credits
    if video_minutes_reserved > 0:
        options["video_minutes_reserved"] = video_minutes_reserved

    max_transcript_minutes = get_max_transcript_minutes_for_ai(current_user.plan)
    if max_transcript_minutes is not None:
        options["max_transcript_seconds"] = max_transcript_minutes * 60

    # ── 5. Insert job row + dispatch ──────────────────────────
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    # has_multi_region_workers() only reflects the legacy WORKER_SERVICE_URLS
    # pool (it's scoped to editor.py/admin.py's separate render-dispatch use).
    # Split-worker mode is driven by API_WORKER_URLS + FFMPEG_WORKER_URLS —
    # check those directly so job creation matches what the watcher does.
    split_worker_mode = bool(settings.API_WORKER_URLS.strip() or settings.FFMPEG_WORKER_URLS.strip())
    multi_region = split_worker_mode or has_multi_region_workers()
    initial_status = "created" if multi_region else "processing"

    # In split-worker mode, jobs always enter at the API stage. In
    # single-service mode pipeline_stage is unused (the unified
    # orchestrator runs both stages), but we still stamp it 'api' so
    # in-flight rows are consistent if the deployment is switched to
    # split-worker while jobs are alive.
    initial_pipeline_stage = "api"

    queue_payload = {
        "job_id": job_id, "user_id": current_user.user_id,
        "youtube_url": body.youtube_url, "options": options,
    } if multi_region else None

    try:
        await db._execute(
            """
            INSERT INTO jobs
              (job_id, user_id, youtube_url, status, pipeline_stage, progress,
               current_step, clip_count, reserved_video_minutes,
               queue_payload, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
            """,
            job_id,
            current_user.user_id,
            body.youtube_url,
            initial_status,
            initial_pipeline_stage,
            0,
            "Starting pipeline..." if not multi_region else "Queued...",
            body.options.clip_count,
            video_minutes_reserved,
            queue_payload,
            now,
        )
    except Exception:
        await db.release_credits(current_user.user_id, reserved_credits)
        if video_minutes_reserved > 0:
            await db.release_video_minutes(current_user.user_id, video_minutes_reserved)
        raise

    if multi_region:
        # Notify the watcher service via Postgres LISTEN/NOTIFY.
        # The watcher claims the job (FOR UPDATE SKIP LOCKED), picks the
        # least-loaded region, and dispatches to the worker. If the watcher
        # misses this notification (restart, connection blip), its poll
        # fallback picks up unclaimed 'created' rows every 15s.
        pool = await db.get_pool()
        await pool.execute("SELECT pg_notify('new_job', $1)", job_id)
        logger.info(
            f"[{job_id}] Job created + notified — user={current_user.user_id} "
            f"plan={current_user.plan} duration={video_duration_seconds}s"
        )
    else:
        asyncio.create_task(
            run_pipeline(job_id, current_user.user_id, body.youtube_url, options),
            name=f"pipeline-{job_id[:8]}",
        )
        logger.info(
            f"[{job_id}] Pipeline started — user={current_user.user_id} "
            f"plan={current_user.plan} duration={video_duration_seconds}s"
        )

    # ── 6. Return instantly ────────────────────────────────────
    return {"job_id": job_id, "status": initial_status}


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

            if job_status == "completed":
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


# ── POST /jobs/{job_id}/cancel ────────────────────────────────

@router.post("/{job_id}/cancel", status_code=200)
async def cancel_job(job_id: str, current_user: CurrentUser):
    """
    Cancel a running or pending job. Marks it as 'cancelled' and stops
    further clip processing. Already-completed clips remain.
    """
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    status_val = job.get("status")
    cancellable = {
        "created", "dispatched", "processing",
        "api_processing", "api_done", "ffmpeg_processing",
    }
    if status_val not in cancellable:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a job with status '{status_val}' "
                   f"(only jobs still in the pipeline can be cancelled)"
        )

    await db._execute(
        "UPDATE jobs SET status='cancelled', updated_at=NOW() WHERE job_id=$1",
        job_id,
    )
    logger.info(f"[{job_id}] Job cancelled by user {current_user.user_id}")
    return {"status": "cancelled", "message": f"Job {job_id} will stop processing"}


# ── DELETE /jobs/{job_id} ──────────────────────────────────────

@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(job_id: str, current_user: CurrentUser):
    """
    Delete a job and its clips/GCS files.

    Showcase-protected clips (is_showcased=TRUE, added via admin.py's
    /admin/showcase/add) survive this delete — both the DB row and the GCS
    files. If ALL of a job's clips are showcased, the job row is also kept
    so the surviving clips still have a valid parent (foreign key + admin
    "clips for this job" browsing keep working).
    """
    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")

    # Which clips are showcase-protected? Their rows + GCS files stay.
    showcased_ids = await db.get_showcased_clip_ids_for_job(job_id)

    if showcased_ids:
        # Delete only the non-showcased clip rows
        await db._execute(
            "DELETE FROM clips WHERE job_id=$1 AND is_showcased = FALSE",
            job_id,
        )
        # Job row stays so the surviving clips have a valid FK. GCS cleanup
        # is scoped to skip showcased clip files.
        asyncio.create_task(
            delete_job_from_gcs(job_id, keep_clip_ids=showcased_ids),
            name=f"gcs-cleanup-{job_id[:8]}",
        )
    else:
        # Normal path: nothing protected, wipe everything.
        await db._execute("DELETE FROM clips WHERE job_id=$1", job_id)
        await db._execute("DELETE FROM jobs  WHERE job_id=$1", job_id)
        asyncio.create_task(
            delete_job_from_gcs(job_id),
            name=f"gcs-cleanup-{job_id[:8]}",
        )


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
