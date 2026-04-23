"""
stream.py — Step 3 of the ShortClipr pipeline.

Calls YouTube's InnerTube API directly (same API the YouTube Android app uses).
No yt-dlp. No cookies. No bot detection issues.
Implements:
  - Android client (primary)
  - TV_EMBEDDED client (fallback)
  - Audio-only extraction (for Whisper fallback)
  - Stream URL caching in Redis (4-hour TTL)
"""

import logging
from typing import Literal

import httpx

from app.core.config import get_settings
from app.core.redis import cache_stream_url, get_cached_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()

# ── InnerTube client contexts ─────────────────────────────────
# Multiple clients tried in order — later ones bypass more restrictions.

_ANDROID_CONTEXT = {
    "client": {
        "clientName": "ANDROID",
        "clientVersion": "17.31.35",
        "androidSdkVersion": 30,
        "hl": "en",
        "gl": "US",
    }
}

_IOS_CONTEXT = {
    "client": {
        "clientName": "IOS",
        "clientVersion": "17.33.2",
        "deviceModel": "iPhone14,3",
        "hl": "en",
        "gl": "US",
    }
}

_TV_EMBEDDED_CONTEXT = {
    "client": {
        "clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
        "clientVersion": "2.0",
        "hl": "en",
        "gl": "US",
    },
    "thirdParty": {
        "embedUrl": "https://www.youtube.com",
    },
}

_WEB_CONTEXT = {
    "client": {
        "clientName": "WEB",
        "clientVersion": "2.20240410.01.00",
        "hl": "en",
        "gl": "US",
    }
}

PLAYER_ENDPOINT = f"{settings.INNERTUBE_API_BASE}/player"


# ── Core InnerTube request ─────────────────────────────────────

async def _call_player_api(
    video_id: str,
    context: dict,
) -> dict:
    payload = {
        "context": context,
        "videoId": video_id,
        "params": "2AMBCgIQBg==",  # Request streaming data
        "playbackContext": {
            "contentPlaybackContext": {
                "vis": 0,
                "splay": False,
                "referer": "https://www.youtube.com/watch?v=" + video_id,
                "signatureTimestamp": 19800
            }
        },
        "contentCheckOk": True,
        "racyCheckOk": True,
    }
    params = {"key": settings.INNERTUBE_API_KEY, "prettyPrint": "false"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(PLAYER_ENDPOINT, json=payload, params=params)
        resp.raise_for_status()
        return resp.json()


# ── Stream URL resolution ──────────────────────────────────────

async def get_stream_url(
    video_id: str,
    quality: Literal["720p", "480p", "1080p"] = "720p",
) -> str:
    """
    Returns a direct CDN stream URL for the video.
    Cached in Redis for REDIS_STREAM_CACHE_TTL seconds (default 4h).
    Primary: ANDROID client. Fallback: TV_EMBEDDED client.

    Uses HTTP range requests (not full download).
    """
    cache_key = f"{video_id}:{quality}"
    cached = await get_cached_stream_url(cache_key)
    if cached:
        logger.debug(f"[{video_id}] Stream URL cache hit")
        return cached

    url = await _resolve_stream_url(video_id, quality)
    await cache_stream_url(cache_key, url)
    return url


async def _resolve_stream_url(video_id: str, quality: str) -> str:
    """Try 4 clients in order from most to least restrictive."""
    target_height = int(quality.replace("p", ""))

    for context, label in [
        (_ANDROID_CONTEXT, "ANDROID"),
        (_IOS_CONTEXT, "IOS"),
        (_TV_EMBEDDED_CONTEXT, "TV_EMBEDDED"),
        (_WEB_CONTEXT, "WEB"),
    ]:
        try:
            data = await _call_player_api(video_id, context)
            url = _pick_best_stream(data, target_height)
            if url:
                logger.info(f"[{video_id}] Stream URL via {label} @ {quality}")
                return url
        except Exception as e:
            logger.warning(f"[{video_id}] {label} client failed: {e}")

    raise RuntimeError(f"Could not resolve stream URL for {video_id}")


def _pick_best_stream(data: dict, target_height: int) -> str | None:
    """
    Pick the best video-only adaptive stream.
    Prefers exact target height, falls back to nearest lower quality.
    """
    formats = data.get("streamingData", {}).get("adaptiveFormats", [])

    # Video-only streams sorted by height descending
    video_streams = sorted(
        [f for f in formats if f.get("mimeType", "").startswith("video/") and "url" in f],
        key=lambda f: f.get("height", 0),
        reverse=True,
    )

    if not video_streams:
        return None

    # Exact match first
    for stream in video_streams:
        if stream.get("height") == target_height:
            return stream["url"]

    # Nearest match below target
    lower = [s for s in video_streams if s.get("height", 0) < target_height]
    if lower:
        return lower[0]["url"]  # highest below target

    # Return whatever we have
    return video_streams[0]["url"]


# ── Audio-only stream (for Whisper fallback) ───────────────────

async def get_audio_stream_url(video_id: str) -> str:
    """
    Returns a direct CDN URL for the audio-only stream.
    Used when no YouTube captions exist → feed to Whisper.
    Tries all 4 clients in order to handle age/geo restrictions.
    """
    cache_key = f"{video_id}:audio"
    cached = await get_cached_stream_url(cache_key)
    if cached:
        return cached

    url = None
    for context, label in [
        (_ANDROID_CONTEXT, "ANDROID"),
        (_IOS_CONTEXT, "IOS"),
        (_TV_EMBEDDED_CONTEXT, "TV_EMBEDDED"),
        (_WEB_CONTEXT, "WEB"),
    ]:
        try:
            data = await _call_player_api(video_id, context)
            url = _pick_best_audio_stream(data)
            if url:
                logger.info(f"[{video_id}] Audio stream via {label}")
                break
        except Exception as e:
            logger.warning(f"[{video_id}] Audio {label} client failed: {e}")

    if not url:
        raise RuntimeError(f"Could not resolve audio stream for {video_id}")

    await cache_stream_url(cache_key, url)
    return url


def _pick_best_audio_stream(data: dict) -> str | None:
    formats = data.get("streamingData", {}).get("adaptiveFormats", [])
    audio_streams = sorted(
        [f for f in formats if f.get("mimeType", "").startswith("audio/") and "url" in f],
        key=lambda f: f.get("bitrate", 0),
    )
    return audio_streams[0]["url"] if audio_streams else None


# ── Video metadata ─────────────────────────────────────────────

async def get_video_metadata(video_id: str) -> dict:
    """
    Returns title, duration (seconds), thumbnail URL, channel name.
    Uses InnerTube as primary (for duration) — oEmbed as fallback.
    """
    try:
        return await _get_innertube_metadata(video_id)
    except Exception:
        return await _get_oembed_metadata(video_id)


async def _get_oembed_metadata(video_id: str) -> dict:
    url = f"https://www.youtube.com/oembed?url=https://youtu.be/{video_id}&format=json"
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        d = resp.json()
    return {
        "title": d.get("title", ""),
        "channel": d.get("author_name", ""),
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "duration": 0,  # oEmbed doesn't return duration
        "video_id": video_id,
    }


async def _get_innertube_metadata(video_id: str) -> dict:
    data = await _call_player_api(video_id, _ANDROID_CONTEXT)
    details = data.get("videoDetails", {})
    return {
        "title": details.get("title", ""),
        "channel": details.get("author", ""),
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "duration": int(details.get("lengthSeconds", 0)),
        "video_id": video_id,
    }


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from any valid YouTube URL format."""
    import re
    patterns = [
        r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None
