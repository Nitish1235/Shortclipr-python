"""
factloop_stock_images.py — real stock-photo search for Factloop, tried
before falling back to AI generation (factloop_image.py).

Searches Wikimedia Commons first, then Pexels, Unsplash, and Pixabay, for
the first usable result:
  - Wikimedia Commons is tried FIRST specifically because it's the one
    source here that actually carries real photos of named public figures
    (athletes, politicians, celebrities) — press/fan photos donated under
    free licenses (CC-BY, CC-BY-SA, public domain). No API key needed.
  - Pexels/Unsplash/Pixabay are free-signup libraries of generic/editorial
    stock photography — none of them carry real photos of named public
    figures (a search for "Virat Kohli batting" reliably returns zero
    relevant hits on any of the three), so they mostly help for facts
    about a generic concept (a stadium, a growth chart, a skyline) rather
    than a specific named person.

Every provider call is independently best-effort: a missing API key, a
network error, or an empty result set all just return None from that
provider rather than raising — a stock-search failure should never fail
the job, it should just fall through to the next provider and ultimately
to the AI-generation fallback.
"""
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_TIMEOUT = httpx.Timeout(connect=5, read=8, write=5, pool=5)

# Wikimedia's API etiquette asks for a descriptive User-Agent identifying
# the application (no API key/registration required for read-only search).
_WIKIMEDIA_USER_AGENT = "ShortClipr-Factloop/1.0 (https://shortclipr.com; contact via site)"
_WIKIMEDIA_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
_WIKIMEDIA_MIN_WIDTH = 480  # skip tiny icons/thumbnails masquerading as photos

_STOPWORDS = {"the", "a", "an", "of", "in", "on", "at", "and", "or", "for", "to", "with", "is", "was", "his", "her"}


def _looks_relevant(query: str, title: str) -> bool:
    """CirrusSearch's relevance ranking can surface completely unrelated
    files for a query it has no good match for (seen in testing: a query
    like "quarterly sales chart office" — not the kind of subject Commons,
    an encyclopedia's media library rather than a stock-photo site, has
    good coverage of — returned a 1922 telephone-magazine photo as its
    "best" hit). Requires at least one non-trivial query word to actually
    appear in the file's title before accepting it, rather than trusting
    the ranking blindly."""
    q_words = {w.lower().strip(".,()") for w in query.split() if len(w) >= 4 and w.lower() not in _STOPWORDS}
    if not q_words:
        return True  # nothing meaningful to check — don't over-filter a short/generic query
    title_lower = title.lower()
    return any(w in title_lower for w in q_words)


async def _search_wikimedia_commons(query: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _WIKIMEDIA_USER_AGENT}) as client:
            resp = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "generator": "search",
                    # filetype:bitmap restricts results to real photo/bitmap
                    # formats server-side — excludes SVGs (icons/diagrams),
                    # PDFs, audio/video files that also live in the File
                    # namespace on Commons.
                    "gsrsearch": f"{query} filetype:bitmap",
                    "gsrnamespace": 6,
                    "gsrlimit": 6,
                    "prop": "imageinfo",
                    "iiprop": "url|mime",
                    "iiurlwidth": 1280,
                    "format": "json",
                    "origin": "*",
                },
            )
            resp.raise_for_status()
            pages = (resp.json().get("query") or {}).get("pages") or {}
            for page in pages.values():
                infos = page.get("imageinfo") or []
                if not infos:
                    continue
                info = infos[0]
                if info.get("mime") not in _WIKIMEDIA_IMAGE_MIMES:
                    continue
                if info.get("thumbwidth", 0) < _WIKIMEDIA_MIN_WIDTH and not info.get("url"):
                    continue
                if not _looks_relevant(query, page.get("title", "")):
                    continue
                return info.get("thumburl") or info.get("url")
            return None
    except Exception as exc:
        logger.info(f"factloop_stock_images: Wikimedia Commons search failed for {query!r}: {exc}")
        return None


async def _search_pexels(query: str) -> str | None:
    if not settings.PEXELS_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.pexels.com/v1/search",
                params={"query": query, "per_page": 1, "orientation": "portrait"},
                headers={"Authorization": settings.PEXELS_API_KEY},
            )
            resp.raise_for_status()
            photos = resp.json().get("photos") or []
            if not photos:
                return None
            return photos[0]["src"]["large2x"]
    except Exception as exc:
        logger.info(f"factloop_stock_images: Pexels search failed for {query!r}: {exc}")
        return None


async def _search_unsplash(query: str) -> str | None:
    if not settings.UNSPLASH_ACCESS_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://api.unsplash.com/search/photos",
                params={"query": query, "per_page": 1, "orientation": "portrait"},
                headers={"Authorization": f"Client-ID {settings.UNSPLASH_ACCESS_KEY}"},
            )
            resp.raise_for_status()
            results = resp.json().get("results") or []
            if not results:
                return None
            return results[0]["urls"]["regular"]
    except Exception as exc:
        logger.info(f"factloop_stock_images: Unsplash search failed for {query!r}: {exc}")
        return None


async def _search_pixabay(query: str) -> str | None:
    if not settings.PIXABAY_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                "https://pixabay.com/api/",
                params={
                    "key": settings.PIXABAY_API_KEY,
                    "q": query,
                    "image_type": "photo",
                    "orientation": "vertical",
                    "per_page": 3,   # Pixabay's API minimum, even though we only use hits[0]
                    "safesearch": "true",
                },
            )
            resp.raise_for_status()
            hits = resp.json().get("hits") or []
            if not hits:
                return None
            return hits[0]["largeImageURL"]
    except Exception as exc:
        logger.info(f"factloop_stock_images: Pixabay search failed for {query!r}: {exc}")
        return None


_PROVIDERS = (
    ("wikimedia", _search_wikimedia_commons),
    ("pexels", _search_pexels),
    ("unsplash", _search_unsplash),
    ("pixabay", _search_pixabay),
)


async def find_stock_photo(query: str) -> tuple[str, str] | None:
    """Tries each configured provider in order, returns (provider_name,
    image_url) for the first hit, or None if every provider is either
    unconfigured or returned nothing — the caller (factloop_image.py) then
    falls back to AI generation for that image slot."""
    query = query.strip()
    if not query:
        return None
    for name, search in _PROVIDERS:
        url = await search(query)
        if url:
            logger.info(f"factloop_stock_images: found via {name} for {query!r}")
            return name, url
    return None
