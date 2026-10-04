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
    GET  /admin/jobs/{job_id}/status — poll progress of any job
    POST /admin/showcase/add        — copy clip → showcase folder in GCS
    DELETE /admin/showcase/{name}   — remove from showcase
    GET  /admin/showcase            — list showcase with edit metadata
    GET  /admin/users/by-email      — look up a user before assigning a job
    POST /admin/users/set-plan      — force-set a user's plan (fix stuck paid users)
    POST /admin/jobs/assign         — generate a clip job and assign it to
                                       another user by email (support tool
                                       for retrying failed user jobs)
    GET  /tutorial                  — current onboarding tutorial video, if any
    POST /admin/tutorial/upload     — upload/replace the tutorial video
    DELETE /admin/tutorial          — remove the tutorial (hides it from users)
"""

import asyncio
import logging
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, get_current_user
from app.core.config import get_settings
from app.core.worker_routing import has_multi_region_workers
from app.db import supabase as db
from app.api.jobs import JobOptions
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.stream import extract_video_id, get_video_metadata
from app.pipeline.uploader import _upload_to_gcs

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
    return bool(_ADMIN_EMAILS and user.email.lower() in _ADMIN_EMAILS)


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


def _copy_to_library_sync(
    source_blob_name: str,
    title: str,
    views: str,
    earnings: str,
    thumbnail_url: str,
    source_video_url: str,
    source_clip_id: str,
    source_job_id: str,
) -> dict:
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)

    library_id = str(uuid.uuid4())
    dest_blob_name = f"library/{library_id}.mp4"

    source_blob = bucket.blob(source_blob_name)
    dest_blob = bucket.copy_blob(source_blob, bucket, dest_blob_name)

    dest_blob.metadata = {
        "library_id":     library_id,
        "title":          title[:200],
        "views":          views[:50],
        "earnings":       earnings[:50],
        "thumbnail_url":  thumbnail_url,
        "added_at":       datetime.now(timezone.utc).isoformat(),
        "source_clip_id": source_clip_id,
        "source_job_id":  source_job_id,
    }
    dest_blob.patch()

    return {
        "id": library_id,
        "video_url": dest_blob.public_url,
        "thumbnail_url": thumbnail_url,
        "title": title,
        "views": views,
        "earnings": earnings,
        "added_at": dest_blob.metadata["added_at"],
    }


def _list_library_sync() -> list[dict]:
    try:
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        blobs = list(bucket.list_blobs(prefix="library/"))
        items = []
        for blob in blobs:
            if not blob.name.endswith(".mp4"):
                continue
            blob.reload()
            meta = blob.metadata or {}
            items.append({
                "id":              meta.get("library_id", blob.name.split("/")[-1].replace(".mp4", "")),
                "video_url":       blob.public_url,
                "thumbnail_url":   meta.get("thumbnail_url", ""),
                "title":           meta.get("title", "Generated Clip"),
                "views":           meta.get("views", "89.3k views"),
                "earnings":        meta.get("earnings", "$98"),
                "added_at":        meta.get("added_at", ""),
                "blob_name":       blob.name,
                "source_clip_id":  meta.get("source_clip_id", ""),
                "source_job_id":   meta.get("source_job_id",  ""),
            })
        items.sort(key=lambda x: x["added_at"], reverse=True)
        return items
    except Exception as e:
        logger.error(f"Failed to list library from GCS: {e}")
        return []

def _delete_library_sync_and_get_source(blob_name: str) -> str:
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    blob = bucket.blob(blob_name)
    try:
        blob.reload()
        source_clip_id = (blob.metadata or {}).get("source_clip_id", "") if blob.metadata else ""
    except Exception:
        source_clip_id = ""
    blob.delete()
    return source_clip_id



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


@router.get("/library", tags=["public"])
async def get_library():
    """
    PUBLIC endpoint — returns all library videos for the paywall page.
    No auth required.
    """
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_library_sync)
    # Remove direct video URLs to prevent free users from downloading via inspect.
    for i in items:
        i.pop('video_url', None)
    return {"videos": items, "count": len(items)}


# ── ADMIN: Job management ──────────────────────────────────────

@router.get("/admin/jobs")
async def admin_list_all_jobs(admin: AdminUser):
    """Admin: list all jobs across all users."""
    try:
        rows = await db._fetch(
            """
            SELECT j.*, u.email as user_email, u.full_name as user_name,
                   (SELECT COUNT(*) FROM job_feedback f WHERE f.job_id = j.job_id) AS feedback_count
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

