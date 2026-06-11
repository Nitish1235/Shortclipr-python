"""
test_decodo_apis.py — Test the stream/transcript fallback methods against
the Decodo residential proxy (gate.decodo.com), independent of the
proxy-cheap config in .env.

Decodo creds (from dashboard): gate.decodo.com:10001-10007 / spbou1dr41 / <pass>

Run from backend/:
    PYTHONPATH=. python scratch/test_decodo_apis.py [video_id_or_url]
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

DECODO_HOST = "gate.decodo.com"
DECODO_USER = "spbou1dr41"
DECODO_PASS = "7Ur0gi88_hjxhRHEvn"
DECODO_PORTS = list(range(10001, 10008))  # 10001-10007

DEFAULT_URL = "https://www.youtube.com/watch?v=fzNogQ73knE"

_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="decodo-test")


def decodo_proxy_url(port_idx: int = 0) -> str:
    port = DECODO_PORTS[port_idx % len(DECODO_PORTS)]
    user = quote_plus(DECODO_USER)
    pw = quote_plus(DECODO_PASS)
    return f"http://{user}:{pw}@{DECODO_HOST}:{port}"


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


# ── 0. Raw proxy connectivity ───────────────────────────────────

async def test_connectivity():
    proxy = decodo_proxy_url(0)
    async with httpx.AsyncClient(proxy=proxy, timeout=15) as client:
        resp = await client.get("https://httpbin.org/ip")
        resp.raise_for_status()
        return resp.json().get("origin", "?")


# ── 1. InnerTube ANDROID + Decodo (stream) ──────────────────────

async def test_innertube_android_stream(video_id: str, port_idx: int):
    proxy = decodo_proxy_url(port_idx)
    data = await stream_mod.call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)
    blocked, reason = stream_mod._innertube_is_blocked(data)
    if blocked:
        raise RuntimeError(f"blocked — {reason}")
    url = stream_mod._pick_best_stream(data, 1080)
    if not url:
        raise RuntimeError("no stream url")
    return url


# ── 2-5. yt-dlp variants + Decodo ────────────────────────────────

def _ytdlp_sync(video_id: str, opts: dict) -> str:
    info = stream_mod._ytdlp_run_sync(opts, f"https://www.youtube.com/watch?v={video_id}")
    url = stream_mod._pick_stream_ytdlp(info)
    if not url:
        raise RuntimeError("no CDN url found")
    return url


async def test_ytdlp(video_id: str, *, client: str | None, fmt_str: str, port_idx: int) -> str:
    proxy = decodo_proxy_url(port_idx)
    opts = stream_mod._ytdlp_base_opts(proxy)
    opts["format"] = fmt_str
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, _ytdlp_sync, video_id, opts)


# ── T1. InnerTube ANDROID + Decodo (transcript: player + timedtext) ──

async def test_innertube_transcript(video_id: str, lang_code: str, port_idx: int):
    proxy = decodo_proxy_url(port_idx)
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


# ── T2. youtube-transcript-api v1.2.4 + Decodo ──────────────────

async def test_ytta(video_id: str, lang_code: str, port_idx: int):
    proxy = decodo_proxy_url(port_idx)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, transcript_mod._ytta_fetch_sync, video_id, lang_code, proxy)


# ── T3. yt-dlp subtitle extraction + Decodo ─────────────────────

async def test_ytdlp_subs(video_id: str, lang_code: str, port_idx: int):
    proxy = decodo_proxy_url(port_idx)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_POOL, transcript_mod._ytdlp_subs_sync, video_id, lang_code, proxy)


async def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    video_id = get_video_id(arg)
    h = 1080

    print("=" * 78)
    print(f"Video ID:    {video_id}")
    print(f"Proxy:       {DECODO_HOST}:{DECODO_PORTS[0]}-{DECODO_PORTS[-1]}  user={DECODO_USER}")
    print("=" * 78)

    results = []

    results.append(await run_test("0. Raw proxy connectivity (httpbin.org/ip)", test_connectivity()))

    # Stream methods
    results.append(await run_test("1. InnerTube ANDROID + Decodo", test_innertube_android_stream(video_id, 0)))
    results.append(await run_test("2. yt-dlp + Decodo + tv_embedded", test_ytdlp(
        video_id, client="tv_embedded", fmt_str="best", port_idx=1)))
    results.append(await run_test("3. yt-dlp + Decodo + 4K format", test_ytdlp(
        video_id, client=None, fmt_str=stream_mod._fmt(2160), port_idx=2)))
    results.append(await run_test("4. yt-dlp + Decodo (default)", test_ytdlp(
        video_id, client=None, fmt_str="best", port_idx=3)))
    results.append(await run_test("5. yt-dlp + Decodo + android client", test_ytdlp(
        video_id, client="android", fmt_str="best", port_idx=4)))

    # Transcript methods
    results.append(await run_test("T1. InnerTube ANDROID + Decodo (player+timedtext)", test_innertube_transcript(video_id, "en", 5)))
    results.append(await run_test("T2. youtube-transcript-api v1.2.4 + Decodo", test_ytta(video_id, "en", 6)))
    results.append(await run_test("T3. yt-dlp subtitle extraction + Decodo", test_ytdlp_subs(video_id, "en", 0)))

    print()
    print(f"{'METHOD':<52} {'STATUS':<8} {'TIME':>7}  DETAIL")
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
        print(f"{r['name']:<52} {status:<8} {r['elapsed']:>6.2f}s  {detail}")

    print()
    n_ok = sum(1 for r in results if r["ok"])
    print(f"{n_ok}/{len(results)} checks passed")


if __name__ == "__main__":
    asyncio.run(main())
