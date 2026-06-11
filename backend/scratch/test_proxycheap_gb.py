"""
test_proxycheap_us.py — Test all stream/transcript fallback methods against
proxy-cheap with US country targeting (password suffix _country-US).

Run from backend/:
    PYTHONPATH=. python scratch/test_proxycheap_us.py [video_id_or_url]
"""

import asyncio
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote_plus

import httpx

from app.pipeline import stream as stream_mod
from app.pipeline import transcript as transcript_mod

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PC_HOST = "thehub.proxy-cheap.com"
PC_USER = "OyQOEnhVOxIz1Cr"
PC_PASS = "4ypLJeR3QRqSiJD_country-GB"
PC_PORT = 8080

DEFAULT_URL = "https://www.youtube.com/watch?v=fzNogQ73knE"

_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pcus-test")


def proxy_url() -> str:
    user = quote_plus(PC_USER)
    pw = quote_plus(PC_PASS)
    return f"http://{user}:{pw}@{PC_HOST}:{PC_PORT}"


def get_video_id(arg: str | None) -> str:
    if not arg:
        arg = DEFAULT_URL
    return stream_mod.extract_video_id(arg) or arg


def fmt(s, length=120):
    if not isinstance(s, str):
        return s
    return s if len(s) <= length else s[:length] + "..."


async def run_test(name: str, coro) -> dict:
    start = time.monotonic()
    try:
        result = await coro
        return {"name": name, "ok": True, "elapsed": time.monotonic() - start, "detail": result}
    except Exception as e:
        return {"name": name, "ok": False, "elapsed": time.monotonic() - start, "detail": f"{type(e).__name__}: {e}"}


# ── 0. Connectivity + geo ────────────────────────────────────────

async def test_connectivity_geo():
    proxy = proxy_url()
    async with httpx.AsyncClient(proxy=proxy, timeout=15) as client:
        resp = await client.get("http://ip-api.com/json/")
        d = resp.json()
        return f"{d.get('query')} | {d.get('city')}, {d.get('regionName')}, {d.get('country')} | ASN: {d.get('as')}"


async def test_latency(url: str, n: int = 3) -> str:
    proxy = proxy_url()
    times = []
    err = None
    for _ in range(n):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
                await client.head(url)
            times.append(time.monotonic() - t0)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            times.append(time.monotonic() - t0)
    avg = sum(times) / len(times)
    detail = f"avg={avg:.2f}s individual={[f'{t:.2f}' for t in times]}"
    if err:
        detail += f" last_err={err}"
    return detail


# ── 1. InnerTube ANDROID + proxy (stream) ───────────────────────

async def test_innertube_android_stream(video_id: str):
    proxy = proxy_url()
    data = await stream_mod.call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)
    blocked, reason = stream_mod._innertube_is_blocked(data)
    if blocked:
        raise RuntimeError(f"blocked — {reason}")
    url = stream_mod._pick_best_stream(data, 1080)
    if not url:
        raise RuntimeError("no stream url")
    return url


# ── 2-5. yt-dlp variants + proxy ─────────────────────────────────

def _ytdlp_sync(video_id: str, opts: dict) -> str:
    info = stream_mod._ytdlp_run_sync(opts, f"https://www.youtube.com/watch?v={video_id}")
    url = stream_mod._pick_stream_ytdlp(info)
    if not url:
        raise RuntimeError("no CDN url found")
    return url


async def test_ytdlp(video_id: str, *, client: str | None, fmt_str: str) -> str:
    proxy = proxy_url()
    opts = stream_mod._ytdlp_base_opts(proxy)
    opts["format"] = fmt_str
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, _ytdlp_sync, video_id, opts)


# ── T1. InnerTube ANDROID + proxy (transcript: player + timedtext) ──

