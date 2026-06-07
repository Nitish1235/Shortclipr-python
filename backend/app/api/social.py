"""
social.py — YouTube OAuth + publishing endpoints.

Flow:
  1. GET  /social/auth/youtube           → returns Google OAuth URL
  2. GET  /social/auth/youtube/callback  → exchanges code → stores refresh token
  3. POST /social/publish/youtube        → uploads selected clips to YouTube Shorts

All blocking OAuth/Google API calls run inside asyncio.get_event_loop().run_in_executor
so they never stall the FastAPI event loop.
"""

import asyncio
import io
import json
import logging
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, HttpUrl

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db

router = APIRouter(prefix="/social", tags=["social"])
logger = logging.getLogger(__name__)
settings = get_settings()

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# Max video size we'll stream to YouTube (500 MB safety cap)
_MAX_VIDEO_BYTES = 500 * 1024 * 1024
# Timeout for fetching a clip from GCS before uploading to YouTube
_GCS_FETCH_TIMEOUT = 120  # seconds


# ── OAuth flow helpers ─────────────────────────────────────────

def _make_flow():
    from google_auth_oauthlib.flow import Flow
    return Flow.from_client_config(
        {
            "web": {
                "client_id":     settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
                "token_uri":     "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.SOCIAL_REDIRECT_URI,
    )


# ── Step 1: Initiate OAuth ────────────────────────────────────

@router.get("/auth/youtube")
async def youtube_auth_init(current_user: CurrentUser):
    """Return Google OAuth URL for YouTube Upload consent."""
    flow = _make_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=current_user.user_id,
    )
    return {"url": auth_url}


# ── Step 2: OAuth callback ────────────────────────────────────

@router.get("/auth/youtube/callback")
async def youtube_auth_callback(code: str, state: str):
    """
    Google redirects here after user grants consent.
    Exchanges authorization code for tokens and persists the refresh token.
    Runs blocking OAuth I/O in a thread executor.
    """
    user_id = state

    def _fetch_token_sync() -> dict:
        flow = _make_flow()
        flow.fetch_token(code=code)          # blocking HTTP call — runs in executor
        creds = flow.credentials
        return {
            "refresh_token": creds.refresh_token,
            "token_uri":     creds.token_uri,
            "client_id":     creds.client_id,
            "client_secret": creds.client_secret,
            "expiry":        creds.expiry.isoformat() if creds.expiry else None,
        }

    loop = asyncio.get_running_loop()
    try:
        token_data = await loop.run_in_executor(None, _fetch_token_sync)
    except Exception as exc:
        logger.error(f"YouTube OAuth token exchange failed: {exc}")
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    user_data = await db.get_user(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    existing_tokens = user_data.get("social_tokens") or {}
    if isinstance(existing_tokens, str):
        try:
            existing_tokens = json.loads(existing_tokens)
        except Exception:
            existing_tokens = {}

    existing_tokens["youtube"] = token_data
    await db._execute(
        "UPDATE users SET social_tokens=$1::jsonb WHERE id=$2",
        json.dumps(existing_tokens),
        user_id,
    )

    return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?status=social_connected")


# ── Step 3: Publish to YouTube ────────────────────────────────

class PublishItem(BaseModel):
    clip_id:     str
    video_url:   str           # GCS public URL of the processed clip
    title:       str = "Generated Short"
    description: str = ""
    tags:        List[str] = []


class PublishRequest(BaseModel):
    clips: List[PublishItem]


@router.post("/publish/youtube")
async def publish_to_youtube(
    body: PublishRequest,
    current_user: CurrentUser,
):
    """
    Bulk-upload selected clips to YouTube Shorts.
    Each clip is fetched from GCS and uploaded via YouTube Data API v3.
    Blocking Google API calls run in a thread executor to avoid blocking the event loop.
    """
    if not body.clips:
        return {"results": []}

    user_data = await db.get_user(current_user.user_id)
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found")

    raw_tokens = user_data.get("social_tokens") or {}
    if isinstance(raw_tokens, str):
        try:
            raw_tokens = json.loads(raw_tokens)
        except Exception:
            raw_tokens = {}

    yt_tokens = raw_tokens.get("youtube") if raw_tokens else None
    if not yt_tokens or not yt_tokens.get("refresh_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="YouTube account not connected. Go to Settings → Connect YouTube.",
        )

    results = []
    for item in body.clips:
        result = await _upload_one_clip(item, yt_tokens)
        results.append(result)

    return {"results": results}


async def _upload_one_clip(item: PublishItem, yt_tokens: dict) -> dict:
    """Fetch clip from GCS then upload to YouTube — all I/O in executor."""

    # ── 1. Download clip bytes from GCS ───────────────────────
    try:
        async with httpx.AsyncClient(timeout=_GCS_FETCH_TIMEOUT) as client:
            resp = await client.get(item.video_url)
            if resp.status_code != 200:
                raise RuntimeError(f"GCS returned {resp.status_code}")
            if len(resp.content) > _MAX_VIDEO_BYTES:
                raise RuntimeError(
                    f"Clip too large ({len(resp.content) // (1024*1024)} MB > 500 MB limit)"
                )
            video_bytes = resp.content
    except Exception as exc:
        logger.error(f"Failed to fetch clip {item.clip_id} from GCS: {exc}")
        return {"clip_id": item.clip_id, "status": "failed", "error": str(exc)}

    # ── 2. Upload to YouTube (blocking — run in executor) ─────
    def _youtube_upload_sync() -> str:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseUpload

        creds = Credentials(
            token=None,
            refresh_token=yt_tokens["refresh_token"],
            token_uri=yt_tokens["token_uri"],
            client_id=yt_tokens["client_id"],
            client_secret=yt_tokens["client_secret"],
        )
        youtube = build("youtube", "v3", credentials=creds)

        body_dict = {
            "snippet": {
                "title":       item.title[:100],
                "description": item.description[:5000],
                "tags":        item.tags[:500],
                "categoryId":  "22",      # People & Blogs
            },
            "status": {
                "privacyStatus":            "public",
                "selfDeclaredMadeForKids":  False,
            },
        }
        media = MediaIoBaseUpload(
            io.BytesIO(video_bytes),
            mimetype="video/mp4",
            resumable=True,
        )
        request  = youtube.videos().insert(part="snippet,status", body=body_dict, media_body=media)
        response = request.execute()
        return response["id"]

    loop = asyncio.get_running_loop()
    try:
        youtube_id = await loop.run_in_executor(None, _youtube_upload_sync)
        logger.info(f"Uploaded clip {item.clip_id} → YouTube {youtube_id}")
        return {"clip_id": item.clip_id, "youtube_id": youtube_id, "status": "success"}
    except Exception as exc:
        logger.error(f"YouTube upload failed for {item.clip_id}: {exc}")
        return {"clip_id": item.clip_id, "status": "failed", "error": str(exc)}


# ── TikTok placeholder ─────────────────────────────────────────

@router.post("/publish/tiktok")
async def publish_to_tiktok(current_user: CurrentUser):
    """TikTok publishing — scaffolded, integration pending official API approval."""
    return {
        "status":  "pending",
        "message": "TikTok direct publishing is coming in a future release.",
    }
