"""
social.py — YouTube + TikTok OAuth and publishing endpoints.

YouTube flow:
  1. GET  /social/auth/youtube             → returns Google OAuth URL
  2. GET  /social/auth/youtube/callback    → exchanges code → stores refresh token
  3. POST /social/publish/youtube          → uploads clips to YouTube Shorts

TikTok flow (Content Posting API v2):
  1. GET  /social/auth/tiktok              → returns TikTok OAuth URL
  2. GET  /social/auth/tiktok/callback     → exchanges code → stores access+refresh tokens
  3. POST /social/publish/tiktok           → publishes clips via PULL_FROM_URL
  4. POST /social/publish/tiktok/status    → polls publish_id status

Utility:
  GET  /social/status  → returns { youtube: bool, tiktok: bool } for the calling user
"""

import asyncio
import io
import json
import logging
import secrets
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db

router = APIRouter(prefix="/social", tags=["social"])
logger = logging.getLogger(__name__)
settings = get_settings()

# ── Constants ─────────────────────────────────────────────────────

# YouTube
YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
_MAX_VIDEO_BYTES   = 500 * 1024 * 1024  # 500 MB safety cap
_GCS_FETCH_TIMEOUT = 120                 # seconds

# TikTok v2 endpoints
TIKTOK_AUTH_URL    = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL   = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_REFRESH_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_PUBLISH_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
TIKTOK_STATUS_URL  = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"
TIKTOK_SCOPES      = "user.info.basic,video.publish"


# ══════════════════════════════════════════════════════════════════
#  SHARED MODELS
# ══════════════════════════════════════════════════════════════════

class PublishItem(BaseModel):
    clip_id:     str
    video_url:   str
    title:       str = "Generated Short"
    description: str = ""
    tags:        List[str] = []


class PublishRequest(BaseModel):
    clips: List[PublishItem]


# ══════════════════════════════════════════════════════════════════
#  UTILITY: social token helpers
# ══════════════════════════════════════════════════════════════════

async def _get_social_tokens(user_id: str) -> dict:
    """Return the parsed social_tokens JSONB dict for a user (never None)."""
    user_data = await db.get_user(user_id)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    raw = user_data.get("social_tokens") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}
    return raw


async def _save_social_tokens(user_id: str, tokens: dict) -> None:
    """Persist updated social_tokens dict back to the users table."""
    await db._execute(
        "UPDATE users SET social_tokens=$1::jsonb WHERE id=$2",
        json.dumps(tokens),
        user_id,
    )


# ══════════════════════════════════════════════════════════════════
#  STATUS ENDPOINT
# ══════════════════════════════════════════════════════════════════

@router.get("/status")
async def social_status(current_user: CurrentUser):
    """
    Returns connected status for each platform.
    Frontend calls this on Dashboard mount to avoid relying on localStorage alone.
    """
    tokens = await _get_social_tokens(current_user.user_id)
    return {
        "youtube": bool(tokens.get("youtube", {}).get("refresh_token")),
        "tiktok":  bool(tokens.get("tiktok",  {}).get("access_token")),
    }


# ══════════════════════════════════════════════════════════════════
#  YOUTUBE — OAuth + publish
# ══════════════════════════════════════════════════════════════════

def _make_yt_flow():
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
        scopes=YT_SCOPES,
        redirect_uri=settings.SOCIAL_REDIRECT_URI,
    )


@router.get("/auth/youtube")
async def youtube_auth_init(current_user: CurrentUser):
    """Return Google OAuth URL for YouTube Upload consent."""
    flow = _make_yt_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=current_user.user_id,
    )
    return {"url": auth_url}