@router.get("/admin/tiktok-events")
async def admin_list_all_tiktok_events(admin: AdminUser):
    """Admin: list recent TikTok tracking events."""
    try:
        events = await db.list_tiktok_events()
        # Convert UUIDs/datetimes to standard json serializable strings
        for event in events:
            if "id" in event: event["id"] = str(event["id"])
            if "created_at" in event and event["created_at"]:
                event["created_at"] = event["created_at"].isoformat()
        return {"events": events}
    except Exception as e:
        logger.error(f"Admin list tiktok events failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/jobs/{job_id}/clips")
async def admin_get_job_clips(job_id: str, admin: AdminUser):
    """Admin: get all clips for any job."""
    clips = await db.get_clips_for_job(job_id)
    return {"clips": clips}


@router.get("/admin/jobs/{job_id}/feedback")
async def admin_get_job_feedback(job_id: str, admin: AdminUser):
    """Admin: get the feedback survey response for a job, if any."""
    feedback = await db.get_feedback_for_job(job_id)
    return {"feedback": feedback}


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


# ── ADMIN: Library management ────────────────────────────────

class AddToLibraryRequest(BaseModel):
    job_id: str
    clip_id: str
    title: str = "Generated Clip"
    views: str = "89.3k views"
    earnings: str = "$98"
    video_url: str       # GCS URL of source clip
    thumbnail_url: str = ""

@router.post("/admin/library/add")
async def admin_add_to_library(body: AddToLibraryRequest, admin: AdminUser):
    prefix = f"https://storage.googleapis.com/{settings.GCS_BUCKET_NAME}/"
    if not body.video_url.startswith(prefix):
        raise HTTPException(status_code=400, detail="Video URL is not from our GCS bucket")

    source_blob_name = body.video_url[len(prefix):]

    loop = asyncio.get_running_loop()
    try:
        entry = await loop.run_in_executor(
            None,
            _copy_to_library_sync,
            source_blob_name,
            body.title,
            body.views,
            body.earnings,
            body.thumbnail_url,
            body.video_url,
            body.clip_id,
            body.job_id,
        )
    except Exception as e:
        logger.error(f"Failed to add to library: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    try:
        await db.mark_clip_showcased(body.clip_id)
    except Exception as e:
        logger.error(f"Marked library in GCS but failed to flag clip {body.clip_id}: {e}")

    return {"success": True, "library_entry": entry}


@router.get("/admin/library")
async def admin_list_library(admin: AdminUser):
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_library_sync)
    return {"videos": items, "count": len(items)}


