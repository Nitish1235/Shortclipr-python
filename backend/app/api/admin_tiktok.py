"""
admin_tiktok.py — Admin-only fake TikTok profile mockups.

Lets the admin create multiple mock TikTok "accounts" (avatar, handle,
display name, bio, stats) and file any generated clip — from either
product (YT-Shorts clips or Brainrot jobs) — into one of them, rendered
as a TikTok-style profile grid in the admin panel.

Purely an internal staging/preview tool: nothing here is public-facing
or posted to TikTok. Clips are referenced by URL from their source job,
never copied — deleting a mock account/clip row never touches the
source job/clip.

Endpoints (all admin-gated):
  GET    /admin/tiktok/accounts               — list accounts + clip counts
  POST   /admin/tiktok/accounts               — create an account
  PATCH  /admin/tiktok/accounts/{id}          — update profile fields
  DELETE /admin/tiktok/accounts/{id}          — delete an account (+ its clips)
  POST   /admin/tiktok/accounts/avatar        — upload an avatar image, returns URL
  GET    /admin/tiktok/accounts/{id}/clips    — list clips filed under an account
  POST   /admin/tiktok/accounts/{id}/clips    — file a clip into an account
  DELETE /admin/tiktok/accounts/{id}/clips/{clip_row_id} — remove a filed clip
"""

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.admin import AdminUser
from app.db import supabase as db
from app.pipeline.uploader import _upload_to_gcs

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-tiktok"])

_AVATAR_PREFIX = "tiktok_avatars/"
_AVATAR_CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
}

# 'brainrot' kept as an accepted value for any clips filed before the
# Factloop rebrand (the underlying table is still brainrot_jobs); 'factloop'
# is what the current UI files new clips under. Both just tag the row —
# video_url is supplied directly, never re-fetched by this value.
_VALID_SOURCES = ("ytshorts", "brainrot", "factloop")


# ── Serializers ──────────────────────────────────────────────

def _serialize_account(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "handle": row["handle"],
        "display_name": row.get("display_name", ""),
        "bio": row.get("bio", ""),
        "avatar_url": row.get("avatar_url", ""),
        "followers": row.get("followers", "0"),
        "following": row.get("following", "0"),
        "likes": row.get("likes", "0"),
        "verified": bool(row.get("verified", False)),
        "clip_count": int(row.get("clip_count", 0) or 0),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def _serialize_clip(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "account_id": str(row["account_id"]),
        "source": row["source"],
        "job_id": row["job_id"],
        "clip_id": row.get("clip_id"),
        "title": row.get("title", ""),
        "video_url": row["video_url"],
        "thumbnail_url": row.get("thumbnail_url", ""),
        "caption": row.get("caption", ""),
        "likes": row.get("likes", ""),
        "comments": row.get("comments", ""),
        "added_at": row["added_at"].isoformat() if row.get("added_at") else None,
    }


# ── Account CRUD ─────────────────────────────────────────────

class AccountRequest(BaseModel):
    handle: str
    display_name: str = ""
    bio: str = ""
    avatar_url: str = ""
    followers: str = "0"
    following: str = "0"
    likes: str = "0"
    verified: bool = False


@router.get("/admin/tiktok/accounts")
async def admin_list_tiktok_accounts(admin: AdminUser):
    rows = await db.list_tiktok_accounts()
    return {"accounts": [_serialize_account(r) for r in rows]}


@router.post("/admin/tiktok/accounts")
async def admin_create_tiktok_account(body: AccountRequest, admin: AdminUser):
    handle = body.handle.strip().lstrip("@")
    if not handle:
        raise HTTPException(status_code=400, detail="Handle is required")
    row = await db.create_tiktok_account(handle, body.display_name.strip(), body.bio, body.avatar_url, body.verified)
    logger.info(f"Admin {admin.email} created fake TikTok account @{handle}")
    return {"account": _serialize_account({**row, "clip_count": 0})}


@router.patch("/admin/tiktok/accounts/{account_id}")
async def admin_update_tiktok_account(account_id: str, body: AccountRequest, admin: AdminUser):
    handle = body.handle.strip().lstrip("@")
    if not handle:
        raise HTTPException(status_code=400, detail="Handle is required")
    row = await db.update_tiktok_account(
        account_id, handle, body.display_name.strip(), body.bio, body.avatar_url,
        body.followers, body.following, body.likes, body.verified,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"account": _serialize_account(row)}


@router.delete("/admin/tiktok/accounts/{account_id}")
async def admin_delete_tiktok_account(account_id: str, admin: AdminUser):
    await db.delete_tiktok_account(account_id)
    logger.info(f"Admin {admin.email} deleted fake TikTok account {account_id}")
    return {"success": True}


@router.post("/admin/tiktok/accounts/avatar")
async def admin_upload_tiktok_avatar(admin: AdminUser, file: UploadFile = File(...)):
    """Upload a profile picture for a mock account. Returns the GCS URL to
    save onto the account via PATCH /admin/tiktok/accounts/{id}."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _AVATAR_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    blob_name = f"{_AVATAR_PREFIX}{uuid.uuid4().hex[:12]}{ext}"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)

    try:
        loop = asyncio.get_running_loop()
        url = await loop.run_in_executor(None, _upload_to_gcs, tmp_path, blob_name, _AVATAR_CONTENT_TYPES[ext])
    finally:
        tmp_path.unlink(missing_ok=True)

    logger.info(f"Admin {admin.email} uploaded a TikTok mock avatar")
    return {"url": url}


# ── Account clips ────────────────────────────────────────────

class AddAccountClipRequest(BaseModel):
    source: str            # 'ytshorts' | 'brainrot'
    job_id: str
    clip_id: str = ""
    title: str = ""
    video_url: str
    thumbnail_url: str = ""
    caption: str = ""
    likes: str = ""
    comments: str = ""


@router.get("/admin/tiktok/accounts/{account_id}/clips")
async def admin_list_tiktok_account_clips(account_id: str, admin: AdminUser):
    rows = await db.list_tiktok_account_clips(account_id)
    return {"clips": [_serialize_clip(r) for r in rows]}


@router.post("/admin/tiktok/accounts/{account_id}/clips")
async def admin_add_tiktok_account_clip(account_id: str, body: AddAccountClipRequest, admin: AdminUser):
    if body.source not in _VALID_SOURCES:
        raise HTTPException(status_code=400, detail="source must be 'ytshorts', 'brainrot', or 'factloop'")
    account = await db.get_tiktok_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    row = await db.add_tiktok_account_clip(
        account_id, body.source, body.job_id, body.clip_id or None, body.title,
        body.video_url, body.thumbnail_url, body.caption, body.likes, body.comments,
    )
    logger.info(f"Admin {admin.email} filed a {body.source} clip into TikTok mock @{account['handle']}")
    return {"clip": _serialize_clip(row)}


@router.delete("/admin/tiktok/accounts/{account_id}/clips/{clip_row_id}")
async def admin_remove_tiktok_account_clip(account_id: str, clip_row_id: str, admin: AdminUser):
    await db.delete_tiktok_account_clip(clip_row_id)
    return {"success": True}
