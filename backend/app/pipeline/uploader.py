"""
uploader.py — GCS upload helpers for the ShortClipr pipeline.

GCS layout:
  clips/{job_id}/{clip_id}.mp4      — final vertical captioned clip
  clips/{job_id}/{clip_id}_raw.mp4  — reframed uncaptioned vertical (for re-renders)
  thumbnails/{job_id}/{clip_id}.jpg — card thumbnail
"""

import asyncio
import logging
import time
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


def _public_url(blob_name: str, bucket_name: str | None = None) -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{bucket_name or settings.GCS_BUCKET_NAME}/{blob_name}"

def generate_upload_signed_url(
    bucket_name: str,
    object_name: str,
    content_type: str,
    expiration_minutes: int = 60,
) -> str:
    from datetime import timedelta

    import google.auth
    from google.auth.transport.requests import Request

    client = _get_gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)

    credentials, _ = google.auth.default()

    credentials.refresh(Request())

    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=expiration_minutes),
        method="PUT",
        content_type=content_type,
        service_account_email=(
            "shortclipr-api@shortclipr-498718.iam.gserviceaccount.com"
        ),
        access_token=credentials.token,
    )

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
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        logger.warning("Thumbnail generation timed out — skipping")
        return output_path
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




async def upload_generated_image(
    local_path: Path,
    job_id: str,
    slot_id: str = "",
) -> str:
    """Upload one of a Factloop job's per-fact images (factloop_image.py) to
    GCS. Returns public URL. `slot_id` is the fact's stat_key, keeping one
    blob per fact rather than a single shared image — main bucket (per-user
    output, not shared library content), included in delete_job_from_gcs's
    cleanup prefixes below (a whole-prefix delete, so any number of these
    per job is cleaned up automatically)."""
    blob_name = f"clips/{job_id}/generated_{slot_id}.png" if slot_id else f"clips/{job_id}/generated.png"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _upload_to_gcs, local_path, blob_name, "image/png")


async def upload_generated_images(images: dict[str, tuple[Path, str]], job_id: str) -> dict[str, dict]:
    """Uploads every per-fact image from factloop_image.generate_images_for_lines
    concurrently. Returns {stat_key: {"url": ..., "source": ...}} — `source`
    ('pexels' | 'unsplash' | 'pixabay' | 'ai') is kept alongside the URL
    purely for logging/debugging which path each fact's image took."""
    keys = list(images.keys())
    urls = await asyncio.gather(*(
        upload_generated_image(images[k][0], job_id, k) for k in keys
    ))
    return {k: {"url": url, "source": images[k][1]} for k, url in zip(keys, urls)}


async def upload_tts_audio(
    local_path: Path,
    job_id: str,
    line_id: str,
) -> str:
    """Upload one dialogue line's synthesized TTS audio to GCS. Returns public URL.
    Blob lives under tts/{job_id}/ on the main bucket — included in
    delete_job_from_gcs's cleanup prefixes so it doesn't leak storage."""
    blob_name = f"tts/{job_id}/{line_id}.mp3"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _upload_to_gcs, local_path, blob_name, "audio/mpeg")


async def upload_gameplay_clip(
    local_path: Path,
    source_id: str,
    clip_id: str,
) -> str:
    """Upload a processed (<=120s, full-screen-reframed) gameplay background
    clip to the brainrot bucket. Returns public URL."""
    blob_name = f"gameplay/{source_id}/{clip_id}.mp4"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _upload_to_gcs, local_path, blob_name, "video/mp4", settings.BRAINROT_GCS_BUCKET_NAME,
    )


async def upload_character_asset(
    local_path: Path,
    character_id: str,
    filename: str = "canon.png",
) -> str:
    """Upload a character canon image (or variant) to the brainrot bucket.
    Returns public URL. Used by the one-time character migration script."""
    blob_name = f"characters/{character_id}/{filename}"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _upload_to_gcs, local_path, blob_name, "image/png", settings.BRAINROT_GCS_BUCKET_NAME,
    )


async def upload_voice_sample(
    local_path: Path,
    provider: str,
    voice_id: str,
) -> str:
    """Upload a TTS voice preview sample to the brainrot bucket. Returns public URL."""
    blob_name = f"voice-samples/{provider}/{voice_id}.mp3"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _upload_to_gcs, local_path, blob_name, "audio/mpeg", settings.BRAINROT_GCS_BUCKET_NAME,
    )


async def upload_audio_asset(local_path: Path, asset_type: str, asset_id: str, ext: str, content_type: str) -> str:
    """Upload an admin-provided music/SFX track to the brainrot bucket.
    Layout: audio/{music|sfx}/{asset_id}.{ext}. Returns public URL."""
    blob_name = f"audio/{asset_type}/{asset_id}{ext}"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _upload_to_gcs, local_path, blob_name, content_type, settings.BRAINROT_GCS_BUCKET_NAME,
    )


async def upload_gameplay_thumbnail(local_path: Path, source_id: str, clip_id: str) -> str:
    """Upload a gameplay clip's poster thumbnail to the brainrot bucket."""
    blob_name = f"gameplay/{source_id}/{clip_id}.jpg"
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _upload_to_gcs, local_path, blob_name, "image/jpeg", settings.BRAINROT_GCS_BUCKET_NAME,
    )


