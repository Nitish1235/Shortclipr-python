"""
orchestrator.py — The master coordinator for the ShortClipr pipeline.

Manages the full flow for a single job:
  1. Video metadata
  2. Transcript via InnerTube captions
  3. Stream URL resolution
  4. GPT-4o viral clip finding
  5. Download source video (parallel ranged HTTP, falling back to
     sequential ffmpeg / yt-dlp — see extractor._get_source)
  6. Per-clip pipeline, all clips run concurrently:
       extract clip -> reframe + burn captions (one ffmpeg pass) ->
       upload to GCS + thumbnail -> insert clip row in Supabase
       (streaming UX — each clip appears as soon as it's ready)
  7. Mark job complete

Progress is emitted to Supabase after EVERY step so frontend
Realtime channel can update the UI in real-time.
"""

import asyncio
import logging
import math
import tempfile
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.ai_clipper import ClipTimestamp, find_viral_clips
from app.pipeline.captions import (
    captions_to_dict, clamp_captions_to_silence, detect_silences, get_clip_captions,
)
from app.pipeline.extractor import _compute_zoom_beats, _get_source, extract_clip, reframe_and_caption
from app.pipeline.face_tracker import compute_face_track
from app.pipeline.stream import extract_video_id, get_stream_urls, get_video_metadata
from app.pipeline.transcript import get_transcript
from app.pipeline.uploader import cleanup_job_files, process_and_upload_clip

logger = logging.getLogger(__name__)
settings = get_settings()


PIPELINE_TIMEOUT_SECONDS = 1200   # 20 minutes — kill hung jobs

