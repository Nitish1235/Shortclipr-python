"""
uploader.py — Step 7 of the ShortClipr pipeline.

Uploads processed clips + thumbnails to Google Cloud Storage.
Generates a thumbnail for every clip via FFmpeg (frame at 1 second).
Cleans up local /tmp files after successful upload.
"""

import asyncio
import logging
import uuid
from pathlib import Path

from google.cloud import storage

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# GCS client — initialised once (thread-safe)
_gcs_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = storage.Client()
    return _gcs_client


def _public_url(blob_name: str) -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.GCS_BUCKET_NAME}/{blob_name}"


# ── Thumbnail generation ───────────────────────────────────────

async def generate_thumbnail(clip_path: Path, output_path: Path) -> Path:
    """
    Extract a single frame at 1 second from the clip.
    Produces a JPEG thumbnail at 540x960 (9:16).
    """
    cmd = [
        "ffmpeg", "-y",
        "-ss", "1",
        "-i", str(clip_path),
        "-vframes", "1",
        "-vf", "scale=540:960:force_original_aspect_ratio=decrease,"
               "pad=540:960:(ow-iw)/2:(oh-ih)/2",
        "-q:v", "3",
        str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning(f"Thumbnail generation failed: {stderr.decode()[-200:]}")
        # Don't raise — thumbnail failure shouldn't block clip delivery
    return output_path


# ── GCS Upload ─────────────────────────────────────────────────

async def upload_clip(
    local_path: Path,
    job_id: str,
    clip_id: str,
) -> str:
    """
    Upload clip MP4 to GCS. Returns public URL.
    Runs GCS upload in executor (blocking I/O).
    """
    blob_name = f"clips/{job_id}/{clip_id}.mp4"
    url = await asyncio.get_event_loop().run_in_executor(
        None,
        _upload_to_gcs,
        local_path,
        blob_name,
        "video/mp4",
    )
    logger.info(f"Uploaded clip → {url}")
    return url


async def upload_thumbnail(
    local_path: Path,
    job_id: str,
    clip_id: str,
) -> str:
    """Upload thumbnail JPEG to GCS. Returns public URL."""
    blob_name = f"thumbnails/{job_id}/{clip_id}.jpg"
    return await asyncio.get_event_loop().run_in_executor(
        None,
        _upload_to_gcs,
        local_path,
        blob_name,
        "image/jpeg",
    )


def _upload_to_gcs(local_path: Path, blob_name: str, content_type: str) -> str:
    """Synchronous GCS upload — called in executor."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(
        str(local_path),
        content_type=content_type,
    )
    blob.make_public()
    return blob.public_url


# ── Full clip processing: upload + thumbnail ───────────────────

async def process_and_upload_clip(
    clip_path: Path,
    job_id: str,
    clip_id: str,
    tmp_dir: Path,
) -> tuple[str, str]:
    """
    1. Generate thumbnail
    2. Upload clip to GCS
    3. Upload thumbnail to GCS
    4. Return (clip_url, thumbnail_url)
    """
    thumb_path = tmp_dir / f"{clip_id}_thumb.jpg"

    # Thumbnail + upload happen concurrently
    await generate_thumbnail(clip_path, thumb_path)
    clip_url, thumb_url = await asyncio.gather(
        upload_clip(clip_path, job_id, clip_id),
        upload_thumbnail(thumb_path, job_id, clip_id) if thumb_path.exists() else asyncio.sleep(0),
    )
    return clip_url, thumb_url if thumb_path.exists() else ""


# ── Cleanup ────────────────────────────────────────────────────

def cleanup_job_files(job_dir: Path) -> None:
    """
    Delete all local files for a completed job.
    IMPORTANT: Cloud Run has limited disk — always clean up.
    """
    if not job_dir.exists():
        return
    for f in job_dir.iterdir():
        try:
            f.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete {f}: {e}")
    try:
        job_dir.rmdir()
    except Exception:
        pass
    logger.info(f"Cleaned up job directory: {job_dir}")
