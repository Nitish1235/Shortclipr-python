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
from app.core.worker_routing import has_multi_region_workers, pick_primary_worker
from app.db import supabase as db
from app.pipeline.test_pipeline import TOTAL_CLIPS, get_test_job, run_test_pipeline

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
    source_clip_id: str,
    source_job_id: str,
) -> dict:
    """Copy a clip from clips/ → showcase/ with metadata. Returns showcase entry.
    source_clip_id + source_job_id are stored on the blob so admin_delete_showcase
    can locate + un-flag the original clip row when the showcase entry is removed."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)

    showcase_id = str(uuid.uuid4())
    dest_blob_name = f"showcase/{showcase_id}.mp4"

    source_blob = bucket.blob(source_blob_name)
    dest_blob = bucket.copy_blob(source_blob, bucket, dest_blob_name)

    # Store metadata on the GCS blob
    dest_blob.metadata = {
        "showcase_id":    showcase_id,
        "title":          title[:200],
        "viral_score":    str(viral_score),
        "thumbnail_url":  thumbnail_url,
        "added_at":       datetime.now(timezone.utc).isoformat(),
        # Back-references to the source row so removal from showcase can
        # un-flag the original clip in the DB (see admin_delete_showcase).
        "source_clip_id": source_clip_id,
        "source_job_id":  source_job_id,
    }
    dest_blob.patch()
    # Do NOT call dest_blob.make_public() — bucket has Uniform Bucket-Level
    # Access enabled, which disables the legacy per-object ACL API entirely
    # (this call 400s with "Cannot get legacy ACL for an object when uniform
    # bucket-level access is enabled"). Public access is already granted via
    # IAM (allUsers:Storage Object Viewer) at the bucket level — every object
    # in it, including this copy, inherits that automatically. Same
    # constraint already documented in uploader.py's _upload_to_gcs().
    # dest_blob.public_url below is pure client-side string construction —
    # no API call, no ACL dependency — so it works without make_public().

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
                "id":              meta.get("showcase_id", blob.name.split("/")[-1].replace(".mp4", "")),
                "video_url":       blob.public_url,
                "thumbnail_url":   meta.get("thumbnail_url", ""),
                "title":           meta.get("title", "ShortClipr Clip"),
                "viral_score":     int(meta.get("viral_score", 0)),
                "added_at":        meta.get("added_at", ""),
                "blob_name":       blob.name,
                # Empty when the showcase entry pre-dates migration 006
                # (blobs added before source_clip_id was tracked). Admin UI
                # can still delete these; the DB unflag just no-ops.
                "source_clip_id":  meta.get("source_clip_id", ""),
                "source_job_id":   meta.get("source_job_id",  ""),
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
    Admin: copy a generated clip into the GCS showcase/ folder AND flag the
    source clip row (is_showcased=TRUE) so it can't be deleted by the user
    or a retention sweep.

    The clip is COPIED (not moved) so:
      - The showcase copy under GCS `showcase/` prefix is fully independent
      - The source clip row + `clips/` blob are protected via is_showcased flag
      - If the source clip / job is later deleted, the showcase copy stays
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
            body.clip_id,
            body.job_id,
        )
    except Exception as e:
        logger.error(f"Failed to add to showcase: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Flag the source clip so DELETE /jobs/{id} won't nuke it later.
    # Runs AFTER the GCS copy succeeds — if the copy fails we don't lie
    # about the DB state.
    try:
        await db.mark_clip_showcased(body.clip_id)
    except Exception as e:
        # GCS copy already succeeded; log but don't fail the request — the
        # showcase entry is live, worst case the source clip gets deleted
        # someday and the showcase copy remains (which is still the intent).
        logger.error(f"Marked showcase in GCS but failed to flag clip {body.clip_id}: {e}")

    logger.info(f"Admin {admin.email} added showcase clip {entry['id']} (source clip {body.clip_id})")
    return {"success": True, "showcase_entry": entry}


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


def _delete_showcase_sync_and_get_source(blob_name: str) -> str:
    """Delete a showcase blob and return the source_clip_id from its metadata
    (empty string if the blob predates that metadata field)."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    # Fetch metadata BEFORE the delete so we know which source clip to un-flag.
    try:
        blob.reload()
        source_clip_id = (blob.metadata or {}).get("source_clip_id", "") if blob.metadata else ""
    except Exception:
        source_clip_id = ""
    blob.delete()
    return source_clip_id


