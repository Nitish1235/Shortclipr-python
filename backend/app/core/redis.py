"""
redis.py — Upstash Redis cache helpers.

Used ONLY for caching YouTube stream URLs (4-hour TTL) to avoid
redundant InnerTube API calls per job. Queue/worker logic has been
removed — jobs are now triggered via SSE from the API service.
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
    Only cache operations are used (SETEX, GET).
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

    async def setex(self, key: str, ttl_seconds: int, value: Any) -> str:
        """Set key with expiry. Value is JSON-serialised if not already a string."""
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


# Module-level singleton
redis = UpstashRedis()


# ── Stream URL cache helpers ───────────────────────────────────

async def cache_stream_url(video_id: str, url: str) -> None:
    """Cache an InnerTube stream URL in Redis for REDIS_STREAM_CACHE_TTL seconds."""
    key = f"stream:{video_id}"
    await redis.setex(key, settings.REDIS_STREAM_CACHE_TTL, url)
    logger.debug(f"Cached stream URL for {video_id}")


async def get_cached_stream_url(video_id: str) -> str | None:
    """Return cached stream URL or None if not present/expired."""
    return await redis.get(f"stream:{video_id}")
