from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from fastapi import HTTPException, Request, status

from .core.config import Settings


async def create_pool(settings: Settings) -> asyncpg.Pool | None:
    if not settings.SUPABASE_DB_URL:
        return None
    return await asyncpg.create_pool(
        dsn=settings.SUPABASE_DB_URL,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        command_timeout=60,
        server_settings={"application_name": "shortclipr"},
    )


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
