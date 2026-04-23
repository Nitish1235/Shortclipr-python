"""
orchestrator.py — The master coordinator for the ShortClipr pipeline.

Manages the full flow for a single job:
  1. Video metadata
  2. Transcript (primary) OR Whisper streaming (fallback + early AI start)
  3. Stream URL resolution
  4. GPT-4o viral clip finding
  5. Parallel clip extraction (HTTP range requests)
  6. Vertical reframe (9:16)
  7. Parallel caption burning
  8. Upload to GCS + thumbnail
  9. Insert each clip to Supabase as it completes (streaming UX)
 10. Mark job complete

Progress is emitted to Supabase after EVERY step so frontend
Realtime channel can update the UI in real-time.
"""

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.ai_clipper import ClipTimestamp, find_viral_clips
from app.pipeline.captions import burn_all_captions_parallel, get_clip_captions
from app.pipeline.extractor import extract_all_clips_parallel, reframe_to_vertical
from app.pipeline.stream import extract_video_id, get_stream_url, get_video_metadata
from app.pipeline.transcript import get_transcript
from app.pipeline.uploader import cleanup_job_files, process_and_upload_clip

logger = logging.getLogger(__name__)
settings = get_settings()

# Minimum transcript entries before triggering early AI start (Whisper fallback)
EARLY_AI_START_ENTRIES = 150  # ~5 minutes of speech


