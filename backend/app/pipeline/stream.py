"""
stream.py — Step 3 of the ShortClipr pipeline.
Stealth InnerTube implementation with Full Error Logging.
"""

import logging
import re
import json
from typing import Literal

import httpx

from app.core.config import get_settings
from app.core.redis import cache_stream_url, get_cached_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Stealth Client Registry ───────────────────────────────────

CLIENTS = {
    "IOS": {
        "context": {
            "client": {
                "clientName": "IOS",
                "clientVersion": "19.29.1",
                "deviceModel": "iPhone16,2",
                "osName": "iOS",
                "osVersion": "17.5.1",
                "hl": "en",
                "gl": "US",
                "userInterfaceTheme": "DARK",
                "timeZoneOffsetMins": 0,
            }
        },
        "headers": {
            "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)",
            "X-Youtube-Client-Name": "2",
            "X-Youtube-Client-Version": "19.29.1",
        },
        "api_key": "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"
    },
    "TV": {
        "context": {
            "client": {
                "clientName": "TVHTML5",
                "clientVersion": "7.20230405.08.01",
                "hl": "en",
                "gl": "US",
            }
        },
        "headers": {
            "User-Agent": "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",
            "X-Youtube-Client-Name": "7",
            "X-Youtube-Client-Version": "7.20230405.08.01",
        },
        "api_key": "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8"
    }
}

PLAYER_ENDPOINT = f"{settings.INNERTUBE_API_BASE}/player"

async def get_visitor_data():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("https://www.youtube.com", follow_redirects=True)
            match = re.search(r'ytcfg\.set\({"VISITOR_DATA":\s*"([^"]+)"', resp.text)
            if match: return match.group(1)
    except: pass
    return None

async def call_player_api(video_id: str, client_name: str, send_params: bool = False) -> dict:
    config = CLIENTS.get(client_name)
    visitor_data = await get_visitor_data()

    payload = {
        "context": config["context"].copy(),
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "vis": 0,
                "splay": False,
                "referer": f"https://www.youtube.com/watch?v={video_id}",
                "signatureTimestamp": 20000
            }
        },
        "contentCheckOk": True,
        "racyCheckOk": True
    }
    if visitor_data:
        payload["context"]["client"]["visitorData"] = visitor_data

    if send_params:
        payload["params"] = "2AMBCgIQBg=="

    headers = config["headers"].copy()
    headers["Content-Type"] = "application/json"
    headers["X-Goog-Api-Format-Version"] = "2"
    if visitor_data:
        headers["X-Goog-Visitor-Id"] = visitor_data

    params = {"key": config["api_key"]}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(PLAYER_ENDPOINT, json=payload, params=params, headers=headers)
        if resp.status_code != 200:
            # CRITICAL: Log the full error to understand the block
            logger.error(f"InnerTube {client_name} FAILED ({resp.status_code})")
            logger.error(f"Full Error Response: {resp.text}")
            resp.raise_for_status()
        return resp.json()

async def get_stream_url(video_id: str, quality: str = "720p") -> str:
    cache_key = f"{video_id}:{quality}"
    cached = await get_cached_stream_url(cache_key)
    if cached: return cached
    url = await _resolve_stream_url(video_id, quality)
    await cache_stream_url(cache_key, url)
    return url

async def _resolve_stream_url(video_id: str, quality: str) -> str:
    target_height = int(quality.replace("p", ""))
    for label in ["IOS", "TV"]:
        try:
            data = await call_player_api(video_id, label, send_params=True)
            url = _pick_best_stream(data, target_height)
            if url: return url
        except: continue
    raise RuntimeError(f"Could not resolve stream URL for {video_id}")

def _pick_best_stream(data: dict, target_height: int) -> str | None:
    sd = data.get("streamingData", {})
    formats = sd.get("formats", []) + sd.get("adaptiveFormats", [])
    video_streams = sorted([f for f in formats if f.get("mimeType", "").startswith("video/") and "url" in f], key=lambda f: f.get("height", 0), reverse=True)
    if not video_streams: return None
    for s in video_streams:
        if s.get("height") == target_height: return s["url"]
    return video_streams[0]["url"]

async def get_audio_stream_url(video_id: str) -> str:
    cache_key = f"{video_id}:audio"
    cached = await get_cached_stream_url(cache_key)
    if cached: return cached
    url = None
    for label in ["IOS", "TV"]:
        try:
            data = await call_player_api(video_id, label, send_params=True)
            url = _pick_best_audio_stream(data)
            if url: break
        except: continue
    if not url: raise RuntimeError(f"Could not resolve audio stream for {video_id}")
    await cache_stream_url(cache_key, url)
    return url

def _pick_best_audio_stream(data: dict) -> str | None:
    sd = data.get("streamingData", {})
    formats = sd.get("adaptiveFormats", [])
    audio_streams = [f for f in formats if f.get("mimeType", "").startswith("audio/") and "url" in f]
    if not audio_streams: return None
    audio_streams.sort(key=lambda x: int(x.get("bitrate", 0)), reverse=True)
    return audio_streams[0]["url"]

async def get_video_metadata(video_id: str) -> dict:
    for label in ["IOS", "TV"]:
        try:
            data = await call_player_api(video_id, label)
            details = data.get("videoDetails", {})
            if details:
                return {"title": details.get("title", ""), "channel": details.get("author", ""), "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg", "duration": int(details.get("lengthSeconds", 0)), "video_id": video_id}
        except: continue
    url = f"https://www.youtube.com/oembed?url=https://youtu.be/{video_id}&format=json"
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        d = resp.json()
    return {"title": d.get("title", ""), "channel": d.get("author_name", ""), "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg", "duration": 0, "video_id": video_id}

def extract_video_id(url: str) -> str | None:
    patterns = [r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", r"youtu\.be\/([0-9A-Za-z_-]{11})", r"embed\/([0-9A-Za-z_-]{11})", r"shorts\/([0-9A-Za-z_-]{11})"]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match: return match.group(1)
    return None
