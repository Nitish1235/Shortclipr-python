"""
brainrot_gameplay.py — admin gameplay-source processing (Phase 3).

Takes one admin-uploaded raw gameplay recording and turns it into the
selectable ≤120s background clips the creator picks from:

  1. Reject the first 30s (recording start / unstable footage) when the
     source is long enough to spare it.
  2. Split the rest into ≤120s chunks (the creator's max clip length).
  3. Reframe each chunk to the 1080x1920 canvas with the SAME scale-cover +
     center-crop math as brainrot_composite._base_crop_filter (one look
     everywhere), drop audio (brainrot uses TTS + music, never the gameplay's
     own audio), and grab a poster thumbnail.
  4. Upload each clip + thumbnail to the brainrot bucket and insert a
     brainrot_gameplay_clips row.

Runs in-process as a background task (admin-only, infrequent — same
create_task pattern as the single-service brainrot stage). In-memory progress
is exposed via get_status() for the admin UI to poll. If this ever needs to
move off the API instance, dispatch it to the ffmpeg worker like the Test Lab
does — the processing function is already self-contained.
"""
import asyncio
import logging
import math
import uuid
from pathlib import Path

from app.db import supabase as db
from app.pipeline.uploader import upload_gameplay_clip, upload_gameplay_thumbnail

logger = logging.getLogger(__name__)

CANVAS_W, CANVAS_H = 1080, 1920
SKIP_HEAD_SECONDS = 30.0      # reject unstable intro footage when we can spare it
CHUNK_SECONDS = 120.0         # creator's max clip length
MIN_TRAILING_SECONDS = 5.0    # drop a final sliver shorter than this
MAX_CLIPS_PER_SOURCE = 30     # runaway guard
_REFRAME = f"scale={CANVAS_W}:{CANVAS_H}:force_original_aspect_ratio=increase:flags=bicubic,crop={CANVAS_W}:{CANVAS_H}"

# source_id -> {status, total, done, error}
_status: dict[str, dict] = {}


def get_status(source_id: str) -> dict | None:
    return _status.get(source_id)


async def _ffprobe_duration(path: Path) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {err.decode()[-200:]}")
    return float(out.decode().strip())


def _plan_chunks(duration: float) -> list[tuple[float, float]]:
    """Return [(start, chunk_duration), ...] after skipping the head and
    splitting into ≤CHUNK_SECONDS pieces, dropping a tiny trailing sliver."""
    start0 = SKIP_HEAD_SECONDS if duration > (SKIP_HEAD_SECONDS + 10) else 0.0
    usable = duration - start0
    if usable < MIN_TRAILING_SECONDS:
        return [(0.0, min(duration, CHUNK_SECONDS))]  # too short to trim — use as-is
    n = min(MAX_CLIPS_PER_SOURCE, math.ceil(usable / CHUNK_SECONDS))
    chunks: list[tuple[float, float]] = []
    for i in range(n):
        s = start0 + i * CHUNK_SECONDS
        d = min(CHUNK_SECONDS, duration - s)
        if d >= MIN_TRAILING_SECONDS:
            chunks.append((s, d))
    return chunks


async def _run(cmd: list[str], what: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"{what} failed: {err.decode()[-400:]}")