_DOWNLOAD_RETRIES = 3


async def download_to_file(url: str, dest: Path) -> Path:
    """Stream-download a (public GCS) URL to a local file. Used by the
    editor's re-render endpoint to fetch the raw clip back down, and by
    brainrot_stage.py to pull character images / gameplay clips / audio
    assets before compositing.

    Retries 3x with exponential backoff (1s, 2s) — matches _upload_to_gcs's
    retry count. A single transient GCS blip used to fail the whole
    brainrot job (and every credit reserved for it) on one attempt; a 4xx
    (e.g. a genuinely missing blob) still fails immediately since retrying
    a 404 wastes time without ever succeeding."""
    import httpx

    last_exc: Exception | None = None
    for attempt in range(1, _DOWNLOAD_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    with open(dest, "wb") as f:
                        async for chunk in resp.aiter_bytes():
                            f.write(chunk)
            return dest
        except httpx.HTTPStatusError as exc:
            # 4xx/5xx with a real response — a 404 will never succeed on
            # retry, so don't waste 3 attempts on a permanently-missing blob.
            if exc.response is not None and exc.response.status_code < 500:
                raise
            last_exc = exc
        except Exception as exc:
            last_exc = exc
        if attempt < _DOWNLOAD_RETRIES:
            delay = 2 ** (attempt - 1)  # 1s, 2s
            logger.warning(f"Download attempt {attempt} failed for {url} ({last_exc}); retrying in {delay}s")
            await asyncio.sleep(delay)
    raise RuntimeError(f"Download failed after {_DOWNLOAD_RETRIES} attempts: {url}") from last_exc


async def delete_job_from_gcs(job_id: str, keep_clip_ids: list[str] | None = None) -> None:
    """
    Delete all GCS objects for a job (clips + thumbnails).
    Called when a user deletes a job — prevents storage leaks.

    keep_clip_ids: clip_ids whose blobs must be preserved (e.g. showcased
    clips — see admin.py + migrations/006_clip_retention.sql). Any blob
    whose filename basename (minus extension) matches one of these IDs
    is left in place.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, _delete_job_blobs_sync, job_id, set(keep_clip_ids or []),
    )


def _delete_job_blobs_sync(job_id: str, keep_clip_ids: set[str]) -> None:
    """Synchronous GCS bulk delete — called in executor.
    Skips any blob whose filename (without extension) is in keep_clip_ids."""
    try:
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        prefixes = [f"clips/{job_id}/", f"thumbnails/{job_id}/", f"raw/{job_id}/", f"previews/{job_id}/", f"tts/{job_id}/"]
        deleted = 0
        kept    = 0
        for prefix in prefixes:
            blobs = list(bucket.list_blobs(prefix=prefix))
            for blob in blobs:
                # Blob names are {prefix}/{clip_id}.{ext} — strip the prefix
                # and extension to get the clip_id for the keep-list check.
                filename = blob.name.rsplit("/", 1)[-1]
                clip_id  = filename.rsplit(".", 1)[0]
                if clip_id in keep_clip_ids:
                    kept += 1
                    continue
                blob.delete()
                deleted += 1
        if kept:
            logger.info(f"GCS cleanup: deleted {deleted} objects for job {job_id}, kept {kept} showcased")
        else:
            logger.info(f"GCS cleanup: deleted {deleted} objects for job {job_id}")
    except Exception as e:
        # Don't fail the delete operation — log and continue
        logger.error(f"GCS cleanup failed for job {job_id}: {e}")


_GCS_UPLOAD_RETRIES = 3


def _upload_to_gcs(local_path: Path, blob_name: str, content_type: str, bucket_name: str | None = None) -> str:
    """Synchronous GCS upload — called in executor. Retries 3× with exponential backoff.

    bucket_name defaults to the main clips bucket; brainrot gameplay/character
    assets pass settings.BRAINROT_GCS_BUCKET_NAME instead (shared library
    content with its own lifecycle rules, kept out of the per-user bucket).
    """
    bucket_name = bucket_name or settings.GCS_BUCKET_NAME
    client = _get_gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)

    # Set Content-Disposition: attachment on MP4 clips so direct GCS URLs
    # trigger a browser download instead of inline playback.
    if content_type == "video/mp4":
        blob.content_disposition = f'attachment; filename="{blob_name.rsplit("/", 1)[-1]}"'

    last_exc: Exception | None = None
    for attempt in range(1, _GCS_UPLOAD_RETRIES + 1):
        try:
            blob.upload_from_filename(str(local_path), content_type=content_type)
            break
        except Exception as exc:
            last_exc = exc
            if attempt < _GCS_UPLOAD_RETRIES:
                delay = 2 ** attempt  # 2s, 4s
                logger.warning(f"GCS upload attempt {attempt} failed ({exc}); retrying in {delay}s")
                time.sleep(delay)
    else:
        raise RuntimeError(f"GCS upload failed after {_GCS_UPLOAD_RETRIES} attempts") from last_exc

    # Do NOT call blob.make_public() — bucket has Uniform Bucket-Level Access
    # enabled which disables legacy per-object ACLs. Public access is controlled
    # via IAM (allUsers:Storage Object Viewer) at the bucket level.
    return f"{settings.GCS_PUBLIC_BASE_URL}/{bucket_name}/{blob_name}"


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
