from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from typing import Any

from jose import JWTError, jwt

from .config import Settings


ALGORITHM = "HS256"


def create_access_token(user_id: str, email: str, settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.JWT_EXPIRY_DAYS)).timestamp()),
        "iss": "shortclipr-api",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM], issuer="shortclipr-api")
    except JWTError as error:
        raise ValueError("Invalid or expired access token") from error


def valid_internal_secret(provided: str | None, settings: Settings) -> bool:
    if not provided or not settings.INTERNAL_TASK_SECRET:
        return False
    return compare_digest(provided.encode(), settings.INTERNAL_TASK_SECRET.encode())
