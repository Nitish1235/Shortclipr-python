"""
ffmpeg_stage.py — FFmpeg-side pipeline steps for the split-worker architecture.

Runs on the "FFmpeg Worker" Cloud Run service (4 vCPU + 8GB, ~2 concurrent):
  1. Read `ffmpeg_payload` from the jobs table
  2. Re-resolve stream URL if the cached one expired (fallback safety net)
  3. DASH parallel download all clips (~5-8 MB each)
  4. Per-clip pipeline (concurrent, capped by MAX_CONCURRENT_ENCODES):
     trim → silence + face → reframe + captions → thumbnail → GCS upload → insert clip row
  5. Refund unused credits (reserved N, delivered M, refund N-M)
  6. Complete the job

Single-service mode: orchestrator.py calls run_ffmpeg_stage() right after
run_api_stage() in-process — reads the same ffmpeg_payload from the DB
row that api_stage.py just wrote there.

The stage is idempotent-ish: safe to retry from scratch if the FFmpeg
worker crashes mid-encode. Uploaded clips that landed in GCS + the clips
table before the crash stay; on retry they get re-inserted with new
clip_ids (no dedup because the pre-crash rows are still valid finished
clips — the user just gets a slightly bigger set on the rare crash-retry
case, which is better than losing clips).
"""

import asyncio
import logging
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from app.core.config import get_settings
from app.core.proxy import get_proxyseller_proxy
from app.db import supabase as db
from app.pipeline.ai_clipper import ClipTimestamp
from app.pipeline.captions import (
    captions_to_dict, clamp_captions_to_silence, detect_silences, get_clip_captions,
)
from app.pipeline.downloader import download_all_clips_parallel
from app.pipeline.extractor import (
    _compute_zoom_beats, _get_source, extract_clip, probe_clip_start_offset, reframe_and_caption,
)
from app.pipeline.face_tracker import compute_face_track
from app.pipeline.stream import get_stream_urls
from app.pipeline.uploader import (
    cleanup_job_files, generate_thumbnail,
    upload_clip, upload_raw_clip, upload_thumbnail,
)

logger = logging.getLogger(__name__)
settings = get_settings()

FFMPEG_STAGE_TIMEOUT_SECONDS = 1500   # 25 minutes — kill hung encodes

# Adaptive per-job encode cap (same rule as the pre-split orchestrator):
# solo job on this instance → full global pool; 2+ jobs → cap each to 1 to
# prevent one big job from starving another. Plain int is safe here (single-
# threaded asyncio event loop).
_ACTIVE_JOBS_ON_INSTANCE = 0


@asynccontextmanager
async def _step(job_id: str, name: str):
    """Timing + logging wrapper for a pipeline step — same shape as orchestrator's."""
    t0 = time.monotonic()
    logger.info(f"[{job_id}] -> {name} started")
    try:
        yield
    except Exception as e:
        logger.error(f"[{job_id}] x {name} FAILED after {time.monotonic() - t0:.2f}s: {e}")
        raise
    else:
        logger.info(f"[{job_id}] OK {name} completed in {time.monotonic() - t0:.2f}s")