async def process_gameplay_source(source_id: str, local_path: Path, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one source. Updates _status as it goes and
    the brainrot_gameplay_sources row at the end."""
    try:
        duration = await _ffprobe_duration(local_path)
        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        logger.info(f"[gameplay {source_id}] {duration:.1f}s → {len(chunks)} clip(s)")

        made = 0
        for start, dur in chunks:
            clip_id = uuid.uuid4().hex[:12]
            clip_path = tmp_dir / f"{clip_id}.mp4"
            thumb_path = tmp_dir / f"{clip_id}.jpg"

            await _run([
                "ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(local_path), "-t", f"{dur:.2f}",
                "-vf", f"{_REFRAME},fps=30", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-threads", "1", str(clip_path),
            ], "gameplay reframe")

            await _run([
                "ffmpeg", "-y", "-ss", f"{start + dur / 2:.2f}", "-i", str(local_path),
                "-vf", _REFRAME, "-frames:v", "1", str(thumb_path),
            ], "gameplay thumbnail")

            clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
            thumb_url = None
            try:
                thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
            except Exception as e:
                logger.warning(f"[gameplay {source_id}] thumbnail upload failed: {e}")

            await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, dur)
            made += 1
            _status[source_id]["done"] = made
            clip_path.unlink(missing_ok=True)
            thumb_path.unlink(missing_ok=True)

        if made == 0:
            raise RuntimeError("No usable clips produced from source")

        await db.set_gameplay_source_status(source_id, "ready")
        _status[source_id]["status"] = "ready"
        logger.info(f"[gameplay {source_id}] ready — {made} clip(s)")
    except Exception as e:
        logger.exception(f"[gameplay {source_id}] processing failed")
        _status[source_id] = {**_status.get(source_id, {"total": 0, "done": 0}), "status": "failed", "error": str(e)[:300]}
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass


async def process_gameplay_source_youtube(source_id: str, video_id: str, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one YouTube source via DASH.
    Skips downloading the full video by using DASH segment extraction."""
    from app.pipeline.stream import get_stream_urls
    from app.pipeline.extractor import get_clip_via_dash

    try:
        # Get duration
        import yt_dlp
        loop = asyncio.get_running_loop()
        def _get_duration():
            opts = {'quiet': True, 'noplaylist': True}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                return float(info.get('duration', 0))
                
        duration = await loop.run_in_executor(None, _get_duration)
        
        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        logger.info(f"[gameplay-yt {source_id}] {duration:.1f}s → {len(chunks)} clip(s)")
        
        # We only want video, but get_stream_urls might try audio.
        stream_url, _, user_agent = await get_stream_urls(video_id, quality="1080p")
        
        made = 0
        for start, dur in chunks:
            clip_id = uuid.uuid4().hex[:12]
            clip_raw = tmp_dir / f"{clip_id}_raw.mp4"
            clip_path = tmp_dir / f"{clip_id}.mp4"
            thumb_path = tmp_dir / f"{clip_id}.jpg"
            
            # Fetch clip snippet via DASH securely directly from youtube
            await get_clip_via_dash(stream_url, start, start + dur, clip_raw, audio_url=None, user_agent=user_agent)
            
            # Reframe properly
            await _run([
                "ffmpeg", "-y", "-i", str(clip_raw),
                "-vf", f"{_REFRAME},fps=30", "-an",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-threads", "1", str(clip_path),
            ], "gameplay reframe")
            
            # Generate thumbnail
            await _run([
                "ffmpeg", "-y", "-ss", f"{dur / 2:.2f}", "-i", str(clip_raw),
                "-vf", _REFRAME, "-frames:v", "1", str(thumb_path),
            ], "gameplay thumbnail")

            clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
            thumb_url = None
            try:
                thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
            except Exception as e:
                logger.warning(f"[gameplay-yt {source_id}] thumbnail upload failed: {e}")

            await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, dur)
            made += 1
            _status[source_id]["done"] = made
            clip_raw.unlink(missing_ok=True)
            clip_path.unlink(missing_ok=True)
            thumb_path.unlink(missing_ok=True)

        if made == 0:
            raise RuntimeError("No usable clips produced from YouTube source")

        await db.set_gameplay_source_status(source_id, "ready")
        _status[source_id]["status"] = "ready"
        logger.info(f"[gameplay-yt {source_id}] ready — {made} clip(s)")
            
    except Exception as e:
        logger.exception(f"[gameplay-yt {source_id}] processing failed")
        _status[source_id] = {**_status.get(source_id, {"total": 0, "done": 0}), "status": "failed", "error": str(e)[:300]}
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass
