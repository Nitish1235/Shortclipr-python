"""
test_pipeline.py — Admin Test Lab pipeline.

Generates a fixed batch of 22 clips from a YouTube video for QA purposes:
  - No AI viral scoring — clips are sequential ~30s segments starting from
    the beginning of the video, snapped to transcript line boundaries
    (see ai_clipper.find_sequential_clips).
  - Clips 0-10:  ALL 11 caption styles, one per clip, same reframe template.
  - Clips 11-21: ALL 11 reframe templates, one per clip, same caption style.

Each finished clip is uploaded to GCS under job_id = "test_<hex>" so it
shows up in the normal clips/{job_id}/ prefix and is browsable via
GET /admin/gcs/clips alongside real jobs.

Progress is tracked in-memory (admin-only, single-flight tool — no DB row
needed) and polled via GET /admin/test/jobs/{job_id}.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from app.core.proxy import use_decodo_proxy
from app.pipeline.ai_clipper import find_sequential_clips
from app.pipeline.captions import VALID_STYLES, detect_silences, get_clip_captions
from app.pipeline.extractor import VALID_TEMPLATES, _compute_zoom_beats, _get_source, extract_clip, reframe_and_caption
from app.pipeline.face_tracker import compute_face_track
from app.pipeline.stream import extract_video_id, get_stream_urls, get_video_metadata
from app.pipeline.transcript import get_transcript
from app.pipeline.uploader import cleanup_job_files, process_and_upload_clip

logger = logging.getLogger(__name__)

SEGMENT_DURATION  = 30
DEFAULT_TEMPLATE  = "crop_fill"
DEFAULT_STYLE     = "minimal"
TOTAL_CLIPS       = len(VALID_STYLES) + len(VALID_TEMPLATES)

# In-memory progress tracking — admin test lab only, no DB persistence needed.
_test_jobs: dict[str, dict] = {}


def get_test_job(job_id: str) -> dict | None:
    return _test_jobs.get(job_id)


async def run_test_pipeline(job_id: str, youtube_url: str, quality: str = "1080p") -> None:
    job = _test_jobs[job_id] = {
        "job_id": job_id,
        "status": "processing",
        "progress": 0,
        "current_step": "Starting...",
        "video_title": "",
        "total_clips": TOTAL_CLIPS,
        "clips": [],
        "error": None,
    }

    job_dir = Path(tempfile.mkdtemp(prefix=f"admtest_{job_id[-8:]}_"))
    try:
        # Admin Test Lab uses the Decodo proxy pool instead of proxy-cheap —
        # does not affect the user-facing pipeline (orchestrator.py).
        use_decodo_proxy()

        video_id = extract_video_id(youtube_url)
        if not video_id:
            raise ValueError(f"Cannot extract video ID from: {youtube_url}")

        job["current_step"] = "Fetching video info..."
        metadata = await get_video_metadata(video_id, session_id=job_id)
        job["video_title"] = metadata.get("title", "")

        job["current_step"] = "Reading transcript..."
        transcript = await get_transcript(video_id, language="English", session_id=job_id)

        job["current_step"] = "Resolving video stream..."
        stream_url, audio_url, user_agent = await get_stream_urls(video_id, quality=quality, session_id=job_id)

        job["current_step"] = "Building sequential 30s segments..."
        timestamps = find_sequential_clips(transcript, segment_duration=SEGMENT_DURATION, count=TOTAL_CLIPS)
        if not timestamps:
            raise RuntimeError("Could not build sequential segments from transcript")

        job["progress"] = 10
        job["current_step"] = "Downloading source video..."
        source_path = await _get_source(stream_url, audio_url, user_agent, video_id, job_dir, session_id=job_id)

        job["progress"] = 25
        n = len(timestamps)

        for i, ts in enumerate(timestamps):
            if i < len(VALID_STYLES):
                template = DEFAULT_TEMPLATE
                style    = VALID_STYLES[i]
                phase    = "caption_style"
                label    = f"caption_{style}"
            else:
                template = VALID_TEMPLATES[i - len(VALID_STYLES)]
                style    = DEFAULT_STYLE
                phase    = "short_template"
                label    = f"template_{template}"

            job["current_step"] = f"[{i + 1}/{n}] {phase}={label.split('_', 1)[1]}"

            try:
                raw_path = await extract_clip(source_path, ts.start, ts.end, job_dir / f"clip_{i:02d}_raw.mp4")
                clip_dur = ts.end - ts.start
                captions = get_clip_captions(transcript, ts.start, ts.end)
                silences, (src_w, src_h, face_track) = await asyncio.gather(
                    detect_silences(raw_path),
                    compute_face_track(raw_path, clip_dur),
                )
                zoom_beats = _compute_zoom_beats(captions, clip_dur)
                vertical_path = job_dir / f"clip_{i:02d}_vertical.mp4"
                final_path = job_dir / f"clip_{i:02d}_final.mp4"
                _, captioned_path = await reframe_and_caption(
                    raw_path, vertical_path, final_path,
                    template=template, bar_color="#0d0d0d",
                    zoom_beats=zoom_beats,
                    captions=captions, style=style,
                    face_track=face_track, src_w=src_w, src_h=src_h,
                )

                clip_id = f"{i:02d}_{label}"
                clip_url, thumb_url, _raw_url = await process_and_upload_clip(captioned_path, job_id, clip_id, job_dir)

                job["clips"].append({
                    "index": i,
                    "phase": phase,
                    "label": label,
                    "template": template,
                    "style": style,
                    "start": ts.start,
                    "end": ts.end,
                    "video_url": clip_url,
                    "thumbnail_url": thumb_url,
                    "error": None,
                })
            except Exception as exc:
                logger.error(f"[{job_id}] clip {i} ({label}) failed: {exc}")
                job["clips"].append({
                    "index": i,
                    "phase": phase,
                    "label": label,
                    "template": template,
                    "style": style,
                    "start": ts.start,
                    "end": ts.end,
                    "video_url": None,
                    "thumbnail_url": None,
                    "error": str(exc)[:300],
                })

            job["progress"] = 25 + int(75 * (i + 1) / n)

        job["status"] = "completed"
        job["progress"] = 100
        job["current_step"] = "Done"
        ok = sum(1 for c in job["clips"] if not c["error"])
        logger.info(f"[{job_id}] Test batch complete: {ok}/{n} clips succeeded")

    except Exception as exc:
        logger.exception(f"[{job_id}] Test pipeline failed: {exc}")
        job["status"] = "failed"
        job["error"] = str(exc)
    finally:
        cleanup_job_files(job_dir)