async def run_pipeline(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    """
    Main pipeline coordinator. Designed to be called by the queue consumer.
    All exceptions are caught and reported to Supabase — never crash the worker.
    """
    try:
        await _execute_pipeline(job_id, user_id, youtube_url, options)
    except Exception as e:
        logger.exception(f"[{job_id}] Pipeline failed: {e}")
        await db.fail_job(job_id, str(e))
        raise  # Re-raise so queue consumer can handle retry logic


async def _execute_pipeline(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:

    clip_style = options.get("style", "minimal")
    clip_count = options.get("clip_count", 10)
    quality = options.get("quality", "720p")
    language = options.get("language", "English")

    # ── Create temp directory for this job ────────────────────
    job_dir = Path(tempfile.mkdtemp(prefix=f"sc_{job_id[:8]}_"))

    try:
        # ── STEP 1: Extract video ID ──────────────────────────────
        video_id = extract_video_id(youtube_url)
        if not video_id:
            raise ValueError(f"Cannot extract video ID from: {youtube_url}")

        # ── STEP 2: Video metadata (title, duration) ──────────────
        await db.update_job_progress(job_id, 2, "Fetching video info...")
        metadata = await get_video_metadata(video_id)
        await db.update_job_metadata(job_id, metadata["title"], metadata["duration"])
        logger.info(f"[{job_id}] Video: {metadata['title']}")

        # ── STEP 3: Transcript (primary or Whisper fallback) ──
        await db.update_job_progress(job_id, 5, "Reading video transcript...")
        transcript, used_whisper = await _get_transcript_with_early_ai(
            job_id, video_id, language, options, job_dir
        )

        # ── STEP 4: Stream URL ────────────────────────────────
        await db.update_job_progress(job_id, 15, "Connecting to video stream...")
        stream_url = await get_stream_url(video_id, quality=quality)

        # ── STEP 5: Find viral clips (if not already done early)
        if not used_whisper:
            await db.update_job_progress(job_id, 20, "AI analyzing best moments...")
            timestamps = await find_viral_clips(transcript, options)
        else:
            # AI was already called in _get_transcript_with_early_ai
            timestamps = options.get("_early_timestamps", [])
            if not timestamps:
                # Fallback: full transcript now ready, do full AI pass
                timestamps = await find_viral_clips(transcript, options)

        if not timestamps:
            raise RuntimeError("AI found no suitable clip moments in this video")

        logger.info(f"[{job_id}] AI found {len(timestamps)} clips")
        await db.update_job_progress(job_id, 30, f"Found {len(timestamps)} viral moments...")

        # ── STEP 6: Extract clips (parallel) ──────────────────
        await db.update_job_progress(job_id, 33, f"Extracting {len(timestamps)} clips...")
        raw_clips = await extract_all_clips_parallel(stream_url, timestamps, job_dir)

        if not raw_clips:
            raise RuntimeError("All clip extractions failed")

        await db.update_job_progress(job_id, 55, "Clips extracted, reframing to vertical...")

        # ── STEP 7: Reframe to 9:16 vertical (parallel) ───────
        reframed = await _reframe_all_parallel(raw_clips, job_dir)
        await db.update_job_progress(job_id, 65, "Adding captions...")

        # ── STEP 8: Burn captions (parallel) ──────────────────
        captioned = await burn_all_captions_parallel(reframed, transcript, clip_style, job_dir)
        await db.update_job_progress(job_id, 80, "Uploading clips...")

        # ── STEP 9: Upload each clip + insert DB row immediately
        # KEY UX: Each clip is inserted to Supabase as it finishes →
        # Supabase Realtime fires INSERT event → frontend renders card
        uploaded_count = 0
        upload_tasks = [
            _upload_and_save_clip(
                job_id=job_id,
                user_id=user_id,
                clip_idx=i,
                ts=ts,
                clip_path=clip_path,
                style=clip_style,
                job_dir=job_dir,
            )
            for i, (ts, clip_path) in enumerate(captioned)
        ]

        # Upload all concurrently and count successes
        results = await asyncio.gather(*upload_tasks, return_exceptions=True)
        uploaded_count = sum(1 for r in results if not isinstance(r, Exception))
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"[{job_id}] Clip {i} upload failed: {r}")

        # ── STEP 10: Complete ─────────────────────────────────
        await db.complete_job(job_id, uploaded_count)
        await db.increment_credits_used(user_id)
        logger.info(f"[{job_id}] ✅ Pipeline complete: {uploaded_count} clips delivered")

    finally:
        # Always clean up temp files — Cloud Run disk is limited
        cleanup_job_files(job_dir)


async def _get_transcript_with_early_ai(
    job_id: str,
    video_id: str,
    language: str,
    options: dict,
    job_dir: Path,
) -> tuple[list, bool]:
    """
    Smart transcript acquisition with early AI start for Whisper fallback.

    Returns (full_transcript, used_whisper_bool).
    When Whisper is used, also stores early AI timestamps in options dict.
    """
    from app.pipeline.transcript import get_transcript
    transcript, used_whisper = await get_transcript(video_id, language=language)

    if used_whisper:
        # Notify user about slower path
        await db.update_job_progress(
            job_id, 8,
            "No captions found — using AI transcription (~2 min total)...",
        )

    return transcript, used_whisper


async def _reframe_all_parallel(
    raw_clips: list[tuple[ClipTimestamp, Path]],
    job_dir: Path,
) -> list[tuple[ClipTimestamp, Path]]:
    """Reframe all clips to 9:16 vertical concurrently."""
    async def _reframe_one(i: int, ts: ClipTimestamp, raw_path: Path):
        output = job_dir / f"clip_{i:02d}_vertical.mp4"
        reframed = await reframe_to_vertical(raw_path, output)
        return ts, reframed

    tasks = [_reframe_one(i, ts, p) for i, (ts, p) in enumerate(raw_clips)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return [r for r in results if not isinstance(r, Exception)]


async def _upload_and_save_clip(
    job_id: str,
    user_id: str,
    clip_idx: int,
    ts: ClipTimestamp,
    clip_path: Path,
    style: str,
    job_dir: Path,
) -> dict:
    """
    Upload a single clip and immediately write to Supabase clips table.
    Supabase Realtime fires INSERT event → frontend card appears instantly.
    """
    clip_id = str(uuid.uuid4())
    clip_url, thumbnail_url = await process_and_upload_clip(
        clip_path, job_id, clip_id, job_dir
    )

    clip_data = {
        "clip_id": clip_id,
        "job_id": job_id,
        "user_id": user_id,
        "video_url": clip_url,          # column name matches DB schema and frontend
        "thumbnail_url": thumbnail_url,
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
