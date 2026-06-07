"""
admin.py — Admin-only endpoints + Public showcase API

Architecture:
  Admin uploads showcase clips → stored in GCS `showcase/` prefix
  Metadata stored as GCS blob custom metadata (no extra DB table needed)
  Public /showcase endpoint lists them → frontend carousel reads it

Endpoints:
  PUBLIC:
    GET  /showcase                  — list all showcase videos (landing page)

  ADMIN (requires ADMIN_EMAIL in JWT):
    GET  /admin/jobs                — all jobs across all users
    GET  /admin/jobs/{job_id}/clips — clips for any job
    POST /admin/showcase/add        — copy clip → showcase folder in GCS
    DELETE /admin/showcase/{name}   — remove from showcase
    GET  /admin/showcase            — list showcase with edit metadata
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.db import supabase as db

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["admin"])

# ── Admin gate ────────────────────────────────────────────────
# Reads from settings (which loads .env / Cloud Run secrets) — not raw os.environ

_ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in (settings.ADMIN_EMAILS or "").split(",")
    if e.strip()
}


def is_admin(user) -> bool:
    if _ADMIN_EMAILS and user.email.lower() in _ADMIN_EMAILS:
        return True
    if user.plan == "admin":
        return True
    return False


async def require_admin(current_user: CurrentUser) -> CurrentUser:
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


AdminUser = Annotated[CurrentUser, Depends(require_admin)]


# ── GCS helpers ───────────────────────────────────────────────

def _get_gcs_client():
    from google.cloud import storage
    return storage.Client()


def _copy_to_showcase_sync(
    source_blob_name: str,
    title: str,
    viral_score: int,
    thumbnail_url: str,
    source_video_url: str,
) -> dict:
    """Copy a clip from clips/ → showcase/ with metadata. Returns showcase entry."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)

    showcase_id = str(uuid.uuid4())
    dest_blob_name = f"showcase/{showcase_id}.mp4"

    source_blob = bucket.blob(source_blob_name)
    dest_blob = bucket.copy_blob(source_blob, bucket, dest_blob_name)

    # Store metadata on the GCS blob
    dest_blob.metadata = {
        "showcase_id": showcase_id,
        "title": title[:200],
        "viral_score": str(viral_score),
        "thumbnail_url": thumbnail_url,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    dest_blob.patch()
    dest_blob.make_public()

    return {
        "id": showcase_id,
        "video_url": dest_blob.public_url,
        "thumbnail_url": thumbnail_url,
        "title": title,
        "viral_score": viral_score,
        "added_at": dest_blob.metadata["added_at"],
    }


def _list_showcase_sync() -> list[dict]:
    """List all showcase blobs + their metadata."""
    try:
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        blobs = list(bucket.list_blobs(prefix="showcase/"))
        items = []
        for blob in blobs:
            if not blob.name.endswith(".mp4"):
                continue
            blob.reload()  # fetch metadata
            meta = blob.metadata or {}
            items.append({
                "id":            meta.get("showcase_id", blob.name.split("/")[-1].replace(".mp4", "")),
                "video_url":     blob.public_url,
                "thumbnail_url": meta.get("thumbnail_url", ""),
                "title":         meta.get("title", "ShortClipr Clip"),
                "viral_score":   int(meta.get("viral_score", 0)),
                "added_at":      meta.get("added_at", ""),
                "blob_name":     blob.name,
            })
        # Sort newest first
        items.sort(key=lambda x: x["added_at"], reverse=True)
        return items
    except Exception as e:
        logger.error(f"Failed to list showcase from GCS: {e}")
        return []


def _delete_showcase_sync(blob_name: str) -> None:
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    blob.delete()


# ── PUBLIC: Showcase for landing page ─────────────────────────

@router.get("/showcase", tags=["public"])
async def get_showcase():
    """
    PUBLIC endpoint — returns all showcase videos for the landing page carousel.
    No auth required.
    """
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_showcase_sync)
    return {"videos": items, "count": len(items)}


# ── ADMIN: Job management ──────────────────────────────────────

@router.get("/admin/jobs")
async def admin_list_all_jobs(admin: AdminUser):
    """Admin: list all jobs across all users."""
    try:
        rows = await db._fetch(
            """
            SELECT j.*, u.email as user_email, u.full_name as user_name
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            ORDER BY j.created_at DESC
            LIMIT 100
            """
        )
        return {"jobs": [dict(r) for r in rows]}
    except Exception as e:
        logger.error(f"Admin list jobs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/jobs/{job_id}/clips")
async def admin_get_job_clips(job_id: str, admin: AdminUser):
    """Admin: get all clips for any job."""
    clips = await db.get_clips_for_job(job_id)
    return {"clips": clips}


# ── ADMIN: Showcase management ────────────────────────────────

class AddToShowcaseRequest(BaseModel):
    job_id: str
    clip_id: str
    title: str = "ShortClipr Clip"
    viral_score: int = 0
    video_url: str       # GCS URL of source clip
    thumbnail_url: str = ""


@router.post("/admin/showcase/add")
async def admin_add_to_showcase(body: AddToShowcaseRequest, admin: AdminUser):
    """
    Admin: copy a generated clip into the GCS showcase/ folder.
    The clip is copied (not moved) so the original job clip is unaffected.
    """
    # Derive blob name from the video URL
    # URL format: https://storage.googleapis.com/{bucket}/{blob_name}
    prefix = f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/"
    if not body.video_url.startswith(prefix):
        raise HTTPException(status_code=400, detail="Video URL is not from our GCS bucket")

    source_blob_name = body.video_url[len(prefix):]

    loop = asyncio.get_running_loop()
    try:
        entry = await loop.run_in_executor(
            None,
            _copy_to_showcase_sync,
            source_blob_name,
            body.title,
            body.viral_score,
            body.thumbnail_url,
            body.video_url,
        )
        logger.info(f"Admin {admin.email} added showcase clip: {entry['id']}")
        return {"success": True, "showcase_entry": entry}
    except Exception as e:
        logger.error(f"Failed to add to showcase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/showcase")
async def admin_list_showcase(admin: AdminUser):
    """Admin: list all showcase videos with full metadata."""
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_showcase_sync)
    return {"videos": items, "count": len(items)}


class UpdateShowcaseMetaRequest(BaseModel):
    blob_name: str
    title: str
    viral_score: int


@router.patch("/admin/showcase/meta")
async def admin_update_showcase_meta(body: UpdateShowcaseMetaRequest, admin: AdminUser):
    """Admin: update title/viral_score metadata on a showcase blob."""
    def _update_sync():
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        blob = bucket.blob(body.blob_name)
        blob.reload()
        meta = blob.metadata or {}
        meta["title"] = body.title[:200]
        meta["viral_score"] = str(body.viral_score)
        blob.metadata = meta
        blob.patch()
        return True

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _update_sync)
    return {"success": True}


@router.delete("/admin/showcase/{showcase_id}")
async def admin_delete_showcase(showcase_id: str, blob_name: str, admin: AdminUser):
    """Admin: remove a video from the showcase."""
    # blob_name is passed as query param for safety
    if not blob_name.startswith("showcase/"):
        raise HTTPException(status_code=400, detail="Invalid blob name")
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, _delete_showcase_sync, blob_name)
        logger.info(f"Admin {admin.email} deleted showcase: {blob_name}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
