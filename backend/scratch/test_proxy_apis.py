"""
test_proxy_apis.py — Standalone diagnostic for the proxy-cheap residential proxy
and every stream-URL / transcript fallback method used by the pipeline.

Run from backend/:
    python scratch/test_proxy_apis.py [video_id_or_url]

Tests, in order:
  0. Raw proxy connectivity  (httpx GET https://httpbin.org/ip via proxy)
  1-7. Stream URL methods     (app/pipeline/stream.py fallback chain, each tried individually)
  M.  Video metadata          (oEmbed -> InnerTube ANDROID)
  T1-T3. Transcript methods    (app/pipeline/transcript.py fallback chain, each tried individually)

Each test is isolated — does not rely on the others succeeding, and does not
use the Redis cache (calls the underlying methods directly, not get_stream_url()).
"""

import asyncio
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import httpx

from app.core.config import get_settings
from app.core.proxy import get_proxy_url
from app.pipeline import stream as stream_mod
from app.pipeline import transcript as transcript_mod


DEFAULT_URL = "https://www.youtube.com/watch?v=fzNogQ73knE"


def get_video_id(arg: str | None) -> str:
    if not arg:
        arg = DEFAULT_URL
    vid = stream_mod.extract_video_id(arg)
    return vid or arg


async def test_proxy_connectivity(proxy_url: str | None) -> tuple[bool, str]:
    if not proxy_url:
        return False, "PROXY_HOST/PROXY_USER/PROXY_PASS not configured"
    try:
        async with httpx.AsyncClient(proxy=proxy_url, timeout=15) as client:
            resp = await client.get("https://httpbin.org/ip")
            resp.raise_for_status()
            return True, resp.json().get("origin", "?")
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


async def run_test(name: str, coro) -> dict:
    start = time.monotonic()
    try:
        result = await coro
        elapsed = time.monotonic() - start
        return {"name": name, "ok": True, "elapsed": elapsed, "detail": result}
    except Exception as e:
        elapsed = time.monotonic() - start
        return {"name": name, "ok": False, "elapsed": elapsed, "detail": f"{type(e).__name__}: {e}"}


def fmt_url(url: str | None, length: int = 90) -> str:
    if not url:
        return ""
    return url if len(url) <= length else url[:length] + "..."


async def diagnose_innertube_400(video_id: str, session_id: str) -> str:
    """Raw call to InnerTube /player to capture the response body on 400."""
    proxy = get_proxy_url(session_id)
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
    async with httpx.AsyncClient(proxy=proxy, timeout=20, follow_redirects=True) as client:
        resp = await client.post(
            stream_mod.PLAYER_ENDPOINT,
            json=payload,
            params={"key": stream_mod._ANDROID_API_KEY},
            headers=stream_mod._ANDROID_HEADERS,
        )
    return f"HTTP {resp.status_code} — {resp.text[:300]}"


async def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    quick = "--quick" in sys.argv
    video_id = get_video_id(arg)
    settings = get_settings()
    session_id = "diag-session"

    print("=" * 78)
    print(f"Video ID:    {video_id}")
    print(f"Proxy host:  {settings.PROXY_HOST}")
    print(f"Proxy user:  {settings.PROXY_USER}")
    print(f"Proxy port:  {settings.PROXY_PORT}")
    print("=" * 78)

    results: list[dict] = []

    # ── 0. Raw proxy connectivity ───────────────────────────────
    proxy_url = get_proxy_url(session_id)
    ok, detail = await test_proxy_connectivity(proxy_url)
    results.append({"name": "0. Raw proxy connectivity (httpbin.org/ip)", "ok": ok, "elapsed": 0.0, "detail": detail})

    h = 1080

    # ── 1-7. Stream URL fallback chain (each method individually) ──
    stream_tests = [
        ("1. InnerTube ANDROID + proxy", stream_mod._innertube_android_stream(video_id, h, session_id)),
        ("2. yt-dlp + android client + proxy", stream_mod._ytdlp_stream(
            video_id, "best", client="android", label="yt-dlp+android", session_id=session_id
        )),
        ("3. yt-dlp + mweb client + proxy", stream_mod._ytdlp_stream(
            video_id, "best", client="mweb", label="yt-dlp+mweb", session_id=session_id
        )),
        ("4. yt-dlp + ios client + proxy", stream_mod._ytdlp_stream(
            video_id, "best", client="ios", label="yt-dlp+ios", session_id=session_id
        )),
        ("5. yt-dlp + web client + proxy", stream_mod._ytdlp_stream(
            video_id, "best", client="web", label="yt-dlp+web", session_id=session_id
        )),
        ("6. yt-dlp + android client (height-constrained) + proxy", stream_mod._ytdlp_stream(
            video_id, stream_mod._fmt(h), client="android", label="yt-dlp+android-constrained", session_id=session_id
        )),
        ("7. yt-dlp unconstrained + proxy", stream_mod._ytdlp_stream(
            video_id, "best", label="yt-dlp+unconstrained", session_id=session_id
        )),
    ]
    if quick:
        stream_tests = stream_tests[:2]  # only methods 1-2

    for name, coro in stream_tests:
        results.append(await run_test(name, coro))

    # ── 1b. Diagnose method 1's 400 error (raw response body) ────
    results.append(await run_test("1b. InnerTube ANDROID raw 400 diagnosis", diagnose_innertube_400(video_id, session_id)))

    # ── M. Video metadata ────────────────────────────────────────
    results.append(await run_test("M. Video metadata (oEmbed -> InnerTube)", stream_mod.get_video_metadata(video_id, session_id)))

    # ── T1-T3. Transcript fallback chain (each method individually) ──
    transcript_tests = [
        ("T1. youtube-transcript-api + proxy", transcript_mod._ytta_proxy(video_id, "en", session_id)),
        ("T2. InnerTube ANDROID + proxy (timedtext)", transcript_mod._innertube_android_proxy(video_id, "en", session_id)),
        ("T3. yt-dlp subtitle extraction + proxy", transcript_mod._ytdlp_subs_proxy(video_id, "en", session_id)),
    ]
    for name, coro in transcript_tests:
        results.append(await run_test(name, coro))

    # ── Report ────────────────────────────────────────────────────
    print()
    print(f"{'METHOD':<58} {'STATUS':<8} {'TIME':>7}  DETAIL")
    print("-" * 110)
    for r in results:
        status = "OK" if r["ok"] else "FAIL"
        detail = r["detail"]
        if r["ok"]:
            if isinstance(detail, str):
                detail = fmt_url(detail, length=200)
            elif isinstance(detail, list):
                detail = f"{len(detail)} entries — first: {fmt_url(detail[0]['text'], 60) if detail else ''}"
            elif isinstance(detail, dict):
                detail = str(detail)
        print(f"{r['name']:<58} {status:<8} {r['elapsed']:>6.2f}s  {detail}")

    print()
    n_ok = sum(1 for r in results if r["ok"])
    print(f"{n_ok}/{len(results)} checks passed")


if __name__ == "__main__":
    asyncio.run(main())