async def run_ffmpeg_stage(job_id: str) -> None:
    """
    Top-level entrypoint for the FFmpeg worker. Reads ffmpeg_payload from
    the jobs table (written by api_stage.py) and runs the encoding pipeline.
    """
    try:
        await asyncio.wait_for(
            _execute_ffmpeg_stage(job_id),
            timeout=FFMPEG_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        msg = f"FFmpeg stage timed out after {FFMPEG_STAGE_TIMEOUT_SECONDS}s"
        logger.error(f"[{job_id}] {msg}")
        await _fail_and_refund_from_db(job_id, msg)
    except Exception as exc:
        logger.exception(f"[{job_id}] FFmpeg stage failed: {exc}")
        await _fail_and_refund_from_db(job_id, f"FFmpeg stage: {exc}")


async def _execute_ffmpeg_stage(job_id: str) -> None:
    row = await db.get_job_with_ffmpeg_payload(job_id)
    if not row:
        raise RuntimeError(f"Job {job_id} not found")
    payload = row.get("ffmpeg_payload")
    if not payload:
        raise RuntimeError(f"Job {job_id} has no ffmpeg_payload — API stage did not complete")

    # Parse payload
    user_id     = str(payload["user_id"])
    youtube_url = row["youtube_url"]
    options     = payload["options"]
    video_id    = payload["video_id"]
    metadata    = payload["video_metadata"]
    transcript  = payload["transcript"]
    stream_url  = payload.get("stream_url", "")
    audio_url   = payload.get("audio_url", "")
    user_agent  = payload.get("user_agent", "")
    timestamps  = [
        ClipTimestamp(
            start           = t["start"],
            end             = t["end"],
            title           = t["title"],
            viral_score     = t["viral_score"],
            reason          = t["reason"],
            caption_preview = t["caption_preview"],
            title_emoji     = t.get("title_emoji", ""),
        )
        for t in payload["timestamps"]
    ]

    # Options unpacking (mirror orchestrator.py)
    clip_style       = options.get("style",           "minimal")
    quality          = options.get("quality",         "1080p")
    color_combo      = options.get("color",           "white_black")
    h_align          = options.get("h_align",         "center")
    v_align          = options.get("v_align",         "bottom")
    words_per_line   = options.get("words_per_line",  3)
    short_template   = options.get("short_template",  "crop_fill")
    title_permanent  = options.get("title_permanent",  False)
    hook_title_enabled = options.get("hook_title_enabled", True)
    font             = options.get("font",            "default")
    title_color      = options.get("title_color",     "white")
    title_bg         = options.get("title_bg",        "none")
    title_bg_opacity = options.get("title_bg_opacity", 0.55)
    bar_color        = options.get("bar_color",       "#0d0d0d")
    aspect           = options.get("aspect",          "9:16")

    reserved_credits       = options.get("reserved_credits",       0)
    video_minutes_reserved = options.get("video_minutes_reserved", 0.0)

    success = False
    job_dir = Path(tempfile.mkdtemp(prefix=f"sc_{job_id[:8]}_"))

    await db.set_job_ffmpeg_processing(job_id)
    await db.update_job_progress(job_id, 25, "Encoding stage starting...")

    global _ACTIVE_JOBS_ON_INSTANCE
    _ACTIVE_JOBS_ON_INSTANCE += 1

    try:
        # ── STEP 6: Download all clips in parallel via DASH ────────
        # stream_url from ffmpeg_payload — the API stage cached it. Ranged
        # media URLs are short-lived (YouTube signs them for ~4-6 hrs) but
        # normally still valid a few minutes later when the FFmpeg stage
        # picks up. If they've expired we get an HTTP 403 and re-resolve.
        clip_ranges     = [(ts.start, ts.end) for ts in timestamps]
        source_path     = None
        raw_clip_results = None

        try:
            async with _step(job_id, f"DASH parallel download ({len(timestamps)} clips)"):
                raw_clip_results = await _dash_download_with_refresh(
                    video_id, job_id, stream_url, audio_url, user_agent,
                    clip_ranges, job_dir, quality,
                )
        except Exception as dash_exc:
            logger.warning(f"[{job_id}] DASH batch failed ({dash_exc}); falling back to full source")
            await db.update_job_progress(job_id, 25, "Downloading source video (fallback)...")
            # Re-resolve stream URL for the full-source fallback — if DASH
            # died on a 403 the cached URL is dead too.
            if not stream_url or "403" in str(dash_exc) or "Forbidden" in str(dash_exc):
                stream_url, audio_url, user_agent = await get_stream_urls(
                    video_id, quality=quality, session_id=job_id,
                )
            async with _step(job_id, "full-source fallback download"):
                source_path = await _get_source(stream_url, audio_url, user_agent, video_id, job_dir, proxy_url=get_proxyseller_proxy(job_id))

        await db.update_job_progress(job_id, 33, f"Encoding {len(timestamps)} clips...")

        total      = len(timestamps)
        clips_done = 0

        # Adaptive per-job encode cap (same logic as pre-split orchestrator)
        job_cap = settings.MAX_CONCURRENT_ENCODES if _ACTIVE_JOBS_ON_INSTANCE <= 1 else 1
        job_encode_semaphore = asyncio.Semaphore(job_cap)

        async def _process_one_clip(i: int, ts: ClipTimestamp) -> dict:
            nonlocal clips_done

            raw_clip_path = job_dir / f"clip_{i:02d}_trimmed.mp4"
            caption_base: float = ts.start   # see orchestrator.py for full explanation

            async with _step(job_id, f"clip {i} trim"):
                if raw_clip_results is not None:
                    raw_path_dash, actual_start_t = raw_clip_results[i]
                    ss_offset = max(0.0, ts.start - actual_start_t)
                    duration  = ts.end - ts.start
                    trim_cmd = [
                        "ffmpeg", "-y",
                        "-ss", str(ss_offset), "-i", str(raw_path_dash),
                        "-t", str(duration), "-c", "copy",
                        "-avoid_negative_ts", "make_zero",
                        "-movflags", "+faststart",
                        str(raw_clip_path),
                    ]
                    proc = await asyncio.create_subprocess_exec(
                        *trim_cmd,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
                    if proc.returncode != 0:
                        raise RuntimeError(f"DASH trim failed: {stderr.decode(errors='ignore')[-300:]}")
                    raw_path_dash.unlink(missing_ok=True)
                    kf_offset = await probe_clip_start_offset(raw_clip_path, duration)
                    caption_base = ts.start - kf_offset
                else:
                    raw_clip_path = await extract_clip(source_path, ts.start, ts.end, raw_clip_path)
                    kf_offset = await probe_clip_start_offset(raw_clip_path, ts.end - ts.start)
                    caption_base = ts.start - kf_offset

            clip_id = str(uuid.uuid4())

            clip_data = {
                "clip_id":            clip_id,
                "job_id":             job_id,
                "user_id":            user_id,
                "video_url":          "",
                "thumbnail_url":      "",
                "raw_video_url":      "",
                "clip_ready":         False,
                "duration":           ts.duration,
                "start_time":         ts.start,
                "end_time":           ts.end,
                "transcript_snippet": ts.caption_preview,
                "viral_score":        ts.viral_score,
                "top_title":          ts.title_with_emoji,
                "bottom_tag":         f"#{ts.title.lower().replace(' ', '')}",
                "caption_style":      clip_style,
                "ai_reason":          ts.reason,
                "captions_data":      [],
                "editor_config":      {},
            }
            await db.insert_clip(clip_data)

            job_check = await db.get_job(job_id)
            if job_check and job_check.get("status") == "cancelled":
                raise RuntimeError(f"Job {job_id} cancelled")

            clip_actual_dur = ts.end - caption_base
            captions        = get_clip_captions(transcript, caption_base, ts.end)
            async with _step(job_id, f"clip {i} silence+face detection"):
                silences, (src_w, src_h, face_track) = await asyncio.gather(
                    detect_silences(raw_clip_path),
                    compute_face_track(raw_clip_path, clip_actual_dur),
                )
            if silences:
                captions = clamp_captions_to_silence(captions, silences)
            zoom_beats = _compute_zoom_beats(captions, clip_actual_dur)

            async with _step(job_id, f"clip {i} reframe+caption encode"):
                reframed_path, captioned_path = await reframe_and_caption(
                    raw_clip_path,
                    job_dir / f"clip_{i:02d}_vertical.mp4",
                    job_dir / f"clip_{i:02d}_captioned.mp4",
                    template=short_template, bar_color=bar_color,
                    zoom_beats=zoom_beats, aspect=aspect,
                    captions=captions, style=clip_style, color=color_combo,
                    h_align=h_align, v_align=v_align, words_per_line=words_per_line,
                    hook_title=(ts.title_with_emoji if hook_title_enabled else None),
                    face_track=face_track, src_w=src_w, src_h=src_h,
                    title_permanent=title_permanent, clip_duration=clip_actual_dur,
                    font=font, title_color=title_color, title_bg=title_bg,
                    title_bg_opacity=title_bg_opacity,
                    job_semaphore=job_encode_semaphore,
                )

            thumb_path = job_dir / f"clip_{i:02d}_thumb.jpg"
            await generate_thumbnail(captioned_path, thumb_path)

            async with _step(job_id, f"clip {i} phase2 upload"):
                thumb_exists = thumb_path.exists() and thumb_path.stat().st_size > 0
                upload_tasks = [
                    upload_clip(captioned_path, job_id, clip_id),
                    upload_raw_clip(reframed_path, job_id, clip_id),
                    upload_thumbnail(thumb_path, job_id, clip_id) if thumb_exists else _empty_str(),
                ]
                final_url, raw_vertical_url, thumb_url = await asyncio.gather(*upload_tasks)

            await db.update_clip_final_url(
                clip_id=clip_id,
                video_url=final_url,
                raw_video_url=raw_vertical_url,
                thumbnail_url=thumb_url,
                captions_data=captions_to_dict(captions),
            )

            clips_done += 1
            pct = 33 + int(57 * clips_done / total)
            await db.update_job_progress(job_id, pct, f"HD ready: {clips_done}/{total} clips encoded...")
            logger.info(f"[{job_id}] Clip {i} HD live (clip_id={clip_id})")

            for p in [raw_clip_path, captioned_path, reframed_path, thumb_path]:
                p.unlink(missing_ok=True)

            return {**clip_data, "video_url": final_url}

        results = await asyncio.gather(
            *[_process_one_clip(i, ts) for i, ts in enumerate(timestamps)],
            return_exceptions=True,
        )
        uploaded_count = sum(1 for r in results if not isinstance(r, Exception))
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"[{job_id}] Clip {i} failed: {r}")

        if not uploaded_count:
            raise RuntimeError("All clip extractions failed")

        await db.update_job_progress(job_id, 90, "Finalizing...")
        await db.complete_job(job_id, uploaded_count)

        # Partial-refund: reserved N credits (one per requested clip), only
        # M delivered. Refund N-M so the user isn't billed for clips that
        # never landed. video_minutes_reserved is not refunded here — it's
        # billed against the source-video window that WAS processed.
        unused_credits = reserved_credits - uploaded_count
        if unused_credits > 0:
            await db.release_credits(user_id, unused_credits)

        success = True
        logger.info(
            f"[{job_id}] Done: {uploaded_count}/{reserved_credits} clips delivered "
            f"({video_minutes_reserved:.1f} min billed to user {user_id})"
        )

    finally:
        if not success:
            # Full refund on FFmpeg failure — nothing (or nothing complete)
            # was delivered, so the user shouldn't be charged. Same rule as
            # the pre-split orchestrator's `finally` block.
            if reserved_credits > 0:
                await db.release_credits(user_id, reserved_credits)
            if video_minutes_reserved > 0:
                await db.release_video_minutes(user_id, video_minutes_reserved)
        cleanup_job_files(job_dir)
        _ACTIVE_JOBS_ON_INSTANCE = max(0, _ACTIVE_JOBS_ON_INSTANCE - 1)


async def _dash_download_with_refresh(
    video_id: str,
    job_id: str,
    stream_url: str,
    audio_url: str,
    user_agent: str,
    clip_ranges: list[tuple[float, float]],
    job_dir: Path,
    quality: str,
) -> list:
    """
    Attempt DASH download using the cached stream URL. If it fails with a
    signature-expired signal, re-resolve once and retry. Second failure
    bubbles up so the caller can fall through to full-source download.
    """
    try:
        return await download_all_clips_parallel(
            stream_url, clip_ranges, job_dir,
            audio_url=audio_url, user_agent=user_agent,
            proxy_url=get_proxyseller_proxy(job_id),
            max_concurrent=5,
        )
    except Exception as exc:
        exc_str = str(exc)
        looks_expired = (
            "403" in exc_str or "Forbidden" in exc_str or
            "expired" in exc_str.lower() or "signature" in exc_str.lower()
        )
        if not looks_expired or not stream_url:
            raise

        logger.info(f"[{job_id}] Cached stream URL rejected — re-resolving")
        stream_url, audio_url, user_agent = await get_stream_urls(
            video_id, quality=quality, session_id=job_id,
        )
        return await download_all_clips_parallel(
            stream_url, clip_ranges, job_dir,
            audio_url=audio_url, user_agent=user_agent,
            proxy_url=get_proxyseller_proxy(job_id),
            max_concurrent=5,
        )


async def _fail_and_refund_from_db(job_id: str, error_message: str) -> None:
    """
    FFmpeg stage failed before delivering any clips. Look up the row so we
    can find the user + reservation and refund. Called for exceptions that
    escaped the main try/finally above (timeouts, or errors reading the
    ffmpeg_payload in the first place).
    """
    await db.fail_job(job_id, error_message)
    row = await db.get_job(job_id)
    if not row:
        return
    user_id                = str(row["user_id"])
    reserved_credits       = int(row.get("clip_count") or 0)
    video_minutes_reserved = float(row.get("reserved_video_minutes") or 0)
    if reserved_credits > 0:
        await db.release_credits(user_id, reserved_credits)
    if video_minutes_reserved > 0:
        await db.release_video_minutes(user_id, video_minutes_reserved)


async def _empty_str() -> str:
    return ""
