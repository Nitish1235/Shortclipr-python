"""
test_innertube_fix.py — Try candidate fixes for the InnerTube ANDROID
FAILED_PRECONDITION error: stale clientVersion (19.44.41) is the suspect,
since yt-dlp 2026.03.17 now ships clientVersion '21.02.35' / androidSdkVersion 30.

Run from backend/:
    PYTHONPATH=. python scratch/test_innertube_fix.py
"""

import asyncio
import sys
import time

import httpx

from app.core.proxy import get_proxy_url
from app.pipeline import stream as stream_mod

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VIDEO_ID = "dQw4w9WgXcQ"

# Public "well-known" InnerTube API key used widely by yt-dlp/clients (MWEB key)
PUBLIC_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

CANDIDATES = {
    "current (19.44.41 / sdk34 / current key)": (
        stream_mod._ANDROID_CTX,
        stream_mod._ANDROID_HEADERS,
        stream_mod._ANDROID_API_KEY,
    ),
    "updated clientVersion 21.02.35 / sdk30 (yt-dlp current)": (
        {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "21.02.35",
                "androidSdkVersion": 30,
                "hl": "en",
                "gl": "US",
                "osName": "Android",
                "osVersion": "11",
                "platform": "MOBILE",
            }
        },
        {
            "User-Agent": "com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip",
            "X-Youtube-Client-Name": "3",
            "X-Youtube-Client-Version": "21.02.35",
            "Content-Type": "application/json",
            "X-Goog-Api-Format-Version": "2",
            "Origin": "https://www.youtube.com",
        },
        stream_mod._ANDROID_API_KEY,
    ),
    "updated clientVersion 21.02.35 + public API key": (
        {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "21.02.35",
                "androidSdkVersion": 30,
                "hl": "en",
                "gl": "US",
                "osName": "Android",
                "osVersion": "11",
                "platform": "MOBILE",
            }
        },
        {
            "User-Agent": "com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip",
            "X-Youtube-Client-Name": "3",
            "X-Youtube-Client-Version": "21.02.35",
            "Content-Type": "application/json",
            "X-Goog-Api-Format-Version": "2",
            "Origin": "https://www.youtube.com",
        },
        PUBLIC_API_KEY,
    ),
    "current ctx/headers + public API key": (
        stream_mod._ANDROID_CTX,
        stream_mod._ANDROID_HEADERS,
        PUBLIC_API_KEY,
    ),
}


async def call_innertube(ctx: dict, headers: dict, api_key: str, video_id: str, proxy_url: str | None) -> str:
    payload = {
        "context": ctx,
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "vis": 0,
                "splay": False,
                "referer": f"https://www.youtube.com/watch?v={video_id}",
                "signatureTimestamp": 20000,
            }
        },
        "contentCheckOk": True,
        "racyCheckOk": True,
        "params": "2AMBCgIQBg==",
    }
    client_kwargs: dict = {"timeout": 20, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
        resp = await client.post(
            stream_mod.PLAYER_ENDPOINT,
            json=payload,
            params={"key": api_key},
            headers=headers,
        )
    if resp.status_code != 200:
        return f"HTTP {resp.status_code} — {resp.text[:150]}"

    data = resp.json()
    blocked, reason = stream_mod._innertube_is_blocked(data)
    if blocked:
        return f"HTTP 200 but BLOCKED — {reason}"
    url = stream_mod._pick_best_stream(data, 1080)
    return f"HTTP 200 OK — stream url: {'YES' if url else 'NO URL'}"


async def main():
    proxy_url = get_proxy_url("fix-test")
    print(f"Testing video: {VIDEO_ID}  |  proxy: {bool(proxy_url)}")
    print()
    for label, (ctx, headers, api_key) in CANDIDATES.items():
        for proxy_label, p in [("no proxy", None), ("proxy-cheap", proxy_url)]:
            t0 = time.monotonic()
            try:
                result = await call_innertube(ctx, headers, api_key, VIDEO_ID, p)
            except Exception as e:
                result = f"{type(e).__name__}: {e}"
            t1 = time.monotonic()
            print(f"[{proxy_label:<11}] {label:<55} ({t1-t0:.1f}s) {result}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
