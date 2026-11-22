from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from fastapi import HTTPException, Request, status

from .core.config import Settings


POOL_LIMITS_BY_ROLE = {
    # Each Cloud Run instance owns a pool. Keep these small so autoscaling
    # cannot multiply ten-session pools into hundreds of database sessions.
    "api": 2,
    "api-worker": 1,
    "ffmpeg-worker": 1,
}


def effective_pool_sizes(settings: Settings) -> tuple[int, int]:
    role_limit = POOL_LIMITS_BY_ROLE.get(settings.SERVICE_ROLE, 1)
    max_size = max(1, min(settings.DB_POOL_MAX_SIZE, role_limit))
    min_size = max(1, min(settings.DB_POOL_MIN_SIZE, max_size))
    return min_size, max_size


async def create_pool(settings: Settings) -> asyncpg.Pool | None:
    if not settings.SUPABASE_DB_URL:
        return None
    min_size, max_size = effective_pool_sizes(settings)
    pool = await asyncpg.create_pool(
        dsn=settings.SUPABASE_DB_URL,
        min_size=min_size,
        max_size=max_size,
        command_timeout=60,
        server_settings={"application_name": f"shortclipr-{settings.SERVICE_ROLE}"},
    )
    return pool


def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db", None)
    if pool is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not configured")
    return pool


@asynccontextmanager
async def transaction(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection
