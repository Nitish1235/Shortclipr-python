"""
test_innertube_isolate.py — Isolate why InnerTube ANDROID /player returns
400 FAILED_PRECONDITION: is it the proxy (proxy-cheap), the video, or the
client config (clientVersion/signatureTimestamp/API key)?

Tests the same InnerTube ANDROID payload:
  - with NO proxy (direct from this machine)
  - with proxy-cheap proxy
against multiple videos (the failing one + a couple of well-known stable ones).

Run from backend/:
    PYTHONPATH=. python scratch/test_innertube_isolate.py
"""

import asyncio
import sys
import time

import httpx

from app.core.proxy import get_proxy_url
from app.pipeline import stream as stream_mod

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VIDEOS = {
    "fzNogQ73knE (failing video)": "fzNogQ73knE",
    "dQw4w9WgXcQ (rickroll, well-known)": "dQw4w9WgXcQ",
    "jNQXAC9IVRw (first YouTube video)": "jNQXAC9IVRw",
}


async def call_innertube(video_id: str, proxy_url: str | None) -> str:
    payload = {
        "context": stream_mod._ANDROID_CTX,
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
            params={"key": stream_mod._ANDROID_API_KEY},
            headers=stream_mod._ANDROID_HEADERS,
        )
    if resp.status_code != 200:
        return f"HTTP {resp.status_code} — {resp.text[:200]}"

    data = resp.json()
    blocked, reason = stream_mod._innertube_is_blocked(data)
    if blocked:
        return f"HTTP 200 but BLOCKED — {reason}"
    url = stream_mod._pick_best_stream(data, 1080)
    return f"HTTP 200 OK — stream url: {'yes' if url else 'NO URL'}"


async def main():
    proxy_url = get_proxy_url("isolate-test")
    print(f"Proxy URL configured: {bool(proxy_url)}  (host={proxy_url.split('@')[-1] if proxy_url else None})")
    print()
    print(f"{'VIDEO':<40} {'NO PROXY':<45} {'PROXY-CHEAP':<45}")
    print("-" * 132)

    for label, vid in VIDEOS.items():
        # No proxy
        t0 = time.monotonic()
        try:
            no_proxy_result = await call_innertube(vid, None)
        except Exception as e:
            no_proxy_result = f"{type(e).__name__}: {e}"
        t1 = time.monotonic()
        no_proxy_result = f"({t1-t0:.1f}s) {no_proxy_result}"

        # With proxy-cheap
        t0 = time.monotonic()
        try:
            proxy_result = await call_innertube(vid, proxy_url)
        except Exception as e:
            proxy_result = f"{type(e).__name__}: {e}"
        t1 = time.monotonic()
        proxy_result = f"({t1-t0:.1f}s) {proxy_result}"

        print(f"{label:<40} {no_proxy_result:<45} {proxy_result:<45}")


if __name__ == "__main__":
    asyncio.run(main())
