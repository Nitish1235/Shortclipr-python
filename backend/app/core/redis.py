"""
Upstash Redis client (HTTP-based, serverless-compatible).
Uses upstash-redis which communicates over HTTPS — works on Cloud Run
without needing a persistent TCP connection to Redis.
"""

import json
import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class UpstashRedis:
    """
    Thin async wrapper around Upstash Redis REST API.
    Handles LPUSH, RPOP, BLPOP-like polling, SETEX, GET, DELETE.
    """

    def __init__(self) -> None:
        self._base = settings.UPSTASH_REDIS_URL.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.UPSTASH_REDIS_TOKEN}",
            "Content-Type": "application/json",
        }

    async def _cmd(self, *args: Any) -> Any:
        cmd_list = [str(a) for a in args]
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                self._base,
                headers=self._headers,
                json=cmd_list,
            )
            resp.raise_for_status()
            return resp.json().get("result")

    # ── Queue operations ──────────────────────────────────────

    async def lpush(self, key: str, value: str) -> int:
        """Push to left side of list (producer)."""
        return await self._cmd("LPUSH", key, value)

    async def rpop(self, key: str) -> str | None:
        """Non-blocking pop from right side (consumer)."""
        return await self._cmd("RPOP", key)

    async def llen(self, key: str) -> int:
        return await self._cmd("LLEN", key) or 0

    # ── Cache operations ──────────────────────────────────────

    async def setex(self, key: str, ttl_seconds: int, value: Any) -> str:
        """Set key with expiry. Value is JSON-serialised."""
        raw = json.dumps(value) if not isinstance(value, str) else value
        return await self._cmd("SETEX", key, ttl_seconds, raw)

    async def get(self, key: str) -> Any | None:
        raw = await self._cmd("GET", key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    async def delete(self, key: str) -> int:
        return await self._cmd("DEL", key)

    async def incr(self, key: str) -> int:
        return await self._cmd("INCR", key)

    async def expire(self, key: str, ttl_seconds: int) -> int:
        return await self._cmd("EXPIRE", key, ttl_seconds)


# Module-level singleton
redis = UpstashRedis()


# ── Convenience helpers ───────────────────────────────────────

async def cache_stream_url(video_id: str, url: str) -> None:
    key = f"stream:{video_id}"
    await redis.setex(key, settings.REDIS_STREAM_CACHE_TTL, url)
    logger.debug(f"Cached stream URL for {video_id}")


async def get_cached_stream_url(video_id: str) -> str | None:
    return await redis.get(f"stream:{video_id}")
