"""
brainrot_characters.py — character roster lookup for the Brainrot Clips Maker.

The 105-character roster (docs/brainrot/characters.json + canon.png assets in
the main repo) is NOT part of the backend Docker image — Dockerfile only
copies app/ and migrations/. Rather than duplicating the JSON into the
backend source tree (two copies to keep in sync), this reads
characters.json from GCS, where backend/scripts/migrate_characters_to_gcs.py
uploads it alongside the canon.png files. Re-running that script is how the
live roster gets updated — no backend redeploy needed.

Cache: in-process, with a 10-minute TTL and a lookup dict for O(1)
get_character_by_id. TTL is a middle ground — long enough that we're not
hammering GCS on every /characters call, short enough that a re-run of
migrate_characters_to_gcs.py takes effect within minutes on every Cloud
Run instance without needing a redeploy or manual cache-bust endpoint.
"""
import asyncio
import logging
import time

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CACHE_TTL_SECONDS = 600  # 10 minutes

_cache: list[dict] | None = None
_cache_by_id: dict[str, dict] | None = None
_cache_loaded_at: float = 0.0
_cache_lock = asyncio.Lock()


def _characters_json_url() -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.BRAINROT_GCS_BUCKET_NAME}/characters/characters.json"


def _character_image_url(character_id: str) -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.BRAINROT_GCS_BUCKET_NAME}/characters/{character_id}/canon.png"


async def get_character_roster() -> list[dict]:
    """Returns [{id, name, family, archetype, image_url, ...}, ...].

    Cached for CACHE_TTL_SECONDS; concurrent cold-start requests serialize
    on _cache_lock so only one actually hits GCS (previous version had
    every parallel first-request fire its own fetch — harmless, just
    wasted work — but the TTL invalidation path made repopulate races
    matter, so the lock is worth having)."""
    global _cache, _cache_by_id, _cache_loaded_at

    if _cache is not None and (time.monotonic() - _cache_loaded_at) < CACHE_TTL_SECONDS:
        return _cache

    async with _cache_lock:
        # Re-check inside the lock — another coroutine may have populated
        # while we were waiting.
        if _cache is not None and (time.monotonic() - _cache_loaded_at) < CACHE_TTL_SECONDS:
            return _cache

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(_characters_json_url())
            resp.raise_for_status()
            data = resp.json()

        roster = [
            {
                "id": c["id"],
                "name": c["name"],
                "family": c["family"],
                "archetype": c["archetype"],
                "gender": c.get("gender", "neutral"),
                # role = comedic function, voice = speech style. Surfaced so the
                # dialogue generator can write each side strictly in-character
                # (brainrot_script.py). The frontend can also show them as blurbs.
                "role": c.get("role", ""),
                "voice": c.get("voice", ""),
                "image_url": _character_image_url(c["id"]),
                # pairs = curator-picked character ids this one plays well against;
                # tier = roster rarity (1 = common .. higher = rarer). Both exist
                # purely for the frontend's cast-chemistry badge — not consumed
                # by the render pipeline itself.
                "pairs": c.get("pairs", []),
                "tier": c.get("tier", 1),
            }
            for c in data["characters"]
        ]
        _cache = roster
        _cache_by_id = {c["id"]: c for c in roster}
        _cache_loaded_at = time.monotonic()
        logger.info(f"Loaded {len(roster)} characters from GCS (cache valid {CACHE_TTL_SECONDS}s)")
        return _cache


async def get_character_by_id(character_id: str) -> dict | None:
    """O(1) lookup by id — the previous linear scan was harmless at 105
    entries but is called once per character position at every job
    creation, so the dict is a free win here."""
    await get_character_roster()  # ensure cache is populated
    return (_cache_by_id or {}).get(character_id)
