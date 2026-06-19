"""
orchestrator.py — Master coordinator for the ShortClipr pipeline.

New two-phase clip flow (per clip, all clips run concurrently):

  Phase 1 — FAST (card appears immediately):
    DASH download clip → trim raw clip → upload raw to GCS →
    generate 360p preview → upload preview →
    Supabase INSERT (clip_ready=FALSE, preview_url set) → card visible

  Phase 2 — ENCODE (card upgrades to HD):
    detect silences + face track + captions →
    reframe + burn captions (one ffmpeg pass) →
    upload final vertical + reframed raw →
    generate + upload thumbnail →
    delete raw from GCS →
    Supabase UPDATE (clip_ready=TRUE, video_url set) → card upgrades

Progress emitted to Supabase after every major step so the frontend
Realtime channel reflects live state.
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
from app.pipeline.downloader import download_all_clips_parallel
from app.pipeline.uploader import (
    cleanup_job_files,
    delete_source_clip,
    generate_preview,
    generate_thumbnail,
    upload_clip,
    upload_preview,
    upload_raw_clip,
    upload_source_clip,
    upload_thumbnail,
)

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
    All exceptions are caught and written to Supabase — never crashes the worker.
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
    short_template  = options.get("short_template", "crop_fill")
    bar_color       = options.get("bar_color",      "#0d0d0d")
    aspect          = options.get("aspect",         "9:16")

    job_dir = Path(tempfile.mkdtemp(prefix=f"sc_{job_id[:8]}_"))

    try:
        # ── STEP 1: Extract video ID ──────────────────────────────
        video_id = extract_video_id(youtube_url)
        if not video_id:
            raise ValueError(f"Cannot extract video ID from: {youtube_url}")

        # ── STEP 2: Video metadata ────────────────────────────────
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

        # ── STEPS 3-4: Transcript + stream URL (concurrent) ───────
        await db.update_job_progress(job_id, 5, "Reading transcript & connecting to stream...")
        transcript, (stream_url, audio_url, user_agent) = await asyncio.gather(
            get_transcript(video_id, language=language, session_id=job_id),
            get_stream_urls(video_id, quality=quality, session_id=job_id),
        )

        # ── STEP 5: AI finds viral moments ────────────────────────
        await db.update_job_progress(job_id, 18, "AI analyzing best moments...")
        timestamps = await find_viral_clips(transcript, options)

        if not timestamps:
            raise RuntimeError("AI found no suitable clip moments in this video")

        logger.info(f"[{job_id}] AI found {len(timestamps)} clips")

        # ── STEP 6: Download all clips in parallel via DASH ───────
        # Each clip fetches only ~5-8 MB (its own byte range); sidx parsed once.
        await db.update_job_progress(job_id, 25, f"Downloading {len(timestamps)} clips in parallel...")
        clip_ranges = [(ts.start, ts.end) for ts in timestamps]
        source_path = None
        raw_clip_results = None

        try:
            from app.core.proxy import get_decodo_proxy
            raw_clip_results = await download_all_clips_parallel(
                stream_url, clip_ranges, job_dir,
                audio_url=audio_url, user_agent=user_agent,
                proxy_url=get_decodo_proxy(job_id),   # Decodo ISP: fixed IP per job for DASH
                max_concurrent=5,
            )
        except Exception as dash_exc:
            logger.warning(f"[{job_id}] DASH batch failed ({dash_exc}); falling back to full source")
            await db.update_job_progress(job_id, 25, "Downloading source video (fallback)...")
            source_path = await _get_source(stream_url, audio_url, user_agent, video_id, job_dir, session_id=job_id)

        await db.update_job_progress(job_id, 33, f"Clipping & publishing {len(timestamps)} previews...")

        total = len(timestamps)
        phase1_done = 0
        phase2_done = 0

        async def _process_one_clip(i: int, ts: ClipTimestamp) -> dict:
            nonlocal phase1_done, phase2_done

            # ── Trim raw clip ──────────────────────────────────────
            # Downloader writes clip_{i:02d}_raw.mp4 — use a different
            # name for the trimmed output so ffmpeg input ≠ output.
            raw_clip_path = job_dir / f"clip_{i:02d}_trimmed.mp4"

            # caption_base: the actual start of the trimmed clip content in
            # original-video time.  In the DASH path the clip starts at the
            # SIDX segment boundary (actual_start_t ≤ ts.start), which is
            # where ffmpeg's -c copy keyframe snap lands.  In the full-source
            # fallback we can't know the exact keyframe without probing, so we
            # use ts.start and accept a minor caption drift (< 1 GOP).
            caption_base: float = ts.start

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
                raw_path_dash.unlink(missing_ok=True)  # free disk: dash file no longer needed
                # The -c copy seek snapped back to actual_start_t; captions must
                # be relative to that (not ts.start) or they appear early.
                caption_base = actual_start_t
            else:
                raw_clip_path = await extract_clip(source_path, ts.start, ts.end, raw_clip_path)

            clip_id = str(uuid.uuid4())

            # ════════════════════════════════════════════════════════
            # PHASE 1 — Upload raw + preview → INSERT clip (card appears)
            # ════════════════════════════════════════════════════════
            preview_path = job_dir / f"clip_{i:02d}_preview.mp4"
            await generate_preview(raw_clip_path, preview_path)

            raw_gcs_url, preview_gcs_url = await asyncio.gather(
                upload_source_clip(raw_clip_path, job_id, clip_id),
                upload_preview(preview_path, job_id, clip_id),
            )
            preview_path.unlink(missing_ok=True)

            # INSERT — Supabase Realtime fires → card appears with 360p preview
            clip_data = {
                "clip_id":            clip_id,
                "job_id":             job_id,
                "user_id":            user_id,
                "video_url":          "",              # filled in phase 2
                "thumbnail_url":      "",              # filled in phase 2
                "raw_video_url":      "",              # filled in phase 2
                "preview_url":        preview_gcs_url,
                "clip_ready":         False,
                "duration":           ts.duration,
                "start_time":         ts.start,
                "end_time":           ts.end,
                "transcript_snippet": ts.caption_preview,
                "viral_score":        ts.viral_score,
                "top_title":          ts.title,
                "bottom_tag":         f"#{ts.title.lower().replace(' ', '')}",
                "caption_style":      clip_style,
                "ai_reason":          ts.reason,
                "captions_data":      [],              # filled in phase 2
                "editor_config":      {},
            }
            await db.insert_clip(clip_data)
            phase1_done += 1
            pct = 33 + int(30 * phase1_done / total)
            await db.update_job_progress(job_id, pct, f"Preview ready: {phase1_done}/{total} clips visible...")
            logger.info(f"[{job_id}] Clip {i} preview live (clip_id={clip_id})")

            # ════════════════════════════════════════════════════════
            # PHASE 2 — Full encode → upload → delete raw → UPDATE card to HD
            # ════════════════════════════════════════════════════════
            job_check = await db.get_job(job_id)
            if job_check and job_check.get("status") == "cancelled":
                raise RuntimeError(f"Job {job_id} cancelled")

            # caption_base is actual clip content start (actual_start_t for DASH,
            # ts.start for full-source).  All caption times are relative to it so
            # they stay in sync with the clip's PTS-0 frame.
            clip_actual_dur = ts.end - caption_base
            captions = get_clip_captions(transcript, caption_base, ts.end)
            silences, (src_w, src_h, face_track) = await asyncio.gather(
                detect_silences(raw_clip_path),
                compute_face_track(raw_clip_path, clip_actual_dur),
            )
            # silences come from the trimmed clip (PTS relative to caption_base),
            # captions are also relative to caption_base — time bases match.
            if silences:
                captions = clamp_captions_to_silence(captions, silences)
            zoom_beats = _compute_zoom_beats(captions, clip_actual_dur)

            reframed_path, captioned_path = await reframe_and_caption(
                raw_clip_path,
                job_dir / f"clip_{i:02d}_vertical.mp4",
                job_dir / f"clip_{i:02d}_captioned.mp4",
                template=short_template, bar_color=bar_color,
                zoom_beats=zoom_beats, aspect=aspect,
                captions=captions, style=clip_style, color=color_combo,
                h_align=h_align, v_align=v_align, words_per_line=words_per_line,
                hook_title=ts.title,
                face_track=face_track, src_w=src_w, src_h=src_h,
            )

            # Generate thumbnail from final vertical clip
            thumb_path = job_dir / f"clip_{i:02d}_thumb.jpg"
            await generate_thumbnail(captioned_path, thumb_path)

            # Upload final + reframed + thumbnail concurrently
            thumb_exists = thumb_path.exists() and thumb_path.stat().st_size > 0
            upload_tasks = [
                upload_clip(captioned_path, job_id, clip_id),
                upload_raw_clip(reframed_path, job_id, clip_id),
                upload_thumbnail(thumb_path, job_id, clip_id) if thumb_exists else _empty_str(),
            ]
            final_url, raw_vertical_url, thumb_url = await asyncio.gather(*upload_tasks)

            # Delete raw horizontal from GCS now that encode is done
            await delete_source_clip(job_id, clip_id)

            # UPDATE clip row → Realtime fires → card upgrades to HD vertical
            await db.update_clip_final_url(
                clip_id=clip_id,
                video_url=final_url,
                raw_video_url=raw_vertical_url,
                thumbnail_url=thumb_url,
                captions_data=captions_to_dict(captions),
            )

            phase2_done += 1
            pct = 63 + int(27 * phase2_done / total)
            await db.update_job_progress(job_id, pct, f"HD ready: {phase2_done}/{total} clips encoded...")
            logger.info(f"[{job_id}] Clip {i} HD live (clip_id={clip_id})")

            # Clean up local temp files for this clip
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
        await db.increment_credits_used(user_id)

        billed_minutes = math.ceil(metadata["duration"] / 60)
        await db.increment_video_minutes_used(user_id, billed_minutes)

        logger.info(
            f"[{job_id}] ✅ Done: {uploaded_count} clips delivered "
            f"({billed_minutes} min billed to user {user_id})"
        )

    finally:
        cleanup_job_files(job_dir)


async def _empty_str() -> str:
    return ""
