"""
api_stage.py — API-side pipeline steps for the split-worker architecture.

DEPRECATED: YouTube shorts service is disabled so not useful
This module is kept for reference but YouTube clip generation is no longer active.

Runs on the "API Worker" Cloud Run service (4 vCPU + 2GB, ~12 concurrent):
  1. Extract video ID (YouTube - DISABLED)
  2. Fetch video metadata (title, duration) (YouTube - DISABLED)
  3. Resolve gateway window
  4. Reserve video-minutes (if jobs.py couldn't pre-flight due to failed prefetch)
  5. Fetch transcript + stream URL (concurrent) (YouTube - DISABLED)
  6. Apply gateway + free-tier transcript caps
  7. Run GPT viral-clip detection

On success: writes an `ffmpeg_payload` bundle onto the job row and flips
status to 'api_done' — the Postgres trigger fires pg_notify('api_done', job_id)
which wakes the watcher's FFmpeg dispatch loop.

On failure: fails the job (refund handled centrally — see fail_and_refund below).

Single-service mode: orchestrator.py calls run_api_stage() then run_ffmpeg_stage()
back-to-back in-process; the api_done → pg_notify path is skipped because the
same event loop already knows the API stage returned.
"""

import asyncio
import logging

from app.core.plan_limits import get_max_video_minutes
from app.db import supabase as db
from app.pipeline.ai_clipper import find_random_clips, find_viral_clips
from app.pipeline.stream import extract_video_id, get_stream_urls, get_video_metadata
from app.pipeline.transcript import get_transcript_with_retries
from app.pipeline.transcript_cleanup import clean_transcript

logger = logging.getLogger(__name__)


def _friendly_api_error(raw: str) -> str:
    """
    Map raw exception messages from the API stage into user-facing errors.
    Falls back to a generic message rather than surfacing a stack trace or
    a giant multi-line proxy/HTTP error to the user.
    """
    r = (raw or "").lower()

    # Transcript layer — every method failed
    if "all 3 transcript methods failed" in r or "transcriptsdisabled" in r:
        return "This video doesn't have captions available. Please pick a video with subtitles/captions enabled."

    # YouTube-side unavailability
    if "playabilitystatus" in r or "login_required" in r or "sign in to confirm" in r:
        return "YouTube is blocking access to this video right now. Try again in a few minutes, or try a different video."
    if "video_unavailable" in r or "video is unavailable" in r or "private video" in r:
        return "This video is private, deleted, or unavailable in our region."
    if "age" in r and "restrict" in r:
        return "Age-restricted videos aren't supported."

    # Rate-limit / bot detection on transcript
    if "requestblocked" in r or "ipblocked" in r or "too many requests" in r:
        return "YouTube is rate-limiting our servers. Please try again in a few minutes."

    # AI stage
    if "no suitable clip moments" in r or "no viral" in r:
        return "The AI couldn't find good highlight moments in this video. Try a longer or more engaging video."

    # OpenAI issues
    if "openai" in r or "gpt" in r:
        return "AI service is temporarily unavailable. Please try again in a moment."

    # Timeouts
    if "timed out" in r or "timeout" in r:
        return "Processing took too long. Please try again — try a shorter clip window if the issue persists."

    # Plan/quota — these come from reserve_video_minutes and are already user-friendly
    if "your" in r and ("plan" in r or "min per video" in r or "monthly" in r):
        return raw  # already user-friendly

    # Fallback — trim to the first line so we don't dump a stack
    first_line = raw.strip().split("\n", 1)[0][:200] if raw else ""
    return f"Something went wrong while processing this video. {first_line}".rstrip()

# Minimum "minutes gateway" window — mirrors jobs.py + orchestrator.py.
# Below this, a selection is treated as invalid/noise and the full video is used.
MIN_GATEWAY_SECONDS = 60

# Cap the API stage at 5 min wall-clock — well above the ~30-60s median but
# below Cloud Run's default request timeout, so a hung transcript/GPT call
# fails the stage cleanly instead of holding an instance slot forever.
API_STAGE_TIMEOUT_SECONDS = 300


