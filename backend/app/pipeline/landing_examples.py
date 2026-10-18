"""Publish one coherent three-clip landing example set to the gameplay bucket.

The clips themselves are rendered by the ordinary ShortClipr job pipeline.
This module only packages its completed outputs for lightweight site playback.
The versioned assets are uploaded first; current.json is replaced last so a
failed publish never mixes clips from different source videos on the page.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
from google.cloud import storage

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

LANDING_BUCKET_NAME = "shortclipr-gameplay-bg"
LANDING_PREFIX = "landing/multiple-shorts"
LANDING_MANIFEST = f"{LANDING_PREFIX}/current.json"
LANDING_VARIANTS = (
    {"short_template": "full_screen", "style": "last_word_editorial", "color": "rose_ink", "label": "Editorial · Rose Ink"},
    {"short_template": "zoom_blur", "style": "word_pop", "color": "green_dark", "label": "Pop · Green Dark"},
    {"short_template": "glass", "style": "shake", "color": "electric_blue_white", "label": "Shake · Electric Blue"},
)


def require_landing_bucket() -> str:
    configured = settings.gameplay_gcs_bucket_name
    if configured != LANDING_BUCKET_NAME:
        raise RuntimeError(
            f"Gameplay bucket must be configured as {LANDING_BUCKET_NAME!r} "
            "before publishing landing examples"
        )
    return configured


def _public_url(blob_name: str) -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{LANDING_BUCKET_NAME}/{blob_name}"


def _upload_file(bucket, path: Path, blob_name: str, content_type: str) -> str:
    blob = bucket.blob(blob_name)
    blob.cache_control = "public, max-age=31536000, immutable"
    if content_type == "video/mp4":
        blob.content_disposition = "inline"
    blob.upload_from_filename(str(path), content_type=content_type)
    return _public_url(blob_name)


async def _make_preview(source: Path, output: Path) -> None:
    # A 10-second, silent, 480px-wide H.264 file keeps three simultaneous
    # portrait loops much cheaper than loading their full 1080p exports.
    command = [
        "ffmpeg", "-y", "-i", str(source), "-t", "10", "-an",
        "-vf", "fps=24,scale=480:-2:flags=lanczos",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "29",
        "-maxrate", "800k", "-bufsize", "1600k", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(output),
    ]
    process = await asyncio.create_subprocess_exec(
        *command, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=120)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("Landing preview encode timed out") from None
    if process.returncode != 0 or not output.exists() or output.stat().st_size == 0:
        raise RuntimeError(f"Landing preview encode failed: {stderr.decode(errors='ignore')[-400:]}")


async def _download_source_thumbnail(video_id: str, output: Path) -> None:
    # video_id comes from the pipeline's 11-character YouTube ID parser, not
    # from an arbitrary URL supplied by the admin form.
    url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        response = await client.get(url)
        response.raise_for_status()
    if not response.headers.get("content-type", "").lower().startswith("image/") or len(response.content) > 5_000_000:
        raise RuntimeError("YouTube did not return a usable source thumbnail")
    output.write_bytes(response.content)


async def publish_landing_examples(
    job_id: str,
    video_id: str,
    source_title: str,
    source_duration: int,
    clips: list[dict],
    work_dir: Path,
) -> dict:
    """Publish exactly three rendered pipeline outputs, then switch manifest."""
    require_landing_bucket()
    if len(clips) != len(LANDING_VARIANTS):
        raise ValueError("Landing examples require exactly three completed clips")
    if any(index != clip.get("index") or not Path(clip["video_path"]).is_file() for index, clip in enumerate(clips)):
        raise ValueError("Landing clip outputs are incomplete or out of order")

    bucket = storage.Client().bucket(LANDING_BUCKET_NAME)
    version_prefix = f"{LANDING_PREFIX}/{job_id}"
    source_thumbnail = work_dir / "landing_source.jpg"
    await _download_source_thumbnail(video_id, source_thumbnail)
    source_thumbnail_url = await asyncio.to_thread(
        _upload_file, bucket, source_thumbnail, f"{version_prefix}/source.jpg", "image/jpeg",
    )

    published_clips = []
    for index, clip in enumerate(clips):
        number = index + 1
        full_path = Path(clip["video_path"])
        poster_path = Path(clip["thumbnail_path"])
        preview_path = work_dir / f"landing_preview_{number:02d}.mp4"
        await _make_preview(full_path, preview_path)
        if not poster_path.is_file():
            raise RuntimeError(f"Landing clip {number} has no poster")

        full_url, preview_url, poster_url = await asyncio.gather(
            asyncio.to_thread(_upload_file, bucket, full_path, f"{version_prefix}/full-{number:02d}.mp4", "video/mp4"),
            asyncio.to_thread(_upload_file, bucket, preview_path, f"{version_prefix}/preview-{number:02d}.mp4", "video/mp4"),
            asyncio.to_thread(_upload_file, bucket, poster_path, f"{version_prefix}/poster-{number:02d}.jpg", "image/jpeg"),
        )
        variant = LANDING_VARIANTS[index]
        published_clips.append({
            "index": number,
            "title": clip["title"],
            "full_url": full_url,
            "preview_url": preview_url,
            "poster_url": poster_url,
            "duration": clip["duration"],
            "short_template": variant["short_template"],
            "caption_style": variant["style"],
            "caption_color": variant["color"],
            "label": variant["label"],
        })

    manifest = {
        "job_id": job_id,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "title": source_title,
            "duration": source_duration,
            "thumbnail_url": source_thumbnail_url,
        },
        "clips": published_clips,
    }
    manifest_blob = bucket.blob(LANDING_MANIFEST)
    manifest_blob.cache_control = "public, max-age=60, must-revalidate"
    await asyncio.to_thread(
        manifest_blob.upload_from_string, json.dumps(manifest), content_type="application/json",
    )
    logger.info("Published landing example set from job %s", job_id)
    return manifest


def read_landing_examples() -> dict | None:
    """Read the current manifest for the public landing-page API."""
    if settings.gameplay_gcs_bucket_name != LANDING_BUCKET_NAME:
        return None
    blob = storage.Client().bucket(LANDING_BUCKET_NAME).blob(LANDING_MANIFEST)
    if not blob.exists():
        return None
    return json.loads(blob.download_as_text())