@router.delete("/admin/showcase/{showcase_id}")
async def admin_delete_showcase(showcase_id: str, blob_name: str, admin: AdminUser):
    """
    Admin: remove a video from the showcase. Also un-flags the source clip
    (is_showcased=FALSE) so future DELETE /jobs/{id} calls can clean it up
    normally — the showcase protection was the ONLY reason we kept it locked.
    """
    # blob_name is passed as query param for safety
    if not blob_name.startswith("showcase/"):
        raise HTTPException(status_code=400, detail="Invalid blob name")
    loop = asyncio.get_running_loop()
    try:
        source_clip_id = await loop.run_in_executor(
            None, _delete_showcase_sync_and_get_source, blob_name,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if source_clip_id:
        try:
            await db.unmark_clip_showcased(source_clip_id)
        except Exception as e:
            logger.error(f"Deleted showcase blob but failed to unflag clip {source_clip_id}: {e}")

    logger.info(f"Admin {admin.email} deleted showcase: {blob_name} (source clip {source_clip_id or '?'})")
    return {"success": True}


# ── ADMIN: Test Lab — GCS clip browser ─────────────────────────

def _list_all_clips_sync() -> dict:
    """List every clip in GCS clips/ (real jobs + test batches), grouped by job_id."""
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blobs = list(bucket.list_blobs(prefix="clips/"))

    jobs: dict[str, list[dict]] = {}
    for blob in blobs:
        if not blob.name.endswith(".mp4"):
            continue
        parts = blob.name.split("/")  # clips/{job_id}/{clip_id}.mp4
        if len(parts) != 3:
            continue
        _, job_id, filename = parts
        clip_id = filename[:-4]
        thumb_name = f"thumbnails/{job_id}/{clip_id}.jpg"
        jobs.setdefault(job_id, []).append({
            "clip_id":       clip_id,
            "video_url":     blob.public_url,
            "thumbnail_url": f"{settings.GCS_PUBLIC_BASE_URL}/{settings.GCS_BUCKET_NAME}/{thumb_name}",
            "size_kb":       (blob.size or 0) // 1024,
            "updated":       blob.updated.isoformat() if blob.updated else "",
        })

    result = []
    for job_id, clips in jobs.items():
        clips.sort(key=lambda c: c["clip_id"])
        latest = max((c["updated"] for c in clips), default="")
        result.append({
            "job_id":     job_id,
            "is_test":    job_id.startswith("test_"),
            "clip_count": len(clips),
            "updated":    latest,
            "clips":      clips,
        })
    result.sort(key=lambda j: j["updated"], reverse=True)

    return {"jobs": result, "total_jobs": len(result), "total_clips": sum(j["clip_count"] for j in result)}


@router.get("/admin/gcs/clips")
async def admin_list_gcs_clips(admin: AdminUser):
    """Admin: one-click check of every clip stored in GCS, grouped by job."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, _list_all_clips_sync)
    except Exception as e:
        logger.error(f"Failed to list GCS clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── ADMIN: Test Lab — batch generation (no AI scoring) ─────────

class TestGenerateRequest(BaseModel):
    youtube_url: str
    quality: str = "1080p"


@router.post("/admin/test/generate")
async def admin_test_generate(body: TestGenerateRequest, admin: AdminUser):
    """
    Admin: kick off a test batch (no AI scoring) — clip count tracks
    VALID_STYLES + VALID_TEMPLATES, currently 11 + 5 = 16 clips.

    - First block:  sequential 30s segments, one per caption style (VALID_STYLES)
    - Second block: sequential 30s segments, one per shorts template (VALID_TEMPLATES)

    Returns a job_id to poll via GET /admin/test/jobs/{job_id}.
    """
    job_id = f"test_{uuid.uuid4().hex[:12]}"

    if has_multi_region_workers():
        # Dispatch to a worker — always the SAME (primary) one, not
        # round-robin, since this admin test pipeline keeps its progress
        # state in-memory on whichever single instance handles it (see
        # admin_test_job_status below, which must poll that same instance).
        target = pick_primary_worker()
        async def _dispatch():
            try:
                import httpx
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{target.worker_url}/internal/test/run",
                        json={"job_id": job_id, "youtube_url": body.youtube_url, "quality": body.quality},
                        headers={"X-Internal-Secret": settings.INTERNAL_TASK_SECRET},
                    )
                    resp.raise_for_status()
            except Exception:
                logger.exception(f"[{job_id}] Failed to dispatch test batch to worker")
        asyncio.create_task(_dispatch(), name=f"test-dispatch-{job_id[:8]}")
    else:
        asyncio.create_task(run_test_pipeline(job_id, body.youtube_url, body.quality))

    logger.info(f"Admin {admin.email} started test batch {job_id} for {body.youtube_url}")
    return {"job_id": job_id, "total_clips": TOTAL_CLIPS}


@router.get("/admin/test/jobs/{job_id}")
async def admin_test_job_status(job_id: str, admin: AdminUser):
    """Admin: poll progress of a test batch.

    When worker dispatch is configured, the job runs on the (primary)
    worker and its in-memory state lives there — proxy the request to it.
    """
    if has_multi_region_workers():
        target = pick_primary_worker()
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{target.worker_url}/internal/test/jobs/{job_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_TASK_SECRET},
            )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Test job not found")
        resp.raise_for_status()
        return resp.json()

    job = get_test_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Test job not found")
    return job
