"""
test_ip_binding.py — For each stream-resolution method, check whether the
returned CDN URL is IP-bound (url_is_ip_bound) and whether a SECOND request
through a fresh proxy connection (likely different exit IP on proxy-cheap's
rotating endpoint) can actually fetch bytes from it.

Run from backend/:
    PYTHONPATH=. python scratch/test_ip_binding.py [video_id_or_url]
"""

import asyncio
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote_plus, parse_qs, urlparse

import httpx

from app.pipeline import stream as stream_mod
from app.core.proxy import url_is_ip_bound

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PC_HOST = "thehub.proxy-cheap.com"
PC_USER = "OyQOEnhVOxIz1Cr"
PC_PASS = "4ypLJeR3QRqSiJD_country-GB"
PC_PORT = 8080

DEFAULT_URL = "https://www.youtube.com/watch?v=fzNogQ73knE"
_POOL = ThreadPoolExecutor(max_workers=4)


def proxy_url() -> str:
    user = quote_plus(PC_USER)
    pw = quote_plus(PC_PASS)
    return f"http://{user}:{pw}@{PC_HOST}:{PC_PORT}"


def _ytdlp_sync(video_id: str, opts: dict) -> str:
    info = stream_mod._ytdlp_run_sync(opts, f"https://www.youtube.com/watch?v={video_id}")
    url = stream_mod._pick_stream_ytdlp(info)
    if not url:
        raise RuntimeError("no CDN url found")
    return url


async def get_url_ytdlp(video_id: str, client: str) -> str:
    proxy = proxy_url()
    opts = stream_mod._ytdlp_base_opts(proxy)
    opts["format"] = "best"
    opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, _ytdlp_sync, video_id, opts)


async def get_url_innertube(video_id: str) -> str:
    proxy = proxy_url()
    data = await stream_mod.call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)
    url = stream_mod._pick_best_stream(data, 1080)
    if not url:
        raise RuntimeError("no stream url")
    return url


async def fetch_first_bytes(url: str, use_proxy: bool, label: str) -> str:
    """Make a fresh proxied/direct request for the first ~64KB of the stream."""
    proxy = proxy_url() if use_proxy else None
    headers = {"Range": "bytes=0-65535"}
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            elapsed = time.monotonic() - t0
            return f"{label}: HTTP {resp.status_code}, {len(resp.content)} bytes ({elapsed:.2f}s)"
    except Exception as e:
        elapsed = time.monotonic() - t0
        return f"{label}: ERROR {type(e).__name__}: {e} ({elapsed:.2f}s)"


def show_ip_param(url: str) -> str:
    qs = parse_qs(urlparse(url).query)
    ip = qs.get("ip", ["?"])[0]
    sparams = qs.get("sparams", ["?"])[0]
    return f"ip={ip} | ip-in-sparams={'ip' in sparams.split(',')}"


async def analyze(name: str, get_url_coro):
    print("=" * 100)
    print(f"METHOD: {name}")
    print("=" * 100)
    try:
        url = await get_url_coro
    except Exception as e:
        print(f"  resolution FAILED: {type(e).__name__}: {e}")
        return

    bound = url_is_ip_bound(url)
    print(f"  url_is_ip_bound() = {bound}")
    print(f"  {show_ip_param(url)}")
    print(f"  url: {url[:160]}...")

    # Fresh request via proxy (likely different exit IP on rotating proxy-cheap)
    r1 = await fetch_first_bytes(url, use_proxy=True, label="fresh-proxy-conn")
    print(f"  {r1}")

    # Fresh request directly (no proxy) — only meaningful if not IP-bound
    r2 = await fetch_first_bytes(url, use_proxy=False, label="direct-no-proxy")
    print(f"  {r2}")
    print()


async def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    video_id = stream_mod.extract_video_id(arg) if arg else "fzNogQ73knE"
    print(f"Video: {video_id}\n")

    await analyze("1. InnerTube ANDROID", get_url_innertube(video_id))
    await analyze("2. yt-dlp + tv_embedded", get_url_ytdlp(video_id, "tv_embedded"))
    await analyze("3. yt-dlp + android", get_url_ytdlp(video_id, "android"))


if __name__ == "__main__":
    asyncio.run(main())