@router.get("/auth/youtube/callback")
async def youtube_auth_callback(code: str, state: str):
    """
    Google redirects here after consent.
    Exchanges code for tokens and stores the refresh token.
    """
    user_id = state

    def _fetch_token_sync() -> dict:
        import os
        os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"  # allow Google to return superset of requested scopes
        flow = _make_yt_flow()
        flow.fetch_token(code=code)
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
        logger.error(f"YouTube OAuth token exchange failed: {type(exc).__name__}: {exc}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard?status=youtube_error&reason=token_exchange_failed"
        )

    tokens = await _get_social_tokens(user_id)
    tokens["youtube"] = token_data
    await _save_social_tokens(user_id, tokens)

    return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?status=youtube_connected")


@router.post("/publish/youtube")
async def publish_to_youtube(body: PublishRequest, current_user: CurrentUser):
    """Bulk-upload clips to YouTube Shorts via Data API v3."""
    if not body.clips:
        return {"results": []}

    tokens = await _get_social_tokens(current_user.user_id)
    yt_tokens = tokens.get("youtube")
    if not yt_tokens or not yt_tokens.get("refresh_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="YouTube account not connected. Go to Settings → Connect YouTube.",
        )

    results = []
    for item in body.clips:
        result = await _upload_one_yt(item, yt_tokens)
        results.append(result)
    return {"results": results}


async def _upload_one_yt(item: PublishItem, yt_tokens: dict) -> dict:
    """Fetch clip from GCS and upload to YouTube — blocking I/O in executor."""
    try:
        async with httpx.AsyncClient(timeout=_GCS_FETCH_TIMEOUT) as client:
            resp = await client.get(item.video_url)
            if resp.status_code != 200:
                raise RuntimeError(f"GCS returned {resp.status_code}")
            if len(resp.content) > _MAX_VIDEO_BYTES:
                raise RuntimeError(f"Clip too large ({len(resp.content) // (1024*1024)} MB)")
            video_bytes = resp.content
    except Exception as exc:
        logger.error(f"GCS fetch failed for clip {item.clip_id}: {exc}")
        return {"clip_id": item.clip_id, "status": "failed", "error": str(exc)}

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
                "categoryId":  "22",
            },
            "status": {
                "privacyStatus":           "public",
                "selfDeclaredMadeForKids": False,
            },
        }
        media = MediaIoBaseUpload(io.BytesIO(video_bytes), mimetype="video/mp4", resumable=True)
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


# ══════════════════════════════════════════════════════════════════
#  TIKTOK — OAuth v2 + Content Posting API
# ══════════════════════════════════════════════════════════════════

@router.get("/auth/tiktok")
async def tiktok_auth_init(current_user: CurrentUser):
    """
    Returns TikTok OAuth v2 authorization URL.

    TikTok dev portal setup required:
      - Products: Login Kit + Content Posting API
      - Scopes:   user.info.basic, video.publish
      - Redirect URI (add both):
          Dev:  http://localhost:8080/social/auth/tiktok/callback
          Prod: https://shortclipr.com/social/auth/tiktok/callback
    """
    if not settings.TIKTOK_CLIENT_KEY:
        raise HTTPException(
            status_code=501,
            detail="TikTok integration is not configured yet. Add TIKTOK_CLIENT_KEY to .env",
        )

    # CSRF state: user_id + random nonce (nonce discarded — user_id carried in state)
    state = f"{current_user.user_id}"

    params = (
        f"?client_key={settings.TIKTOK_CLIENT_KEY}"
        f"&scope={TIKTOK_SCOPES}"
        f"&response_type=code"
        f"&redirect_uri={settings.TIKTOK_REDIRECT_URI}"
        f"&state={state}"
    )
    return {"url": f"{TIKTOK_AUTH_URL}{params}"}


