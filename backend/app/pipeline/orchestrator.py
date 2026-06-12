"""
orchestrator.py — The master coordinator for the ShortClipr pipeline.

Manages the full flow for a single job:
  1. Video metadata
  2. Transcript via InnerTube captions
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
import math
import tempfile
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.ai_clipper import ClipTimestamp, find_viral_clips
from app.pipeline.captions import burn_all_captions_parallel, captions_to_dict, get_clip_captions
from app.pipeline.extractor import extract_all_clips_parallel, reframe_to_vertical
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

        # ── STEP 6: Extract clips (parallel) ──────────────────
        await db.update_job_progress(job_id, 33, f"Extracting {len(timestamps)} clips...")
        raw_clips = await extract_all_clips_parallel(stream_url, timestamps, job_dir, session_id=job_id, audio_url=audio_url, user_agent=user_agent, video_id=video_id)

        if not raw_clips:
            raise RuntimeError("All clip extractions failed")

        await db.update_job_progress(job_id, 55, "Clips extracted, reframing to vertical...")

        # ── STEP 7: Reframe to chosen aspect ratio (parallel) ─
        reframed = await _reframe_all_parallel(
            raw_clips, job_dir,
            template=short_template, bar_color=bar_color, aspect=aspect,
        )
        await db.update_job_progress(job_id, 65, "Adding captions...")

        # ── STEP 8: Burn captions (parallel) ──────────────────
        # Pre-compute phrase-level caption timing for each clip (used both
        # for burning and saved alongside the clip for editor preview).
        raw_path_by_ts = {id(ts): raw_path for ts, raw_path in reframed}
        captions_by_ts = {
            id(ts): get_clip_captions(transcript, ts.start, ts.end)
            for ts, _ in reframed
        }

        captioned = await burn_all_captions_parallel(
            reframed, transcript, clip_style, job_dir,
            color=color_combo, h_align=h_align, v_align=v_align,
            words_per_line=words_per_line,
        )
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
                raw_path=raw_path_by_ts.get(id(ts)),
                captions=captions_by_ts.get(id(ts), []),
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



async def _reframe_all_parallel(
    raw_clips: list[tuple[ClipTimestamp, Path]],
    job_dir:   Path,
    template:  str = "blur_bg",
    bar_color: str = "#0d0d0d",
    aspect:    str = "9:16",
) -> list[tuple[ClipTimestamp, Path]]:
    """Reframe all clips to the chosen aspect ratio concurrently."""
    async def _reframe_one(i: int, ts: ClipTimestamp, raw_path: Path):
        output = job_dir / f"clip_{i:02d}_vertical.mp4"
        reframed = await reframe_to_vertical(
            raw_path, output,
            template=template, bar_color=bar_color, aspect=aspect,
        )
        return ts, reframed

    tasks = [_reframe_one(i, ts, p) for i, (ts, p) in enumerate(raw_clips)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    ok = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.error(f"Reframe clip {i} failed: {r}")
        else:
            ok.append(r)
    return ok


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
