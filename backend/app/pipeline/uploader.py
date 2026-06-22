"""
uploader.py — GCS upload helpers for the ShortClipr pipeline.

GCS layout:
  clips/{job_id}/{clip_id}.mp4      — final vertical captioned clip
  clips/{job_id}/{clip_id}_raw.mp4  — reframed uncaptioned vertical (for re-renders)
  thumbnails/{job_id}/{clip_id}.jpg — card thumbnail
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


# ── Thumbnail generation ────────────────────────────────────────

async def generate_thumbnail(clip_path: Path, output_path: Path) -> Path:
    """
    Extract a single frame at 1 second from the clip.
    Produces a JPEG thumbnail at half the clip's resolution, preserving
    whichever aspect ratio (9:16 / 16:9 / 1:1) the clip was rendered at.
    """
    cmd = [
        "ffmpeg", "-y",
        "-ss", "1",
        "-i", str(clip_path),
        "-vframes", "1",
        "-vf", "scale=trunc(iw/4)*2:trunc(ih/4)*2",
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
    """Upload clip MP4 to GCS. Returns public URL."""
    blob_name = f"clips/{job_id}/{clip_id}.mp4"
    loop = asyncio.get_running_loop()
    url = await loop.run_in_executor(None, _upload_to_gcs, local_path, blob_name, "video/mp4")
    logger.info(f"Uploaded clip → {url}")
    return url


async def upload_thumbnail(
    local_path: Path,
    job_id: str,
    clip_id: str,
) -> str:
    """Upload thumbnail JPEG to GCS. Returns public URL."""
    blob_name = f"thumbnails/{job_id}/{clip_id}.jpg"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _upload_to_gcs, local_path, blob_name, "image/jpeg")


async def upload_raw_clip(
    local_path: Path,
    job_id: str,
    clip_id: str,
) -> str:
    """Upload the reframed-but-uncaptioned vertical clip to GCS. Returns public URL."""
    blob_name = f"clips/{job_id}/{clip_id}_raw.mp4"
    loop = asyncio.get_running_loop()
    url = await loop.run_in_executor(None, _upload_to_gcs, local_path, blob_name, "video/mp4")
    logger.info(f"Uploaded raw clip → {url}")
    return url




async def download_to_file(url: str, dest: Path) -> Path:
    """Stream-download a (public GCS) URL to a local file. Used by the
    editor's re-render endpoint to fetch the raw clip back down."""
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in resp.aiter_bytes():
                    f.write(chunk)
    return dest


async def delete_job_from_gcs(job_id: str) -> None:
    """
    Delete all GCS objects for a job (clips + thumbnails).
    Called when a user deletes a job — prevents storage leaks.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _delete_job_blobs_sync, job_id)


def _delete_job_blobs_sync(job_id: str) -> None:
    """Synchronous GCS bulk delete — called in executor."""
    try:
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        prefixes = [f"clips/{job_id}/", f"thumbnails/{job_id}/", f"raw/{job_id}/", f"previews/{job_id}/"]
        deleted = 0
        for prefix in prefixes:
            blobs = list(bucket.list_blobs(prefix=prefix))
            for blob in blobs:
                blob.delete()
                deleted += 1
        logger.info(f"GCS cleanup: deleted {deleted} objects for job {job_id}")
    except Exception as e:
        # Don't fail the delete operation — log and continue
        logger.error(f"GCS cleanup failed for job {job_id}: {e}")


def _upload_to_gcs(local_path: Path, blob_name: str, content_type: str) -> str:
    """Synchronous GCS upload — called in executor."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(
        str(local_path),
        content_type=content_type,
    )
    # Do NOT call blob.make_public() — bucket has Uniform Bucket-Level Access
    # enabled which disables legacy per-object ACLs. Public access is controlled
    # via IAM (allUsers:Storage Object Viewer) at the bucket level.
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.GCS_BUCKET_NAME}/{blob_name}"


# ── Full clip processing: upload + thumbnail ───────────────────

async def process_and_upload_clip(
    clip_path: Path,
    job_id: str,
    clip_id: str,
    tmp_dir: Path,
    raw_path: Path | None = None,
) -> tuple[str, str, str]:
    """
    1. Generate thumbnail (non-blocking failure — won't break clip delivery)
    2. Upload clip to GCS
    3. Upload thumbnail to GCS (if generated successfully)
    4. Upload the uncaptioned raw clip to GCS (if provided)
    5. Return (clip_url, thumbnail_url, raw_url)
    """
    thumb_path = tmp_dir / f"{clip_id}_thumb.jpg"

    # Generate thumbnail — failures are non-fatal
    await generate_thumbnail(clip_path, thumb_path)

    # Always upload the clip — upload thumbnail only if it was generated
    thumb_exists = thumb_path.exists() and thumb_path.stat().st_size > 0

    uploads = [upload_clip(clip_path, job_id, clip_id)]
    uploads.append(upload_thumbnail(thumb_path, job_id, clip_id) if thumb_exists else _empty_str())
    uploads.append(upload_raw_clip(raw_path, job_id, clip_id) if raw_path else _empty_str())

    if not thumb_exists:
        logger.warning(f"[{clip_id}] Thumbnail generation failed — uploading clip only")

    clip_url, thumb_url, raw_url = await asyncio.gather(*uploads)
    return clip_url, thumb_url, raw_url


async def _empty_str() -> str:
    return ""


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
