"""
auth.py — Google OAuth authentication endpoint.

Flow:
  1. Frontend calls Google Sign-In → gets id_token (Google credential)
  2. POST /auth/google {id_token} → this endpoint
  3. Verify id_token with Google's tokeninfo API
  4. Upsert user in Supabase users table
  5. Return our own signed JWT (7-day expiry)
  6. Frontend stores JWT → sends as Authorization: Bearer header
"""

import logging
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import (
    AuthUser,
    create_access_token,
    verify_google_id_token,
)
from app.db import supabase as db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

PLAN_CREDITS: dict[str, int] = {
    "free": 3,
    "starter": 20,
    "pro": 999999,  # unlimited
}


class GoogleAuthRequest(BaseModel):
    id_token: str  # Google credential from @react-oauth/google


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/google", response_model=AuthResponse)
async def google_auth(body: GoogleAuthRequest):
    """
    Exchange a Google ID token for a ShortClipr JWT.
    Creates a new user on first sign-in; returns existing user on subsequent logins.
    """
    try:
        # Verify token with Google
        google_data = await verify_google_id_token(body.id_token)

        email = google_data.get("email", "")
        google_sub = google_data.get("sub", "")
        full_name = google_data.get("name", "")
        avatar_url = google_data.get("picture", "")

        # Upsert user in database
        import uuid
        user = await db.upsert_user({
            "id": uuid.uuid4(),          # pass UUID object — asyncpg expects it
            "email": email,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "google_sub": google_sub,
            "plan": "free",
            "credits_used": 0,
            "credits_limit": PLAN_CREDITS["free"],
            "created_at": datetime.now(timezone.utc),
        })

        # asyncpg returns UUID columns as uuid.UUID objects — coerce to str for JSON/Pydantic
        user_id = str(user["id"])
        user_email = str(user["email"])

        # Issue our JWT
        token = create_access_token({
            "sub": user_id,
            "email": user_email,
            "plan": user.get("plan", "free"),
        })

        return AuthResponse(
            access_token=token,
            user={
                "user_id": user_id,
                "email": user_email,
                "full_name": user.get("full_name", "") or "",
                "avatar_url": user.get("avatar_url", "") or "",
                "plan": user.get("plan", "free"),
                "credits_used": user.get("credits_used", 0),
                "credits_limit": user.get("credits_limit", 3),
            },
        )
    except HTTPException:
        raise  # let FastAPI handle 401s from token verification
    except Exception as exc:
        logger.error("[/auth/google] Unhandled error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}")


@router.get("/me")
async def get_me(current_user: AuthUser):
    """Return current user info + plan stats."""
    user = await db.get_user(current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": user["id"],
        "email": user["email"],
        "full_name": user.get("full_name", ""),
        "avatar_url": user.get("avatar_url", ""),
        "plan": user.get("plan", "free"),
        "credits_used": user.get("credits_used", 0),
        "credits_limit": user.get("credits_limit", 3),
        "videos_remaining": max(0, user.get("credits_limit", 3) - user.get("credits_used", 0)),
    }
