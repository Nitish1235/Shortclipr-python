"""
brainrot_characters.py — character roster lookup for the Brainrot Clips Maker.

The 105-character roster (docs/brainrot/characters.json + canon.png assets in
the main repo) is NOT part of the backend Docker image — Dockerfile only
copies app/ and migrations/. Rather than duplicating the JSON into the
backend source tree (two copies to keep in sync), this reads
characters.json from GCS, where backend/scripts/migrate_characters_to_gcs.py
uploads it alongside the canon.png files. Re-running that script is how the
live roster gets updated — no backend redeploy needed.

Cached in-process after first fetch — 105 small dict entries, no reason to
refetch every request. Process restart (deploy) picks up any roster changes.
"""
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_cache: list[dict] | None = None


def _characters_json_url() -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.BRAINROT_GCS_BUCKET_NAME}/characters/characters.json"


def _character_image_url(character_id: str) -> str:
    return f"{settings.GCS_PUBLIC_BASE_URL}/{settings.BRAINROT_GCS_BUCKET_NAME}/characters/{character_id}/canon.png"


async def get_character_roster() -> list[dict]:
    """Returns [{id, name, family, archetype, image_url}, ...] for all
    characters, fetched from GCS and cached for the life of the process."""
    global _cache
    if _cache is not None:
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
        }
        for c in data["characters"]
    ]
    _cache = roster
    logger.info(f"Loaded {len(roster)} characters from GCS")
    return roster


async def get_character_by_id(character_id: str) -> dict | None:
    roster = await get_character_roster()
    return next((c for c in roster if c["id"] == character_id), None)