async def run_api_stage(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    """
    Top-level entrypoint for the API worker. Wraps `_execute_api_stage` in
    a timeout + catch-all so a crash inside a stage step never leaks past
    this function without either (a) updating the job to 'api_done' or
    (b) failing + refunding.
    """
    try:
        await asyncio.wait_for(
            _execute_api_stage(job_id, user_id, youtube_url, options),
            timeout=API_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] API stage timed out after {API_STAGE_TIMEOUT_SECONDS}s")
        await _fail_and_refund(job_id, user_id, options, _friendly_api_error("timed out"))
    except Exception as exc:
        logger.exception(f"[{job_id}] API stage failed: {exc}")
        await _fail_and_refund(job_id, user_id, options, _friendly_api_error(str(exc)))


async def _execute_api_stage(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    await db.set_job_api_processing(job_id)
    await db.update_job_progress(job_id, 1, "Starting API stage...")

    # ── STEP 1: Extract video ID ───────────────────────────────────
    video_id = extract_video_id(youtube_url)
    if not video_id:
        raise ValueError(f"Cannot extract video ID from: {youtube_url}")

    # ── STEP 2: Video metadata ─────────────────────────────────────
    prefetched_duration = options.get("prefetched_duration", 0)
    prefetched_title    = options.get("prefetched_title", "")

    if prefetched_duration > 0:
        metadata = {"title": prefetched_title, "duration": prefetched_duration}
        await db.update_job_metadata(job_id, metadata["title"], metadata["duration"])
    else:
        await db.update_job_progress(job_id, 2, "Fetching video info...")
        metadata = await get_video_metadata(video_id, session_id=job_id)
        await db.update_job_metadata(job_id, metadata["title"], metadata["duration"])

    logger.info(f"[{job_id}] Video: '{metadata['title']}' ({metadata['duration']}s)")

    # ── STEP 2b: Resolve gateway window ────────────────────────────
    # See jobs.py for full semantics — this is the "process a sub-window of
    # a long video" feature. jobs.py resolves it against the real duration
    # when its own metadata prefetch worked; otherwise we resolve here.
    if prefetched_duration > 0:
        gateway_start = options.get("gateway_start", 0.0)
        gateway_end   = options.get("gateway_end")
    else:
        gateway_start = max(0.0, min(options.get("gateway_start", 0.0), metadata["duration"]))
        gateway_end   = options.get("gateway_end")
        gateway_end   = metadata["duration"] if gateway_end is None else max(0.0, min(gateway_end, metadata["duration"]))
        if gateway_end - gateway_start < MIN_GATEWAY_SECONDS:
            gateway_start, gateway_end = 0.0, metadata["duration"]

    billable_seconds = gateway_end - gateway_start
    is_full_video    = gateway_start == 0.0 and gateway_end == metadata["duration"]
    if not is_full_video:
        logger.info(
            f"[{job_id}] Minutes gateway: [{gateway_start:.0f}s, {gateway_end:.0f}s] "
            f"({billable_seconds:.0f}s billable)"
        )

    plan = options.get("plan", "free")

    # ── STEP 2c: Auto-clamp gateway to plan's per-video max ────────
    # Mirrors jobs.py — only fires when jobs.py's own prefetch failed and
    # deferred validation here. Clamp instead of reject so a free-plan user
    # who submitted a 61-min video still gets 30 min processed.
    if prefetched_duration <= 0:
        max_video_sec = get_max_video_minutes(plan) * 60
        if billable_seconds > max_video_sec:
            old_end = gateway_end
            gateway_end = gateway_start + max_video_sec
            billable_seconds = max_video_sec
            is_full_video = False
            logger.info(
                f"[{job_id}] Auto-clamped gateway window ({plan} plan): "
                f"[{gateway_start:.0f}s, {old_end:.0f}s] → "
                f"[{gateway_start:.0f}s, {gateway_end:.0f}s] "
                f"(plan max {max_video_sec // 60} min/video)"
            )

    # ── STEP 2d: Fallback video-minutes reservation ────────────────
    # Only runs when jobs.py couldn't pre-flight (metadata prefetch failed).
    # Same reason as orchestrator.py's version — see supabase.reserve_video_minutes.
    video_minutes_reserved = options.get("video_minutes_reserved", 0.0)
    if video_minutes_reserved <= 0:
        ok, quota_msg, video_minutes_reserved = await db.reserve_video_minutes(
            user_id, billable_seconds, plan,
        )
        if not ok:
            logger.warning(f"[{job_id}] Video-minutes reservation failed: {quota_msg}")
            await _fail_and_refund(job_id, user_id, options, quota_msg)
            return

        reserved_seconds = video_minutes_reserved * 60
        if reserved_seconds < billable_seconds - 0.5:
            logger.info(f"[{job_id}] Video-minutes clamp: window shrunk to {reserved_seconds:.0f}s")
            gateway_end      = gateway_start + reserved_seconds
            billable_seconds = reserved_seconds
            is_full_video    = False

    # Propagate the (possibly-updated) reservation back into options so it
    # ends up in ffmpeg_payload — FFmpeg stage uses it for refund accounting.
    options["video_minutes_reserved"] = video_minutes_reserved
    options["gateway_start"] = gateway_start
    options["gateway_end"]   = gateway_end

    # ── STEPS 3-4: Transcript + stream URL (concurrent) ────────────
    await db.update_job_progress(job_id, 5, "Reading transcript & connecting to stream...")
    language = options.get("language", "English")
    quality  = options.get("quality",  "1080p")
    transcript, (stream_url, audio_url, user_agent) = await asyncio.gather(
        get_transcript_with_retries(video_id, language=language, session_id=job_id),
        get_stream_urls(video_id, quality=quality, session_id=job_id),
    )

    # Restrict transcript to the gateway window BEFORE feeding it to GPT
    if not is_full_video:
        full_len = len(transcript)
        transcript = [e for e in transcript if gateway_start <= e["start"] < gateway_end]
        logger.info(f"[{job_id}] Gateway window: {len(transcript)}/{full_len} transcript entries kept")

    # Free-tier cap: only feed GPT the first N minutes of the window
    max_transcript_seconds = options.get("max_transcript_seconds")
    if max_transcript_seconds is not None:
        cutoff = gateway_start + max_transcript_seconds
        full_len = len(transcript)
        transcript = [e for e in transcript if e["start"] < cutoff]
        logger.info(
            f"[{job_id}] Free-tier transcript cap: {len(transcript)}/{full_len} "
            f"entries kept (first {max_transcript_seconds // 60} min of the window)"
        )

    # ── STEP 4b: OpenAI transcript cleanup ──────────────────────────
    # Fixes ASR/garbled-text artifacts in the transcript BEFORE it feeds
    # both GPT clip-selection below and caption burning in ffmpeg_stage.py
    # (get_clip_captions() copies entry["text"] through unmodified, so
    # cleaning it once here covers both consumers). Best-effort — falls
    # back to the original transcript on any failure, never blocks the job.
    await db.update_job_progress(job_id, 12, "Cleaning up transcript...")
    transcript = await clean_transcript(transcript, video_id=job_id)

    # ── STEP 5: Clip selection — AI (transcript available) or random fallback ──
    # transcript is [] here only after get_transcript_with_retries exhausted
    # every method + retry — a video with no captions at all, or every fetch
    # path blocked. GPT can't score or boundary-snap without transcript text,
    # so fall back to randomly-placed clips across the job's allowed window
    # instead of failing the job outright.
    if transcript:
        await db.update_job_progress(job_id, 18, "AI analyzing best moments...")
        timestamps = await find_viral_clips(transcript, options)
    else:
        logger.warning(f"[{job_id}] No transcript available — selecting random clips instead")
        await db.update_job_progress(job_id, 18, "No transcript found — selecting highlights...")
        timestamps = find_random_clips(metadata["duration"], options)

    if not timestamps:
        raise RuntimeError("Could not find any suitable clip moments in this video")

    logger.info(f"[{job_id}] {'AI' if transcript else 'Random (no transcript)'} found {len(timestamps)} clips")

    # ── STEP 6: Hand off to FFmpeg stage ───────────────────────────
    # ffmpeg_payload is the entire state the FFmpeg stage needs to run
    # WITHOUT re-doing any of the API work. If the FFmpeg worker later
    # discovers the stream_url has expired (Redis miss), it re-resolves.
    ffmpeg_payload = {
        "timestamps":     [ts.to_dict() for ts in timestamps],
        "options":        options,
        "video_metadata": metadata,
        "gateway_start":  gateway_start,
        "gateway_end":    gateway_end,
        "transcript":     transcript,
        "stream_url":     stream_url,
        "audio_url":      audio_url,
        "user_agent":     user_agent,
        "video_id":       video_id,
        "user_id":        user_id,
    }

    await db.update_job_progress(job_id, 22, "Handing off to encoding stage...")
    await db.set_job_api_done(job_id, ffmpeg_payload)
    logger.info(f"[{job_id}] API stage done — {len(timestamps)} clips queued for FFmpeg stage")


async def _fail_and_refund(
    job_id: str,
    user_id: str,
    options: dict,
    error_message: str,
) -> None:
    """
    API stage failed before handing off — refund the reservations that
    jobs.py made pre-flight (credits are per-clip requested, video-minutes
    are per gateway-window seconds).

    FFmpeg-stage failures use a similar helper in ffmpeg_stage.py — kept
    separate because ffmpeg_stage refunds based on delivered vs reserved
    (partial refund), while api_stage always refunds everything (nothing
    was delivered yet).
    """
    await db.fail_job(job_id, error_message)
    reserved_credits       = options.get("reserved_credits",       0)
    video_minutes_reserved = options.get("video_minutes_reserved", 0.0)
    if reserved_credits > 0:
        await db.release_credits(user_id, reserved_credits)
    if video_minutes_reserved > 0:
        await db.release_video_minutes(user_id, video_minutes_reserved)
