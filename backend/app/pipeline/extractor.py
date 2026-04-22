"""
extractor.py — Step 5 of the ShortClipr pipeline.

Extracts video clips from a remote CDN using FFmpeg HTTP range requests.
NEVER downloads the full video — only the exact bytes needed per clip.
All clips extracted simultaneously via asyncio.gather().
"""

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.pipeline.ai_clipper import ClipTimestamp

logger = logging.getLogger(__name__)
settings = get_settings()

# Semaphore prevents overwhelming FFmpeg or the network
_EXTRACTION_SEMAPHORE = asyncio.Semaphore(settings.MAX_CONCURRENT_CLIPS)


# ── Single clip extraction ─────────────────────────────────────

async def extract_clip(
    stream_url: str,
    start: float,
    end: float,
    output_path: Path,
) -> Path:
    """
    Extract a specific segment from a remote video URL via HTTP range request.
    Uses FFmpeg's seek-before-input (-ss before -i) for accurate keyframe seeking.
    Uses -c copy for zero re-encode speed (preserves original quality).

    Args:
        stream_url:  Direct CDN URL (googlevideo.com)
        start:       Start time in seconds
        end:         End time in seconds
        output_path: Where to save the .mp4 file

    Returns:
        output_path on success
    """
    duration = end - start
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),           # Seek BEFORE input (fast)
        "-t", str(duration),
        "-i", stream_url,
        "-c", "copy",                # No re-encode — copy codec stream
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",   # Web-optimised: moov atom at front
        str(output_path),
    ]

    async with _EXTRACTION_SEMAPHORE:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr.decode(errors="ignore")[-500:]
            raise RuntimeError(
                f"FFmpeg extraction failed for {start:.0f}-{end:.0f}s: {error_msg}"
            )

    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"Clip output missing or too small: {output_path}")

    logger.info(f"Extracted clip {start:.0f}-{end:.0f}s → {output_path.name} ({output_path.stat().st_size // 1024}KB)")
    return output_path


# ── Parallel extraction (all clips at once) ────────────────────

async def extract_all_clips_parallel(
    stream_url: str,
    timestamps: list[ClipTimestamp],
    job_dir: Path,
) -> list[tuple[ClipTimestamp, Path]]:
    """
    Extract all clips simultaneously using asyncio.gather().
    Returns list of (ClipTimestamp, output_path) tuples in order.

    The semaphore in extract_clip() prevents resource exhaustion.
    """
    async def _extract_one(i: int, ts: ClipTimestamp) -> tuple[ClipTimestamp, Path]:
        clip_id = f"clip_{i:02d}_{int(ts.start)}s"
        output_path = job_dir / f"{clip_id}_raw.mp4"
        path = await extract_clip(stream_url, ts.start, ts.end, output_path)
        return ts, path

    tasks = [_extract_one(i, ts) for i, ts in enumerate(timestamps)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out failed extractions with logging
    successful = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Clip {i} extraction failed: {result}")
        else:
            successful.append(result)

    logger.info(f"Extracted {len(successful)}/{len(timestamps)} clips successfully")
    return successful


# ── Auto-reframe: 16:9 → 9:16 vertical ────────────────────────

async def reframe_to_vertical(
    input_path: Path,
    output_path: Path,
    face_detect: bool = True,
) -> Path:
    """
    Convert 16:9 clip to 9:16 vertical format.
    If face_detect=True: uses OpenCV to detect face position and
    centres the crop on the face. Falls back to centre crop.

    Output: 1080x1920 (vertical shorts format).
    """
    crop_x, crop_y = await _detect_face_crop_position(input_path) if face_detect else (None, None)

    # Default to centre crop if face detection failed
    if crop_x is None:
        # 16:9 1080p → centre-crop to 608x1080 → scale to 1080x1920
        vf_filter = (
            "crop=608:1080:(in_w-608)/2:0,"
            "scale=1080:1920:flags=lanczos"
        )
    else:
        vf_filter = (
            f"crop=608:1080:{crop_x}:0,"
            "scale=1080:1920:flags=lanczos"
        )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", vf_filter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning(f"Reframe failed, using centre crop fallback: {stderr.decode()[-200:]}")
        return await reframe_to_vertical(input_path, output_path, face_detect=False)

    return output_path


async def _detect_face_crop_position(clip_path: Path) -> tuple[int | None, int | None]:
    """
    Run OpenCV face detection on the first frame to determine crop X position.
    Returns (crop_x, 0) or (None, None) if no face found.
    Runs in executor to avoid blocking the event loop.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _cv2_detect_face, str(clip_path))


def _cv2_detect_face(clip_path: str) -> tuple[int | None, int | None]:
    try:
        import cv2
        cap = cv2.VideoCapture(clip_path)
        cap.set(cv2.CAP_PROP_POS_MSEC, 1000)  # 1 second in
        ret, frame = cap.read()
        cap.release()
        if not ret:
            return None, None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = detector.detectMultiScale(gray, 1.1, 4)

        if len(faces) == 0:
            return None, None

        # Get largest face
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_centre_x = x + w // 2
        frame_width = frame.shape[1]

        # Calculate crop X to centre on face (clip width = 608 for 1080p source)
        crop_width = 608
        crop_x = max(0, min(face_centre_x - crop_width // 2, frame_width - crop_width))
        return int(crop_x), 0

    except ImportError:
        logger.warning("OpenCV not installed — using centre crop")
        return None, None
    except Exception as e:
        logger.warning(f"Face detection failed: {e}")
        return None, None