@router.delete("/admin/library/{library_id}")
async def admin_delete_library(library_id: str, blob_name: str, admin: AdminUser):
    if not blob_name.startswith("library/"):
        raise HTTPException(status_code=400, detail="Invalid blob name")
    loop = asyncio.get_running_loop()
    try:
        source_clip_id = await loop.run_in_executor(
            None, _delete_library_sync_and_get_source, blob_name,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if source_clip_id:
        try:
            await db.unmark_clip_showcased(source_clip_id)
        except Exception as e:
            logger.error(f"Deleted library blob but failed to unflag clip {source_clip_id}: {e}")

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


@router.get("/admin/clips/all")
async def get_all_edited_clips(admin: AdminUser, limit: int = 150):
    """Fetch raw successfully-encoded clips for the admin infinite wall."""
    clips = await db.get_all_ready_clips(limit=limit)
    return {"clips": clips}


@router.get("/admin/gcs/clips")
async def admin_list_gcs_clips(admin: AdminUser):
    """Admin: one-click check of every clip stored in GCS, grouped by job."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, _list_all_clips_sync)
    except Exception as e:
        logger.error(f"Failed to list GCS clips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── ADMIN: Generate & assign a clip job to any user by email ───
#
# Support tool: when a user's job fails (proxy issues, YouTube blocks, etc.),
# the admin can manually generate the clips and hand them to the user as if
# they'd generated it themselves — same dashboard visibility, same "clips
# ready" email — by creating a normal job row keyed to the TARGET user's
# user_id instead of the admin's own. ffmpeg_stage.py's completion email
# and jobs.py's GET /jobs both key off user_id already, so nothing else
# needs to change for either of those to "just work".

@router.get("/admin/users/by-email")
async def admin_find_user_by_email(email: str, admin: AdminUser):
    """Admin: look up a user by email before assigning a job to them."""
    user = await db.get_user_by_email(email.strip().lower())
    if not user:
        raise HTTPException(status_code=404, detail="No user with that email")
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "full_name": user.get("full_name") or "",
        "plan": user.get("plan") or "free",
        "brainrot_plan": user.get("brainrot_plan") or "free",
        "credits_used": user.get("credits_used", 0),
        "credits_limit": user.get("credits_limit", 0),
        "video_minutes_used": user.get("video_minutes_used", 0),
        "video_minutes_limit": user.get("video_minutes_limit", 0),
        "brainrot_credits_used": user.get("brainrot_credits_used", 0),
        "brainrot_credits_limit": user.get("brainrot_credits_limit", 0),
    }


class AdminSetPlanRequest(BaseModel):
    email: str
    # Shortclipr plan — pass "free" to downgrade, or any valid plan key to upgrade.
    # Omit (leave None) to leave unchanged.
    plan: str | None = None
    # Brainrot plan — same rules.
    brainrot_plan: str | None = None


@router.post("/admin/users/set-plan")
async def admin_set_user_plan(body: AdminSetPlanRequest, admin: AdminUser):
    """
    Admin: force-set a user's Shortclipr plan, Brainrot plan, or both.

    Primary use-case: a user's payment was cancelled but the webhook was
    silently dropped (e.g. missing email in Dodo payload) so they're still
    showing as paid. Call this with plan="free" and/or brainrot_plan="free"
    to immediately downgrade them.

    Also works in reverse — pass a real plan name to manually grant access
    (e.g. comp a plan for a support case).

    credits_limit / video_minutes_limit are derived automatically from the
    plan name using the same PLAN_LIMITS table the webhook uses.
    credits_used / video_minutes_used are clamped to the new limits so the
    user is never left in a hard-locked state.
    """
    from app.core.plan_limits import PLAN_LIMITS, get_credits_limit, get_video_minutes_limit
    from app.core.brainrot_plan_limits import BRAINROT_PLAN_LIMITS, get_brainrot_credits_limit

    email = body.email.strip().lower()
    user = await db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="No user with that email")

    user_id = str(user["id"])
    kwargs: dict = {}

    if body.plan is not None:
        if body.plan not in PLAN_LIMITS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown Shortclipr plan '{body.plan}'. Valid: {sorted(PLAN_LIMITS)}",
            )
        kwargs["plan"] = body.plan
        kwargs["credits_limit"] = get_credits_limit(body.plan)
        kwargs["video_minutes_limit"] = get_video_minutes_limit(body.plan)

    if body.brainrot_plan is not None:
        if body.brainrot_plan not in BRAINROT_PLAN_LIMITS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown Brainrot plan '{body.brainrot_plan}'. Valid: {sorted(BRAINROT_PLAN_LIMITS)}",
            )
        kwargs["brainrot_plan"] = body.brainrot_plan
        kwargs["brainrot_credits_limit"] = get_brainrot_credits_limit(body.brainrot_plan)

    if not kwargs:
        raise HTTPException(status_code=422, detail="Supply at least one of: plan, brainrot_plan")

    updated = await db.admin_set_user_plan(user_id, **kwargs)
    if not updated:
        raise HTTPException(status_code=500, detail="Update ran but returned no row — check DB logs")

    logger.info(
        f"Admin {admin.email} force-set plan for {email}: "
        + ", ".join(f"{k}={v}" for k, v in kwargs.items())
    )
    return {
        "success": True,
        "email": email,
        "user_id": user_id,
        "updated": {k: v for k, v in kwargs.items()},
        "now": {
            "plan": updated.get("plan"),
            "credits_limit": updated.get("credits_limit"),
            "credits_used": updated.get("credits_used"),
            "video_minutes_limit": updated.get("video_minutes_limit"),
            "video_minutes_used": updated.get("video_minutes_used"),
            "brainrot_plan": updated.get("brainrot_plan"),
            "brainrot_credits_limit": updated.get("brainrot_credits_limit"),
            "brainrot_credits_used": updated.get("brainrot_credits_used"),
        },
    }


class AdminAssignJobRequest(BaseModel):
    email: str
    youtube_url: str
    options: JobOptions = JobOptions()


@router.post("/admin/jobs/assign")
async def admin_assign_job(body: AdminAssignJobRequest, admin: AdminUser):
    """
    Admin: generate clips for a YouTube URL and assign the resulting job to
    another user by email — as a full stand-in for a normal job (same
    pipeline, same dashboard visibility, same completion email).

    Deliberately skips the credit/video-minutes reservation gates that
    POST /jobs enforces — this is an admin-comped job and must not eat
    into the target user's plan quota.
    """
    target_user = await db.get_user_by_email(body.email.strip().lower())
    if not target_user:
        raise HTTPException(status_code=404, detail="No user with that email")
    target_user_id = str(target_user["id"])

    video_id = extract_video_id(body.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid YouTube URL — paste a valid youtube.com or youtu.be link.",
        )

    try:
        video_meta = await get_video_metadata(video_id)
    except Exception as exc:
        logger.warning(f"[admin-assign] Metadata prefetch failed for {video_id}: {exc}")
        video_meta = {"title": "", "duration": 0, "thumbnail": ""}

    options = body.options.model_dump()
    video_duration_seconds = int(video_meta.get("duration", 0))
    if video_duration_seconds > 0:
        options["prefetched_duration"] = video_duration_seconds
        options["prefetched_title"]    = video_meta.get("title", "")
    options["plan"] = target_user.get("plan") or "free"
    # No reserved_credits key — ffmpeg_stage.py's refund-on-failure logic
    # treats a missing/zero value as "nothing to release", so this is a
    # true no-cost job from the target user's quota perspective.

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    multi_region = bool(settings.API_WORKER_URLS.strip() or settings.FFMPEG_WORKER_URLS.strip()) or has_multi_region_workers()
    initial_status = "created" if multi_region else "processing"

    queue_payload = {
        "job_id": job_id, "user_id": target_user_id,
        "youtube_url": body.youtube_url, "options": options,
    } if multi_region else None

    await db._execute(
        """
        INSERT INTO jobs
          (job_id, user_id, youtube_url, status, pipeline_stage, progress,
           current_step, clip_count, reserved_video_minutes,
           queue_payload, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'api',$5,$6,$7,0,$8::jsonb,$9,$9)
        """,
        job_id,
        target_user_id,
        body.youtube_url,
        initial_status,
        0,
        "Starting pipeline..." if not multi_region else "Queued...",
        body.options.clip_count,
        queue_payload,
        now,
    )

    if multi_region:
        pool = await db.get_pool()
        await pool.execute("SELECT pg_notify('new_job', $1)", job_id)
    else:
        asyncio.create_task(
            run_pipeline(job_id, target_user_id, body.youtube_url, options),
            name=f"admin-assign-{job_id[:8]}",
        )

    logger.info(f"Admin {admin.email} generated job {job_id} for {body.email}")
    return {"job_id": job_id, "assigned_to": body.email}


@router.get("/admin/jobs/{job_id}/status")
async def admin_job_status(job_id: str, admin: AdminUser):
    """Admin: poll progress of any job (normal /jobs/{id}/stream 404s for non-owners)."""
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status":        job.get("status"),
        "progress":      job.get("progress", 0),
        "current_step":  job.get("current_step") or "",
        "clip_count":    job.get("clip_count", 0),
        "error_message": job.get("error_message"),
    }


# ── Onboarding tutorial video — single admin-uploaded video ────
#
# Hidden from users entirely until the admin uploads one (GET /tutorial
# returns video_url=None). Once uploaded, the dashboard nav shows a
# "Tutorial" link, and brand-new signups (see auth.py's is_new_user) are
# routed there once, right after their first sign-in.

_TUTORIAL_CONTENT_TYPES = {
    ".mp4":  "video/mp4",
    ".mov":  "video/quicktime",
    ".webm": "video/webm",
}


@router.get("/tutorial", tags=["public"])
async def get_tutorial(current_user: CurrentUser):
    """Any logged-in user: current onboarding tutorial video, if one exists."""
    row = await db.get_tutorial_video()
    return {"video_url": row["video_url"] if row else None}


@router.post("/admin/tutorial/upload")
async def admin_upload_tutorial(admin: AdminUser, file: UploadFile = File(...)):
    """Admin: upload/replace the onboarding tutorial video."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _TUTORIAL_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    blob_name = f"tutorial/{uuid.uuid4().hex[:12]}{ext}"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        loop = asyncio.get_running_loop()
        url = await loop.run_in_executor(None, _upload_to_gcs, tmp_path, blob_name, _TUTORIAL_CONTENT_TYPES[ext])
    finally:
        tmp_path.unlink(missing_ok=True)

    await db.set_tutorial_video(url, admin.email)
    logger.info(f"Admin {admin.email} uploaded the onboarding tutorial video")
    return {"video_url": url}


@router.delete("/admin/tutorial")
async def admin_delete_tutorial(admin: AdminUser):
    """Admin: remove the tutorial video — hides it from users again."""
    await db.clear_tutorial_video()
    logger.info(f"Admin {admin.email} removed the onboarding tutorial video")
    return {"success": True}

# ── Gameplay clips library ─────────────────────────────────────────

def _gameplay_bucket():
    from google.cloud import storage
    return storage.Client().bucket(settings.GAMEPLAY_GCS_BUCKET_NAME)


def _generate_thumb_from_video(video_bytes: bytes) -> bytes:
    """Extract a JPEG thumbnail from the video at 1s using FFmpeg."""
    import subprocess, tempfile, os
    with tempfile.TemporaryDirectory() as tmp:
        vpath = os.path.join(tmp, "input.mp4")
        tpath = os.path.join(tmp, "thumb.jpg")
        with open(vpath, "wb") as f:
            f.write(video_bytes)
        subprocess.run(
            ["ffmpeg", "-y", "-ss", "1", "-i", vpath, "-frames:v", "1",
             "-q:v", "3", "-vf", "scale=640:-1", tpath],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        with open(tpath, "rb") as f:
            return f.read()


def _upload_gameplay_sync(video_bytes: bytes, title: str) -> dict:
    clip_id = str(uuid.uuid4())
    bucket = _gameplay_bucket()
    gcs_base = f"https://storage.googleapis.com/{settings.GAMEPLAY_GCS_BUCKET_NAME}"

    # Auto-generate JPEG thumbnail from the video (no manual upload needed)
    thumb_bytes = _generate_thumb_from_video(video_bytes)

    video_blob = bucket.blob(f"gameplay_clips/{clip_id}.mp4")
    video_blob.upload_from_string(video_bytes, content_type="video/mp4")
    video_blob.metadata = {"title": title[:200], "clip_id": clip_id,
                           "added_at": datetime.now(timezone.utc).isoformat()}
    video_blob.patch()

    thumb_blob = bucket.blob(f"gameplay_thumbs/{clip_id}.jpg")
    thumb_blob.upload_from_string(thumb_bytes, content_type="image/jpeg")

    return {
        "id": clip_id,
        "title": title,
        "video_url": f"{gcs_base}/gameplay_clips/{clip_id}.mp4",
        "thumbnail_url": f"{gcs_base}/gameplay_thumbs/{clip_id}.jpg",
        "added_at": video_blob.metadata["added_at"],
    }


def _list_gameplay_sync() -> list[dict]:
    try:
        bucket = _gameplay_bucket()
        blobs = list(bucket.list_blobs(prefix="gameplay_clips/"))
        gcs_base = f"https://storage.googleapis.com/{settings.GAMEPLAY_GCS_BUCKET_NAME}"
        items = []
        for blob in blobs:
            if not blob.name.endswith(".mp4"):
                continue
            blob.reload()
            meta = blob.metadata or {}
            clip_id = meta.get("clip_id", blob.name.split("/")[-1][:-4])
            items.append({
                "id": clip_id,
                "title": meta.get("title", "Gameplay Clip"),
                "video_url": f"{gcs_base}/gameplay_clips/{clip_id}.mp4",
                "thumbnail_url": f"{gcs_base}/gameplay_thumbs/{clip_id}.jpg",
                "added_at": meta.get("added_at", ""),
                "blob_name": blob.name,
            })
        items.sort(key=lambda x: x["added_at"], reverse=True)
        return items
    except Exception as e:
        logger.error(f"Failed to list gameplay clips: {e}")
        return []


def _delete_gameplay_sync(clip_id: str) -> None:
    bucket = _gameplay_bucket()
    for prefix, ext in [("gameplay_clips", ".mp4"), ("gameplay_thumbs", ".jpg")]:
        try:
            bucket.blob(f"{prefix}/{clip_id}{ext}").delete()
        except Exception:
            pass


@router.get("/gameplay/list", tags=["public"])
async def list_gameplay_clips():
    if not settings.GAMEPLAY_GCS_BUCKET_NAME:
        return {"clips": [], "count": 0}
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_gameplay_sync)
    return {"clips": items, "count": len(items)}


@router.get("/admin/gameplay")
async def admin_list_gameplay(admin: AdminUser):
    if not settings.GAMEPLAY_GCS_BUCKET_NAME:
        raise HTTPException(status_code=503, detail="GAMEPLAY_GCS_BUCKET_NAME not configured")
    loop = asyncio.get_running_loop()
    items = await loop.run_in_executor(None, _list_gameplay_sync)
    return {"clips": items, "count": len(items)}


@router.post("/admin/gameplay/upload")
async def admin_upload_gameplay(
    admin: AdminUser,
    title: str = "Gameplay Clip",
    video: UploadFile = File(...),
):
    """Admin: upload a gameplay MP4. Thumbnail is auto-generated by FFmpeg."""
    if not settings.GAMEPLAY_GCS_BUCKET_NAME:
        raise HTTPException(status_code=503, detail="GAMEPLAY_GCS_BUCKET_NAME not configured")
    if not (video.filename or "").lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Video must be .mp4")

    video_bytes = await video.read()
    loop = asyncio.get_running_loop()
    try:
        entry = await loop.run_in_executor(None, _upload_gameplay_sync, video_bytes, title)
    except Exception as e:
        logger.error(f"Gameplay upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"Admin {admin.email} uploaded gameplay clip {entry['id']}")
    return {"success": True, "clip": entry}


@router.delete("/admin/gameplay/{clip_id}")
async def admin_delete_gameplay(clip_id: str, admin: AdminUser):
    if not settings.GAMEPLAY_GCS_BUCKET_NAME:
        raise HTTPException(status_code=503, detail="GAMEPLAY_GCS_BUCKET_NAME not configured")
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, _delete_gameplay_sync, clip_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    logger.info(f"Admin {admin.email} deleted gameplay clip {clip_id}")
    return {"success": True}