async def test_innertube_transcript(video_id: str, lang_code: str):
    proxy = proxy_url()
    data = await stream_mod.call_player_api(video_id, client_name="ANDROID", proxy_url=proxy)
    ps = data.get("playabilityStatus", {})
    status = ps.get("status", "OK")
    if status in {"LOGIN_REQUIRED", "SIGN_IN_REQUIRED", "AGE_CHECK_REQUIRED"}:
        raise RuntimeError(f"blocked: playability={status}")
    tracks = data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
    if not tracks:
        raise RuntimeError(f"no caption tracks (playability={status})")
    chosen = transcript_mod._pick_caption_track(tracks, lang_code)
    base_url = chosen.get("baseUrl", "")
    if not base_url:
        raise RuntimeError("chosen track has no baseUrl")
    return await transcript_mod._fetch_timedtext(base_url, video_id, proxy_url=proxy)


# ── T2. youtube-transcript-api v1.2.4 + proxy ───────────────────

async def test_ytta(video_id: str, lang_code: str):
    proxy = proxy_url()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, transcript_mod._ytta_fetch_sync, video_id, lang_code, proxy)


# ── T3. yt-dlp subtitle extraction + proxy ──────────────────────

async def test_ytdlp_subs(video_id: str, lang_code: str):
    proxy = proxy_url()
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, transcript_mod._ytdlp_subs_sync, video_id, lang_code, proxy)


async def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    video_id = get_video_id(arg)

    print("=" * 78)
    print(f"Video ID:    {video_id}")
    print(f"Proxy:       {PC_HOST}:{PC_PORT}  user={PC_USER}  password=...{PC_PASS[-12:]}")
    print("=" * 78)

    results = []

    results.append(await run_test("0. Connectivity + geo", test_connectivity_geo()))
    results.append(await run_test("0b. Latency: youtube.com (3x HEAD)", test_latency("https://www.youtube.com/")))
    results.append(await run_test("0c. Latency: googlevideo.com (3x HEAD)", test_latency("https://rr3---sn-2uja-h0me.googlevideo.com/")))

    # Stream methods
    results.append(await run_test("1. InnerTube ANDROID + proxy-cheap-US", test_innertube_android_stream(video_id)))
    results.append(await run_test("2. yt-dlp + proxy-cheap-US + tv_embedded", test_ytdlp(
        video_id, client="tv_embedded", fmt_str="best")))
    results.append(await run_test("3. yt-dlp + proxy-cheap-US + android client", test_ytdlp(
        video_id, client="android", fmt_str="best")))
    results.append(await run_test("4. yt-dlp + proxy-cheap-US + mweb client", test_ytdlp(
        video_id, client="mweb", fmt_str="best")))
    results.append(await run_test("5. yt-dlp + proxy-cheap-US (default/web)", test_ytdlp(
        video_id, client=None, fmt_str="best")))

    # Transcript methods
    results.append(await run_test("T1. InnerTube ANDROID + proxy-cheap-US (player+timedtext)", test_innertube_transcript(video_id, "en")))
    results.append(await run_test("T2. youtube-transcript-api v1.2.4 + proxy-cheap-US", test_ytta(video_id, "en")))
    results.append(await run_test("T3. yt-dlp subtitle extraction + proxy-cheap-US", test_ytdlp_subs(video_id, "en")))

    print()
    print(f"{'METHOD':<58} {'STATUS':<8} {'TIME':>7}  DETAIL")
    print("-" * 110)
    for r in results:
        status = "OK" if r["ok"] else "FAIL"
        detail = r["detail"]
        if r["ok"]:
            if isinstance(detail, str):
                detail = fmt(detail)
            elif isinstance(detail, list):
                first = fmt(detail[0]["text"], 50) if detail else ""
                detail = f"{len(detail)} entries — first: {first}"
        else:
            detail = fmt(detail, 150)
        print(f"{r['name']:<58} {status:<8} {r['elapsed']:>6.2f}s  {detail}")

    print()
    n_ok = sum(1 for r in results if r["ok"])
    print(f"{n_ok}/{len(results)} checks passed")


if __name__ == "__main__":
    asyncio.run(main())
