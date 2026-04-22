"""
Auth dependencies for FastAPI routes.
Google OAuth flow:
  1. Frontend gets ID token from Google Sign-In
  2. POST /auth/google {id_token} → backend verifies with Google
  3. Backend upserts user in Supabase → returns signed JWT
  4. All protected routes use: Authorization: Bearer <our_jwt>
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import get_settings
from app.db import supabase as db

logger = logging.getLogger(__name__)
settings = get_settings()

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

bearer_scheme = HTTPBearer()


# ── Models ────────────────────────────────────────────────────

class TokenPayload(BaseModel):
    sub: str          # user_id (UUID from our Supabase users table)
    email: str
    plan: str = "free"


class AuthUser(BaseModel):
    user_id: str
    email: str
    full_name: str
    avatar_url: str
    plan: str


# ── Google ID token verification ──────────────────────────────

async def verify_google_id_token(id_token: str) -> dict:
    """
    Verify Google ID token by calling Google's tokeninfo endpoint.
    Returns the decoded token payload on success.
    Raises HTTPException on failure.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            GOOGLE_TOKENINFO_URL,
            params={"id_token": id_token},
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google ID token",
            )
        data = resp.json()

    # Verify audience (prevents token reuse from other apps)
    if data.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token audience mismatch",
        )

    if data.get("email_verified") != "true":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email not verified",
        )

    return data


# ── JWT creation/verification ─────────────────────────────────

def create_access_token(payload: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {**payload, "exp": expire},
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> TokenPayload:
    try:
        data = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        return TokenPayload(**data)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


# ── FastAPI dependency: get current user ──────────────────────

async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> AuthUser:
    payload = decode_access_token(creds.credentials)
    user = await db.get_user(payload.sub)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return AuthUser(
        user_id=user["id"],
        email=user["email"],
        full_name=user.get("full_name", ""),
        avatar_url=user.get("avatar_url", ""),
        plan=user.get("plan", "free"),
    )


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
