import asyncio

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from ..core.config import Settings, get_settings
from ..core.security import create_access_token
from ..db import get_pool
from ..dependencies import ADMIN_EMAIL_ALLOWLIST, CurrentUser, current_user
from ..models.schemas import AuthResponse, GoogleAuthRequest, UserResponse


router = APIRouter(prefix="/v1/auth", tags=["auth"])


def user_response(user: CurrentUser) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name, avatar_url=user.avatar_url, plan=user.plan, subscription_status=user.subscription_status, is_admin=user.is_admin)


@router.post("/google", response_model=AuthResponse)
async def google_login(payload: GoogleAuthRequest, settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)) -> AuthResponse:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google login is not configured")
    try:
        claims = await asyncio.to_thread(id_token.verify_oauth2_token, payload.credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google credential could not be verified") from None
    email = str(claims.get("email", "")).strip().lower()
    subject = str(claims.get("sub", ""))
    if not email or not subject or not claims.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A verified Google email is required")
    async with pool.acquire() as connection:
        async with connection.transaction():
            existing = await connection.fetchrow("SELECT google_sub FROM users WHERE email=$1 FOR UPDATE", email)
            if existing and existing["google_sub"] and existing["google_sub"] != subject:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This email is already linked to a different Google account")
            row = await connection.fetchrow(
                """
                INSERT INTO users(email,full_name,avatar_url,google_sub)
                VALUES($1,$2,$3,$4)
                ON CONFLICT (email) DO UPDATE SET
                    full_name=COALESCE(NULLIF(EXCLUDED.full_name,''),users.full_name),
                    avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
                    google_sub=COALESCE(users.google_sub,EXCLUDED.google_sub)
                RETURNING id,email,full_name,avatar_url,plan,subscription_status
                """,
                email,
                str(claims.get("name", "")),
                claims.get("picture"),
                subject,
            )
            await connection.execute(
                """
                INSERT INTO credit_accounts(user_id,total_credits,cycle_started_at,cycle_ends_at)
                VALUES($1,$2,date_trunc('month',now()),date_trunc('month',now())+interval '1 month')
                ON CONFLICT(user_id) DO UPDATE SET
                    total_credits=EXCLUDED.total_credits+credit_accounts.reserved_credits,
                    spent_credits=0,
                    cycle_started_at=EXCLUDED.cycle_started_at,
                    cycle_ends_at=EXCLUDED.cycle_ends_at
                WHERE $3='free' AND credit_accounts.cycle_ends_at<=now()
                """,
                row["id"],
                settings.FREE_MONTHLY_RENDER_SECONDS,
                row["plan"],
            )
    user = CurrentUser(**dict(row), is_admin=email in ADMIN_EMAIL_ALLOWLIST)
    return AuthResponse(access_token=create_access_token(str(user.id), user.email, settings), user=user_response(user))


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser = Depends(current_user)) -> UserResponse:
    return user_response(user)
