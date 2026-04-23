import logging
import httpx
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db

router = APIRouter(prefix="/social", tags=["social"])
logger = logging.getLogger(__name__)
settings = get_settings()

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

def get_flow():
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.SOCIAL_REDIRECT_URI
    )

@router.get("/auth/youtube")
async def youtube_auth_init(current_user: CurrentUser):
    """
    Step 1: Redirect user to Google for YouTube Upload consent.
    State stores the user_id to map the callback.
    """
    flow = get_flow()
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent',
        state=current_user.user_id
    )
    return {"url": auth_url}

@router.get("/auth/youtube/callback")
async def youtube_auth_callback(code: str, state: str):
    """
    Step 2: Google redirects here with code.
    Fetch tokens and save refresh token to user's social_tokens in DB.
    """
    user_id = state
    flow = get_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials

    # Update User Record with YouTube Refresh Token
    user_data = await db.get_user(user_id)
    social_tokens = user_data.get("social_tokens", {})
    
    social_tokens["youtube"] = {
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "expiry": credentials.expiry.isoformat() if credentials.expiry else None
    }

    import json
    await db._execute("UPDATE users SET social_tokens=$1::jsonb WHERE id=$2", json.dumps(social_tokens), user_id)
    
    # Redirect back to frontend dashboard (dynamic for production)
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/dashboard?status=social_connected")

@router.post("/publish/youtube")
async def publish_to_youtube(
    payload: List[dict], # List of {clip_id, video_url, title, description, tags}
    current_user: CurrentUser
):
    """
    Bulk upload selected clips to YouTube.
    """
    user_data = await db.get_user(current_user.user_id)
    tokens = user_data.get("social_tokens", {}).get("youtube") if user_data.get("social_tokens") else None
    if not tokens or not tokens.get("refresh_token"):
        raise HTTPException(status_code=400, detail="YouTube account not connected.")

    # Reconstruct credentials to get fresh access token
    from google.oauth2.credentials import Credentials
    creds = Credentials(
        None,
        refresh_token=tokens["refresh_token"],
        token_uri=tokens["token_uri"],
        client_id=tokens["client_id"],
        client_secret=tokens["client_secret"]
    )

    youtube = build("youtube", "v3", credentials=creds)

    results = []
    for item in payload:
        try:
            # 1. Download file from GCS
            async with httpx.AsyncClient() as client:
                resp = await client.get(item["video_url"])
                if resp.status_code != 200:
                    raise Exception(f"Failed to fetch video from GCS: {item['video_url']}")
                video_bytes = io.BytesIO(resp.content)

            # 2. Upload to YouTube
            body = {
                "snippet": {
                    "title": item.get("title", "Generated Short"),
                    "description": item.get("description", ""),
                    "tags": item.get("tags", []),
                    "categoryId": "22" # People & Blogs
                },
                "status": {
                    "privacyStatus": "public",
                    "selfDeclaredMadeForKids": False
                }
            }

            media = MediaIoBaseUpload(video_bytes, mimetype="video/mp4", resumable=True)
            request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
            response = request.execute()

            results.append({"clip_id": item["clip_id"], "youtube_id": response["id"], "status": "success"})
        except Exception as e:
            logger.error(f"YouTube upload failed for {item.get('clip_id')}: {str(e)}")
            results.append({"clip_id": item["clip_id"], "status": "failed", "error": str(e)})

    return {"results": results}

@router.post("/publish/tiktok")
async def publish_to_tiktok(current_user: CurrentUser):
    """Placeholder for TikTok publishing logic — Hidden in UI."""
    return {"status": "debug", "message": "TikTok scaffolding active. Integration pending official approval."}
