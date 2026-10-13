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

import bcrypt as _bcrypt_lib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import (
    CurrentUser,
    create_access_token,
    verify_google_id_token,
)
from app.core.plan_limits import get_credits_limit, get_video_minutes_limit
from app.db import supabase as db

def _hash_pw(password: str) -> str:
    return _bcrypt_lib.hashpw(password.encode(), _bcrypt_lib.gensalt()).decode()

def _verify_pw(password: str, hashed: str) -> bool:
    return _bcrypt_lib.checkpw(password.encode(), hashed.encode())

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


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
            "id": uuid.uuid4(),
            "email": email,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "google_sub": google_sub,
            "plan": "free",
            "credits_used": 0,
            "credits_limit":       get_credits_limit("free"),
            "video_minutes_used":  0,
            "video_minutes_limit": get_video_minutes_limit("free"),
            "created_at": datetime.now(timezone.utc),
        })
        tutorial = await db.get_tutorial_video()

        # asyncpg returns UUID columns as uuid.UUID objects — coerce to str for JSON/Pydantic
        user_id = str(user["id"])
        user_email = str(user["email"])

        if user.get("is_new_user"):
            from app.core.tiktok_events import send_tiktok_event_background
            send_tiktok_event_background(
                event_name="CompleteRegistration",
                event_id=f"reg_{user_id}",
                email=user_email
            )
            from app.core.google_ads_events import record_google_ads_event_background
            record_google_ads_event_background(
                event_name="CompleteRegistration",
                event_id=f"registration_{user_id}",
                email=user_email,
                product="shortclipr",
            )

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
                "subscription_status": user.get("subscription_status", "none"),
                "plan_expires_at": user.get("plan_expires_at"),
                "credits_used": user.get("credits_used", 0),
                "credits_limit": user.get("credits_limit", get_credits_limit("free")),
                "brainrot_plan": user.get("brainrot_plan", "free"),
                "brainrot_credits_used": user.get("brainrot_credits_used", 0),
                "brainrot_credits_limit": user.get("brainrot_credits_limit", 2),
                "has_submitted_feedback": await db.has_submitted_feedback(user_id),
                "is_new_user": bool(user.get("is_new_user")),
                "tutorial_available": bool(tutorial),
            },
        )
    except HTTPException:
        raise  # let FastAPI handle 401s from token verification
    except Exception as exc:
        logger.error("[/auth/google] Unhandled error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}")


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class SetPasswordRequest(BaseModel):
    password: str


def _build_user_response(user: dict, token: str) -> AuthResponse:
    user_id = str(user["id"])
    return AuthResponse(
        access_token=token,
        user={
            "user_id": user_id,
            "email": str(user["email"]),
            "full_name": user.get("full_name", "") or "",
            "avatar_url": user.get("avatar_url", "") or "",
            "plan": user.get("plan", "free"),
            "subscription_status": user.get("subscription_status", "none"),
            "plan_expires_at": user.get("plan_expires_at"),
            "credits_used": user.get("credits_used", 0),
            "credits_limit": user.get("credits_limit", get_credits_limit("free")),
            "brainrot_plan": user.get("brainrot_plan", "free"),
            "brainrot_credits_used": user.get("brainrot_credits_used", 0),
            "brainrot_credits_limit": user.get("brainrot_credits_limit", 2),
        },
    )


@router.post("/email-login", response_model=AuthResponse)
async def email_login(body: EmailLoginRequest):
    """
    Sign in with email + password.
    Only works for Google OAuth users who have previously set a password
    via POST /auth/set-password.
    """
    email = body.email.strip().lower()
    if not email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = await db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    stored_hash = user.get("password_hash")
    if not stored_hash:
        raise HTTPException(
            status_code=401,
            detail="No password set for this account. Sign in with Google, then go to Settings → Set Password.",
        )

    if not _verify_pw(body.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({
        "sub": str(user["id"]),
        "email": str(user["email"]),
        "plan": user.get("plan", "free"),
    })
    return _build_user_response(dict(user), token)


@router.post("/set-password")
async def set_password(body: SetPasswordRequest, current_user: CurrentUser):
    """
    Set or update the password for the currently authenticated user.
    Requires the user to already be authenticated (Google OAuth JWT).
    Password must be at least 8 characters.
    """
    pw = body.password
    if not pw or len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    hashed = _hash_pw(pw)
    await db._execute(
        "UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2",
        hashed,
        current_user.user_id,
    )
    return {"ok": True, "message": "Password set successfully."}


@router.get("/me")
async def get_me(current_user: CurrentUser):
    """Return current user info + plan stats."""
    user = await db.get_user(current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    credits_used  = int(user.get("credits_used",  0) or 0)
    credits_limit = int(user.get("credits_limit", get_credits_limit("free")) or 0)
    vm_used       = int(user.get("video_minutes_used",  0) or 0)
    vm_limit      = int(user.get("video_minutes_limit", get_video_minutes_limit("free")) or 0)
    br_used       = int(user.get("brainrot_credits_used",  0) or 0)
    br_limit      = int(user.get("brainrot_credits_limit", 2) or 2)

    return {
        "user_id":    str(user["id"]),
        "email":      user["email"],
        "full_name":  user.get("full_name", ""),
        "avatar_url": user.get("avatar_url", ""),
        "plan":       user.get("plan", "free"),
        "subscription_status": user.get("subscription_status", "none"),
        "plan_expires_at": user.get("plan_expires_at"),
        # Shorts quota
        "credits_used":       credits_used,
        "credits_limit":      credits_limit,
        "videos_remaining":   max(0, credits_limit - credits_used),
        # Video-hours quota
        "video_minutes_used":      vm_used,
        "video_minutes_limit":     vm_limit,
        "video_minutes_remaining": max(0, vm_limit - vm_used),
        # Brainrot quota — fully separate plan/pool from the above (migration 016)
        "brainrot_plan":               user.get("brainrot_plan", "free"),
        "brainrot_credits_used":       br_used,
        "brainrot_credits_limit":      br_limit,
        "brainrot_credits_remaining":  max(0, br_limit - br_used),
        "has_submitted_feedback": await db.has_submitted_feedback(str(user["id"])),
    }


class CtaSettingsBody(BaseModel):
    enabled: bool = False
    pages: list = []
    color: str = "#FFFFFF"
    watermark_y: float = 75.0


@router.get("/cta-settings")
async def get_cta_settings(current_user: CurrentUser):
    """Return the marketer user's saved CTA settings."""
    data = await db.get_cta_settings(current_user.user_id)
    if data is None:
        return {"enabled": False, "pages": _default_cta_pages(), "color": "#FFFFFF", "watermark_y": 75.0}
    return data


@router.put("/cta-settings")
async def save_cta_settings(body: CtaSettingsBody, current_user: CurrentUser):
    """Save the marketer user's CTA settings."""
    if current_user.plan != "marketer":
        raise HTTPException(status_code=403, detail="CTA settings are only available on the marketer plan.")
    await db.save_cta_settings(current_user.user_id, body.model_dump())
    return {"ok": True}


def _default_cta_pages() -> list:
    return [
        {"words": ["TURN", "LONG", "VIDEOS"], "animation": "staggered_stack", "x": 50, "y": 50, "font_size": 120},
        {"words": ["INTO"], "animation": "massive_pop", "x": 50, "y": 50, "font_size": 220},
        {"words": ["SHORTS"], "animation": "massive_pop", "x": 50, "y": 50, "font_size": 220},
        {"words": ["NO", "EDITING", "REQUIRED"], "animation": "staggered_stack", "x": 50, "y": 50, "font_size": 120},
    ]