@router.get("/auth/tiktok/callback")
async def tiktok_auth_callback(code: str, state: str, error: str = None):
    """
    TikTok redirects here after user grants consent.
    Exchanges authorization code for access + refresh tokens, stores them.
    """
    if error:
        logger.warning(f"TikTok OAuth error from user {state}: {error}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard?status=tiktok_error&reason={error}"
        )

    user_id = state

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                TIKTOK_TOKEN_URL,
                data={
                    "client_key":    settings.TIKTOK_CLIENT_KEY,
                    "client_secret": settings.TIKTOK_CLIENT_SECRET,
                    "code":          code,
                    "grant_type":    "authorization_code",
                    "redirect_uri":  settings.TIKTOK_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        data = resp.json()
    except Exception as exc:
        logger.error(f"TikTok token exchange network error: {exc}")
        raise HTTPException(status_code=502, detail="TikTok token exchange failed (network)")

    # TikTok v2 returns { data: { access_token, refresh_token, open_id, ... }, error: {...} }
    if resp.status_code != 200 or not data.get("data", {}).get("access_token"):
        err_msg = data.get("error", {}).get("message", "unknown")
        logger.error(f"TikTok token error for user {user_id}: {err_msg} — raw: {data}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/dashboard?status=tiktok_error&reason={err_msg}"
        )

    td = data["data"]
    tiktok_token = {
        "access_token":       td["access_token"],
        "refresh_token":      td.get("refresh_token", ""),
        "open_id":            td.get("open_id", ""),
        "scope":              td.get("scope", ""),
        "expires_in":         td.get("expires_in", 86400),        # default 24h
        "refresh_expires_in": td.get("refresh_expires_in", 0),
        "token_type":         td.get("token_type", "Bearer"),
    }

    tokens = await _get_social_tokens(user_id)
    tokens["tiktok"] = tiktok_token
    await _save_social_tokens(user_id, tokens)

    logger.info(f"TikTok connected for user {user_id} (open_id={tiktok_token['open_id']})")
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?status=tiktok_connected")


async def _tiktok_refresh_token(user_id: str, tt_tokens: dict) -> dict:
    """
    Refresh a TikTok access token using the refresh_token.
    Updates DB and returns the new token dict.
    """
    if not tt_tokens.get("refresh_token"):
        raise HTTPException(
            status_code=400,
            detail="TikTok refresh token missing. Please reconnect TikTok.",
        )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            TIKTOK_REFRESH_URL,
            data={
                "client_key":    settings.TIKTOK_CLIENT_KEY,
                "client_secret": settings.TIKTOK_CLIENT_SECRET,
                "grant_type":    "refresh_token",
                "refresh_token": tt_tokens["refresh_token"],
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    data = resp.json()
    if resp.status_code != 200 or not data.get("data", {}).get("access_token"):
        raise HTTPException(
            status_code=401,
            detail="TikTok token refresh failed — please reconnect TikTok.",
        )
    td = data["data"]
    new_tokens = {
        **tt_tokens,
        "access_token":  td["access_token"],
        "refresh_token": td.get("refresh_token", tt_tokens["refresh_token"]),
        "expires_in":    td.get("expires_in", 86400),
    }
    return new_tokens


@router.post("/publish/tiktok")
async def publish_to_tiktok(body: PublishRequest, current_user: CurrentUser):
    """
    Publish clips to TikTok via Content Posting API v2 (PULL_FROM_URL).
    TikTok fetches the video directly from the GCS public URL.

    Sandbox note: posts are visible only to sandbox testers;
    privacy_level is forced to SELF_ONLY in sandbox mode.
    """
    if not body.clips:
        return {"results": []}

    tokens = await _get_social_tokens(current_user.user_id)
    tt_tokens = tokens.get("tiktok")

    if not tt_tokens or not tt_tokens.get("access_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="TikTok account not connected. Connect TikTok to publish.",
        )

    access_token = tt_tokens["access_token"]
    results = []

    for item in body.clips:
        result = await _publish_one_tiktok(item, access_token)

        # If access token expired (error_code 10101 / 10102), refresh once and retry
        if result.get("tiktok_error_code") in (10101, 10102):
            try:
                new_tt = await _tiktok_refresh_token(current_user.user_id, tt_tokens)
                # Persist refreshed tokens
                tokens["tiktok"] = new_tt
                await _save_social_tokens(current_user.user_id, tokens)
                access_token = new_tt["access_token"]
                tt_tokens    = new_tt
                result = await _publish_one_tiktok(item, access_token)
            except HTTPException as exc:
                result = {"clip_id": item.clip_id, "status": "failed", "error": exc.detail}

        results.append(result)

    return {"results": results}


async def _publish_one_tiktok(item: PublishItem, access_token: str) -> dict:
    """
    Publish a single clip to TikTok via PULL_FROM_URL.
    Returns a result dict with status, publish_id (on success), or error.
    """
    payload = {
        "post_info": {
            "title":                  item.title[:150],
            "privacy_level":          "SELF_ONLY",   # safe default; upgrade to PUBLIC after review
            "disable_duet":           False,
            "disable_comment":        False,
            "disable_stitch":         False,
            "video_cover_timestamp_ms": 1000,
        },
        "source_info": {
            "source":    "PULL_FROM_URL",
            "video_url": item.video_url,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                TIKTOK_PUBLISH_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type":  "application/json; charset=UTF-8",
                },
            )
        data = resp.json()
    except Exception as exc:
        logger.error(f"TikTok publish network error for clip {item.clip_id}: {exc}")
        return {"clip_id": item.clip_id, "status": "failed", "error": str(exc)}

    logger.debug(f"TikTok publish response for {item.clip_id}: {resp.status_code} {data}")

    err = data.get("error", {})
    err_code = err.get("code", 0)

    if resp.status_code == 200 and err_code == "ok":
        publish_id = data.get("data", {}).get("publish_id", "")
        logger.info(f"TikTok queued clip {item.clip_id} → publish_id={publish_id}")
        return {"clip_id": item.clip_id, "status": "success", "publish_id": publish_id}
    else:
        msg = err.get("message", "Unknown TikTok error")
        logger.error(f"TikTok publish failed for {item.clip_id}: code={err_code} msg={msg}")
        return {
            "clip_id":            item.clip_id,
            "status":             "failed",
            "error":              msg,
            "tiktok_error_code":  err_code,
        }


class TikTokStatusRequest(BaseModel):
    publish_id: str


@router.post("/publish/tiktok/status")
async def tiktok_publish_status(body: TikTokStatusRequest, current_user: CurrentUser):
    """
    Poll TikTok for the publish status of a previously queued video.
    TikTok processes the video asynchronously; call this after receiving publish_id.
    Status values: PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, PUBLISH_COMPLETE, FAILED
    """
    tokens = await _get_social_tokens(current_user.user_id)
    tt_tokens = tokens.get("tiktok")
    if not tt_tokens or not tt_tokens.get("access_token"):
        raise HTTPException(status_code=400, detail="TikTok not connected.")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                TIKTOK_STATUS_URL,
                json={"publish_id": body.publish_id},
                headers={
                    "Authorization": f"Bearer {tt_tokens['access_token']}",
                    "Content-Type":  "application/json; charset=UTF-8",
                },
            )
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TikTok status check failed: {exc}")

    return {
        "publish_id": body.publish_id,
        "status":     data.get("data", {}).get("status", "UNKNOWN"),
        "raw":        data,
    }


@router.delete("/disconnect/tiktok")
async def tiktok_disconnect(current_user: CurrentUser):
    """Remove stored TikTok tokens (user-initiated disconnect)."""
    tokens = await _get_social_tokens(current_user.user_id)
    tokens.pop("tiktok", None)
    await _save_social_tokens(current_user.user_id, tokens)
    return {"status": "disconnected"}


@router.delete("/disconnect/youtube")
async def youtube_disconnect(current_user: CurrentUser):
    """Remove stored YouTube tokens (user-initiated disconnect)."""
    tokens = await _get_social_tokens(current_user.user_id)
    tokens.pop("youtube", None)
    await _save_social_tokens(current_user.user_id, tokens)
    return {"status": "disconnected"}