async def run_pipeline(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    """
    Main pipeline coordinator. Hard timeout of 20 minutes.
    All exceptions caught and written to Supabase — never crashes the worker.
    """
    try:
        await asyncio.wait_for(
            _execute_pipeline(job_id, user_id, youtube_url, options),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        msg = f"Pipeline timed out after {PIPELINE_TIMEOUT_SECONDS}s"
        logger.error(f"[{job_id}] {msg}")
        await db.fail_job(job_id, msg)
    except Exception as e:
        logger.exception(f"[{job_id}] Pipeline failed: {e}")
        await db.fail_job(job_id, str(e))


async def _execute_pipeline(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:

    clip_style      = options.get("style",          "minimal")
    clip_count      = options.get("clip_count",     10)
    quality         = options.get("quality",        "1080p")
    language        = options.get("language",       "English")
    color_combo     = options.get("color",          "white_black")
    h_align         = options.get("h_align",        "center")
    v_align         = options.get("v_align",        "bottom")
    words_per_line  = options.get("words_per_line", 3)
    short_template  = options.get("short_template", "blur_bg")
    bar_color       = options.get("bar_color",      "#0d0d0d")
    aspect          = options.get("aspect",         "9:16")

    # ── Create temp directory for this job ────────────────────
    job_dir = Path(tempfile.mkdtemp(prefix=f"sc_{job_id[:8]}_"))

    try:
        # ── STEP 1: Extract video ID ──────────────────────────────
        video_id = extract_video_id(youtube_url)
        if not video_id:
            raise ValueError(f"Cannot extract video ID from: {youtube_url}")

        # ── STEP 2: Video metadata (title, duration) ──────────────
        # jobs.py does a pre-flight metadata fetch and passes the result
        # via options to avoid a second InnerTube round-trip.
        prefetched_duration = options.get("prefetched_duration", 0)
        prefetched_title    = options.get("prefetched_title", "")

        if prefetched_duration > 0:
            metadata = {
                "title":     prefetched_title,
                "duration":  prefetched_duration,
                "thumbnail": "",
            }
            await db.update_job_metadata(job_id, metadata["title"], metadata["duration"])
            logger.info(f"[{job_id}] Video (prefetched): '{metadata['title']}' ({metadata['duration']}s)")
        else:
            await db.update_job_progress(job_id, 2, "Fetching video info...")
            metadata = await get_video_metadata(video_id, session_id=job_id)
            await db.update_job_metadata(job_id, metadata["title"], metadata["duration"])
            logger.info(f"[{job_id}] Video: '{metadata['title']}' ({metadata['duration']}s)")

        # ── STEP 3: Transcript via InnerTube captions ────────────
        await db.update_job_progress(job_id, 5, "Reading video transcript...")
        transcript = await get_transcript(video_id, language=language, session_id=job_id)

        # ── STEP 4: Stream URL ────────────────────────────────
        await db.update_job_progress(job_id, 15, "Connecting to video stream...")
        stream_url, audio_url, user_agent = await get_stream_urls(video_id, quality=quality, session_id=job_id)

        # ── STEP 5: Find viral clips ──────────────────────────
        await db.update_job_progress(job_id, 20, "AI analyzing best moments...")
        timestamps = await find_viral_clips(transcript, options)

        if not timestamps:
            raise RuntimeError("AI found no suitable clip moments in this video")

        logger.info(f"[{job_id}] AI found {len(timestamps)} clips")
        await db.update_job_progress(job_id, 30, f"Found {len(timestamps)} viral moments...")

        # ── STEPS 6-9: Per-clip pipeline (extract → reframe+caption →
        # upload + insert DB row), all clips pipelined concurrently so
        # the first clip can land long before the last one finishes
        # extraction.
        await db.update_job_progress(job_id, 33, f"Processing {len(timestamps)} clips...")

        source_path = await _get_source(
            stream_url, audio_url, user_agent, video_id, job_dir, session_id=job_id,
        )

        total = len(timestamps)
        completed = 0

        async def _process_one_clip(i: int, ts: ClipTimestamp) -> dict:
            nonlocal completed
            try:
                # Check if job was cancelled before starting this clip
                job = await db.get_job(job_id)
                if job and job.get("status") == "cancelled":
                    raise RuntimeError(f"Job {job_id} was cancelled by user")

                raw_clip_path = await extract_clip(
                    source_path, ts.start, ts.end, job_dir / f"clip_{i:02d}_raw.mp4"
                )
                captions = get_clip_captions(transcript, ts.start, ts.end)
                silences, (src_w, src_h, face_track) = await asyncio.gather(
                    detect_silences(raw_clip_path),
                    compute_face_track(raw_clip_path, ts.duration),
                )
                if silences:
                    captions = clamp_captions_to_silence(captions, silences)
                zoom_beats = _compute_zoom_beats(captions, ts.duration)
                reframed_path, captioned_path = await reframe_and_caption(
                    raw_clip_path,
                    job_dir / f"clip_{i:02d}_vertical.mp4",
                    job_dir / f"clip_{i:02d}_captioned.mp4",
                    template=short_template, bar_color=bar_color, zoom_beats=zoom_beats, aspect=aspect,
                    captions=captions, style=clip_style, color=color_combo,
                    h_align=h_align, v_align=v_align, words_per_line=words_per_line,
                    hook_title=ts.title,
                    face_track=face_track, src_w=src_w, src_h=src_h,
                )
                return await _upload_and_save_clip(
                    job_id=job_id, user_id=user_id, clip_idx=i, ts=ts,
                    clip_path=captioned_path, raw_path=reframed_path,
                    captions=captions, style=clip_style, job_dir=job_dir,
                )
            finally:
                completed += 1
                pct = 30 + int(60 * completed / total)
                await db.update_job_progress(job_id, pct, f"Processed {completed}/{total} clips...")

        results = await asyncio.gather(
            *[_process_one_clip(i, ts) for i, ts in enumerate(timestamps)],
            return_exceptions=True,
        )
        uploaded_count = sum(1 for r in results if not isinstance(r, Exception))
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"[{job_id}] Clip {i} pipeline failed: {r}")

        if not uploaded_count:
            raise RuntimeError("All clip extractions failed")

        await db.update_job_progress(job_id, 90, "Finalizing...")

        # ── STEP 10: Complete ─────────────────────────────────
        await db.complete_job(job_id, uploaded_count)
        await db.increment_credits_used(user_id)

        # Bill video minutes — ceiling to nearest minute
        billed_minutes = math.ceil(metadata["duration"] / 60)
        await db.increment_video_minutes_used(user_id, billed_minutes)

        logger.info(
            f"[{job_id}] ✅ Pipeline complete: {uploaded_count} clips delivered "
            f"({billed_minutes} min billed to user {user_id})"
        )

    finally:
        # Always clean up temp files — Cloud Run disk is limited
        cleanup_job_files(job_dir)



async def _upload_and_save_clip(
    job_id: str,
    user_id: str,
    clip_idx: int,
    ts: ClipTimestamp,
    clip_path: Path,
    raw_path: Path | None,
    captions: list,
    style: str,
    job_dir: Path,
) -> dict:
    """
    Upload a single clip and immediately write to Supabase clips table.
    Supabase Realtime fires INSERT event → frontend card appears instantly.
    """
    clip_id = str(uuid.uuid4())
    clip_url, thumbnail_url, raw_url = await process_and_upload_clip(
        clip_path, job_id, clip_id, job_dir, raw_path=raw_path,
    )

    clip_data = {
        "clip_id": clip_id,
        "job_id": job_id,
        "user_id": user_id,
        "video_url": clip_url,          # column name matches DB schema and frontend
        "thumbnail_url": thumbnail_url,
        "raw_video_url": raw_url,       # reframed-but-uncaptioned clip (for re-render)
        "captions_data": captions_to_dict(captions),  # phrase-level timing for editor preview
        "duration": ts.duration,
        "start_time": ts.start,
        "end_time": ts.end,
        "transcript_snippet": ts.caption_preview,
        "viral_score": ts.viral_score,
        "top_title": ts.title,
        "bottom_tag": f"#{ts.title.lower().replace(' ', '')}",
        "caption_style": style,
        "ai_reason": ts.reason,  # The AI explanation shown per clip
    }

    await db.insert_clip(clip_data)  # Triggers Supabase Realtime INSERT
    logger.info(f"[{job_id}] Clip {clip_idx} live → viral_score={ts.viral_score}")
    return clip_data
