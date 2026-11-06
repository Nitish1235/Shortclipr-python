from dataclasses import dataclass
from uuid import UUID

import asyncpg
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .core.config import Settings, get_settings
from .core.security import decode_access_token, valid_internal_secret
from .db import get_pool


bearer = HTTPBearer(auto_error=False)
ADMIN_EMAIL_ALLOWLIST = frozenset({"nitantig@gmail.com", "jainnitish432@gmail.com"})


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    full_name: str
    avatar_url: str | None
    plan: str
    subscription_status: str
    is_admin: bool


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
    pool: asyncpg.Pool = Depends(get_pool),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = decode_access_token(credentials.credentials, settings)
        user_id = UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token") from None
    row = await pool.fetchrow("SELECT id,email,full_name,avatar_url,plan,subscription_status FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account no longer exists")
    email = row["email"].lower()
    # Admin access is intentionally code-owned rather than environment-owned.
    # This prevents a deployment configuration mistake from expanding the media desk.
    return CurrentUser(**dict(row), is_admin=email in ADMIN_EMAIL_ALLOWLIST)


async def admin_user(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def internal_request(
    x_internal_secret: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    if not valid_internal_secret(x_internal_secret, settings):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal credential")
