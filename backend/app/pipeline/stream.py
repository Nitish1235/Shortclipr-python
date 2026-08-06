"""
stream.py — Step 3 of the ShortClipr pipeline.

Stream URL extraction: 6-method fallback chain, all via proxy-cheap.

Priority order (fastest → broadest compatibility):
  1. InnerTube ANDROID + proxy-cheap        (~2-10s, highest priority)
  2. yt-dlp + proxy-cheap + tv_embedded     (~15-30s, very reliable)
  3. yt-dlp + proxy-cheap + android client
  4. yt-dlp + proxy-cheap + ios client
  5. yt-dlp + proxy-cheap + android (height-constrained format)
  6. yt-dlp + proxy-cheap (relaxed, no format constraints)

NOTE: mweb/web InnerTube clients are intentionally excluded — they
require a PoToken that yt-dlp cannot supply, and consistently fail
with "Requested format is not available" regardless of proxy/region.

Fallback triggers on:
  - playabilityStatus != OK  (LOGIN_REQUIRED, SIGN_IN_REQUIRED, etc.)
  - streamingData absent from response  (soft bot block signal)
  - yt-dlp DownloadError containing bot/block/sign-in keywords
  - HTTP 429 (rate-limited) or 403 (forbidden)
  - Any other unhandled exception

CLIENTS / PLAYER_ENDPOINT / _pick_best_stream / _pick_best_audio_stream
are kept for backward compatibility with testing.py Lab.
"""

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse

import httpx

from app.core.config import get_settings
from app.core.proxy import get_dataimpulse_proxy, get_proxy_url, url_is_ip_bound
from app.core.redis import cache_stream_url, get_cached_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()

# Helper functions for optional Redis caching – skip if Redis not configured
def _redis_enabled() -> bool:
    return bool(settings.UPSTASH_REDIS_URL)

async def _maybe_get_cached(key: str) -> str | None:
    if _redis_enabled():
        from app.core.redis import get_cached_stream_url
        return await get_cached_stream_url(key)
    return None

async def _maybe_cache(key: str, url: str) -> None:
    if _redis_enabled():
        from app.core.redis import cache_stream_url
        await cache_stream_url(key, url)


# Thread pool for blocking yt-dlp calls (sync library)
_YTDLP_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ytdlp-stream")

# ── Legacy client registry (used by testing.py Lab) ───────────

CLIENTS = {
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
        "api_key": "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8",
    },
    "ANDROID_VR": {
        "context": {
            "client": {
                "clientName": "ANDROID_VR",
                "clientVersion": "1.28.63",
                "hl": "en",
                "gl": "US",
            }
        },
        "headers": {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; Quest 2) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/15.0.0.0.22 SamsungBrowser/4.0 Chrome/89.0.4389.90 Mobile Safari/537.36",
            "X-Youtube-Client-Name": "28",
            "X-Youtube-Client-Version": "1.28.63",
        },
        "api_key": "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    },
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
            }
        },
        "headers": {
            "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X; en_US)",
            "X-Youtube-Client-Name": "2",
            "X-Youtube-Client-Version": "19.29.1",
        },
        "api_key": "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ",
    },
    "MWEB": {
        "context": {
            "client": {
                "clientName": "MWEB",
                "clientVersion": "2.20230301.09.00",
                "hl": "en",
                "gl": "US",
            }
        },
        "headers": {
            "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36",
            "X-Youtube-Client-Name": "2",
            "X-Youtube-Client-Version": "2.20230301.09.00",
            "Referer": "https://m.youtube.com/",
        },
        "api_key": "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    },
}

PLAYER_ENDPOINT = f"{settings.INNERTUBE_API_BASE}/player"

# ── Production ANDROID client config ──────────────────────────

_ANDROID_CTX = {
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
}

_ANDROID_HEADERS = {
    "User-Agent": "com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip",
    "X-Youtube-Client-Name": "3",
    "X-Youtube-Client-Version": "21.02.35",
    "Content-Type": "application/json",
    "X-Goog-Api-Format-Version": "2",
    "Origin": "https://www.youtube.com",
}

_ANDROID_API_KEY = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"

# Default desktop UA for the web/unconstrained yt-dlp fallback
_WEB_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# CDN URLs minted by InnerTube/yt-dlp player clients are validated against
# the User-Agent of the client that requested them — downloading with a
# different UA (e.g. FFmpeg's default "Lavf/...") gets an empty response
# ("End of file"). Map each stream-resolution method to the UA it must be
# downloaded with.
_STREAM_USER_AGENTS = {
    "InnerTube ANDROID+proxy": _ANDROID_HEADERS["User-Agent"],
    "yt-dlp+tv_embedded+proxy": CLIENTS["TV"]["headers"]["User-Agent"],
    "yt-dlp+android+proxy": _ANDROID_HEADERS["User-Agent"],
    "yt-dlp+ios+proxy": CLIENTS["IOS"]["headers"]["User-Agent"],
    "yt-dlp+android-constrained+proxy": _ANDROID_HEADERS["User-Agent"],
    "yt-dlp+unconstrained+proxy": _WEB_USER_AGENT,
}

# ── Bot / block detection ──────────────────────────────────────

# InnerTube playabilityStatus values that signal bot detection / hard block
_BLOCKED_STATUSES = frozenset({
    "LOGIN_REQUIRED",
    "SIGN_IN_REQUIRED",
    "AGE_CHECK_REQUIRED",
    "CONTENT_CHECK_REQUIRED",
})

# yt-dlp error substrings that indicate bot detection or IP block
_YTDLP_BOT_SIGNALS = (
    "bot",
    "sign in to confirm",
    "log in",
    "login required",
    "blocked",
    "too many requests",
    "429",
    "403 forbidden",
    "please verify you're human",
    "automated queries",
    "not a bot",
    "requested format is not available",
    "youtube is no longer supported",
)


def _innertube_is_blocked(data: dict) -> tuple[bool, str]:
    """
    Return (is_blocked, reason).
    Blocked = True means this method failed due to bot detection and the
    next fallback should be tried immediately.
    """
    ps = data.get("playabilityStatus", {})
    status = ps.get("status", "OK")

    if status in _BLOCKED_STATUSES:
        reason = ps.get("reason") or ps.get("messages", [status])[0]
        return True, f"{status}: {reason}"

    if not data.get("streamingData"):
        if status != "OK":
            return True, f"no streamingData + status={status}"
        # status=OK but no streamingData → soft bot block (very common)
        return True, "streamingData absent despite OK status (soft block)"

    return False, ""


def _ytdlp_is_blocked(err: str) -> bool:
    low = err.lower()
    return any(sig in low for sig in _YTDLP_BOT_SIGNALS)


# ── InnerTube ANDROID player call ─────────────────────────────

async def call_player_api(
    video_id: str,
    client_name: str = "ANDROID",
    send_params: bool = False,
    proxy_url: str | None = None,
) -> dict:
    """
    POST to InnerTube /player.

    Production path: client_name="ANDROID" (default) with proxy_url.
    Legacy path (testing.py Lab): client_name=one of CLIENTS keys, no proxy.

    proxy_url: full URL string or None for direct connection.
    """
    if client_name == "ANDROID":
        # Production ANDROID client
        payload: dict = {
            "context": _ANDROID_CTX,
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
        }
        if send_params:
            payload["params"] = "2AMBCgIQBg=="
        headers = _ANDROID_HEADERS.copy()
        api_key = _ANDROID_API_KEY
    else:
        # Legacy multi-client path for testing.py Lab
        config = CLIENTS[client_name]
        payload = {
            "context": config["context"].copy(),
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
        }
        if send_params:
            payload["params"] = "2AMBCgIQBg=="
        headers = config["headers"].copy()
        headers["Content-Type"] = "application/json"
        headers["X-Goog-Api-Format-Version"] = "2"
        api_key = config["api_key"]

    client_kwargs: dict = {"timeout": 20, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    async with httpx.AsyncClient(**client_kwargs) as client:
        resp = await client.post(
            PLAYER_ENDPOINT,
            json=payload,
            params={"key": api_key},
            headers=headers,
        )
        if resp.status_code == 429:
            raise RuntimeError("InnerTube rate-limited (429)")
        if resp.status_code == 403:
            raise RuntimeError("InnerTube forbidden (403)")
        resp.raise_for_status()
        return resp.json()


# ── Stream URL selection helpers ───────────────────────────────

def _pick_best_stream(data: dict, target_height: int) -> str | None:
    """
    Pick best video stream URL from InnerTube response.

    Prefers H.264 (avc1) → VP9 → any non-AV1, all within target_height cap.
    AV1 (av01) is excluded: Cloud Run has no hardware AV1 decoder and software
    decoding fails with "Missing Sequence Header" / "Failed to get pixel format".
    """
    sd = data.get("streamingData", {})
    formats = sd.get("formats", []) + sd.get("adaptiveFormats", [])
    video_streams = sorted(
        [f for f in formats if f.get("mimeType", "").startswith("video/") and "url" in f],
        key=lambda f: f.get("height", 0),
        reverse=True,
    )
    if not video_streams:
        return None

    def _codec(f: dict) -> str:
        return f.get("mimeType", "")

    def _not_av1(f: dict) -> bool:
        return "av01" not in _codec(f)

    def _is_h264(f: dict) -> bool:
        return "avc1" in _codec(f)

    def _is_vp9(f: dict) -> bool:
        return "vp9" in _codec(f)

    within_cap = [s for s in video_streams if s.get("height", 0) <= target_height]

    # Prefer H.264 → VP9 → any non-AV1 within cap
    for pred in (_is_h264, _is_vp9, _not_av1):
        candidates = [s for s in within_cap if pred(s)]
        if candidates:
            return candidates[0]["url"]

    # Nothing within cap — try non-AV1 above cap before giving up
    non_av1_above = [s for s in video_streams if _not_av1(s)]
    if non_av1_above:
        return non_av1_above[-1]["url"]

    # Last resort: AV1 (will likely fail on Cloud Run but at least returns something)
    return video_streams[-1]["url"]


def _pick_best_audio_stream(data: dict) -> str | None:
    """
    Pick best audio-only stream URL from InnerTube response (legacy helper).

    Prefers mp4a (AAC-in-MP4) over opus/vorbis (served in a WebM/Matroska
    container) even when opus has a higher declared bitrate — YouTube's
    opus stream (itag 251, ~160kbps) usually outranks its m4a sibling
    (itag 140, ~128kbps) on bitrate alone, so a plain sort-by-bitrate picks
    WebM most of the time. WebM has no MP4 sidx box, so the DASH
    downloader's byte-range slicer (which parses sidx) can't target it —
    picking mp4a here keeps that fast path working. Falls back to the
    highest-bitrate stream of any container if no mp4a option exists.
    """
    sd = data.get("streamingData", {})
    audio = [
        f for f in sd.get("adaptiveFormats", [])
        if f.get("mimeType", "").startswith("audio/") and "url" in f
    ]
    if not audio:
        return None
    mp4_audio = [f for f in audio if "mp4a" in f.get("mimeType", "")]
    pool = mp4_audio or audio
    pool.sort(key=lambda f: int(f.get("bitrate", 0)), reverse=True)
    return pool[0]["url"]


def _format_has_audio(fmt: dict) -> bool:
    """True if a format's mimeType codecs include an audio codec (combined stream)."""
    mime = fmt.get("mimeType", "")
    return "mp4a" in mime or "opus" in mime or "vorbis" in mime


def _find_format_by_url(data: dict, url: str) -> dict | None:
    sd = data.get("streamingData", {})
    for f in sd.get("formats", []) + sd.get("adaptiveFormats", []):
        if f.get("url") == url:
            return f
    return None


def _pick_stream_ytdlp(info: dict | None) -> str | None:
    """Pick the video CDN URL from yt-dlp extract_info output.

    Checks requested_formats first so the format selector (which excludes av01)
    is actually honoured. Falling back to the raw formats list was the bug that
    returned AV1 URLs even when _fmt() excluded them.
    """
    if not info:
        return None
    # requested_formats: the format(s) yt-dlp selected to match our format string.
    # For a video+audio combo, the video stream has vcodec != 'none'.
    for fmt in info.get("requested_formats", []):
        if fmt.get("vcodec", "none") != "none" and fmt.get("url"):
            return fmt["url"]
    # Single-format selection: info['url'] is already the chosen stream.
    if info.get("url") and "googlevideo.com" in info.get("url", ""):
        return info["url"]
    # Last resort: scan all formats but skip AV1.
    for f in reversed(info.get("formats", [])):
        url = f.get("url", "")
        if url and "googlevideo.com" in url and "av01" not in f.get("vcodec", ""):
            return url
    return info.get("url")


def _pick_audio_ytdlp(info: dict | None) -> str | None:
    """Pick the audio CDN URL from yt-dlp extract_info output (when bestvideo+bestaudio was requested)."""
    if not info:
        return None
    for fmt in info.get("requested_formats", []):
        # Audio-only format: vcodec is 'none' and acodec is set
        if fmt.get("vcodec", "none") == "none" and fmt.get("acodec", "none") != "none" and fmt.get("url"):
            return fmt["url"]
    return None


# ── Method 1: InnerTube ANDROID + DataImpulse ─────────────────

async def _innertube_android_stream(video_id: str, target_height: int, session_id: str | None = None) -> str:
    proxy = get_dataimpulse_proxy(purpose="stream-innertube")
    data = await call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)

    blocked, reason = _innertube_is_blocked(data)
    if blocked:
        raise RuntimeError(f"InnerTube ANDROID blocked — {reason}")

    url = _pick_best_stream(data, target_height)
    if not url:
        raise RuntimeError("InnerTube ANDROID: no video stream URL in response")

    logger.info(f"[{video_id}] stream ← InnerTube ANDROID (proxy={bool(proxy)})")
    return url


# ── Methods 2-5: yt-dlp variants via DataImpulse ─────────────

def _ytdlp_run_sync(opts: dict, video_url: str) -> dict | None:
    import yt_dlp
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(video_url, download=False)


def _ytdlp_base_opts(proxy_url: str | None) -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "ignoreerrors": False,
        "socket_timeout": 30,
    }
    if proxy_url:
        opts["proxy"] = proxy_url
    # Default to the most permissive client (web) unless overridden later
    opts["extractor_args"] = {"youtube": {"player_client": ["web"]}}
    return opts


async def _ytdlp_stream(
    video_id: str,
    format_str: str,
    *,
    client: str | None = None,
    label: str,
    session_id: str | None = None,
) -> str:
    import yt_dlp

    proxy = get_dataimpulse_proxy(purpose=f"stream-ytdlp-{label}")
    opts = _ytdlp_base_opts(proxy)
    opts["format"] = format_str
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}

    loop = asyncio.get_running_loop()
    try:
        info = await loop.run_in_executor(
            _YTDLP_POOL,
            _ytdlp_run_sync,
            opts,
            f"https://www.youtube.com/watch?v={video_id}",
        )
    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        tag = "blocked" if _ytdlp_is_blocked(msg) else "error"
        raise RuntimeError(f"{label} {tag}: {msg[:150]}")

    url = _pick_stream_ytdlp(info)
    if not url:
        raise RuntimeError(f"{label}: no CDN URL found in yt-dlp output")

    logger.info(f"[{video_id}] stream ← {label} (proxy={bool(proxy)})")
    return url


def _fmt(height: int) -> str:
    """
    yt-dlp format selector capped at height.
    AV1 (av01) is excluded: Cloud Run has no hardware AV1 decoder and
    software decoding produces "Missing Sequence Header" / corrupted output.

    IMPORTANT — use `vcodec!^=av01` (starts-with negation), NOT `vcodec!=av01`
    (exact-match negation). Real codec tags look like "av01.0.08M.08", never
    the bare string "av01" — `!=av01` silently never matches anything and
    excludes nothing, confirmed in production: a video with avc1 1080p AND
    vp9 1080p both available still got served av01 1080p by this selector
    with the `!=` form. `!^=` correctly excludes every av01.* variant.

    Deliberately STRICT — every tier excludes av01, with NO unconstrained
    fallback at the end (that's _fmt_unconstrained()/_fmt_relaxed()'s job,
    used as explicit later tiers in the broader fallback chains). Letting
    this selector silently fall through to AV1 when no clean format is
    found at this provider meant videos that only had AV1 available at the
    target height got an AV1 stream here, on attempt 1, before any of the
    OTHER providers (InnerTube ANDROID/TV/IOS, other yt-dlp clients) ever
    got a chance to find a non-AV1 option. If every tier here fails to
    match, yt-dlp raises and the caller's fallback chain moves on instead —
    which is the correct behaviour.

    Audio stays pinned to `ext=m4a` for one extra tier (2) before the fully
    unconstrained `+bestaudio` (3) — YouTube's opus/WebM audio usually beats
    m4a/AAC on declared bitrate, so an unconstrained `bestaudio` picks WebM
    most of the time. WebM has no MP4 sidx box, so the DASH downloader's
    byte-range slicer can't target it. Tier 2 relaxes the VIDEO ext=mp4
    constraint (in case THAT was what tier 1 couldn't match) while still
    keeping audio sidx-compatible; only tier 3 gives up that guarantee.
    """
    return (
        f"bestvideo[height<={height}][ext=mp4][vcodec!^=av01]+bestaudio[ext=m4a]"
        f"/bestvideo[height<={height}][vcodec!^=av01]+bestaudio[ext=m4a]"
        f"/bestvideo[height<={height}][vcodec!^=av01]+bestaudio"
        f"/best[height<={height}][vcodec!^=av01]"
    )


def _fmt_unconstrained() -> str:
    """
    Most permissive format selector - no height or extension constraints.
    Used as final fallback when all else fails.
    """
    return "bestvideo[vcodec!^=av01]+bestaudio/best"


def _fmt_relaxed(height: int) -> str:
    """
    Relaxed format selector - no extension constraint.
    Used as an additional fallback when strict mp4 selector fails.
    """
    return (
        f"bestvideo[height<={height}][vcodec!^=av01]+bestaudio"
        f"/best[height<={height}][vcodec!^=av01]"
        f"/bestvideo[vcodec!^=av01]+bestaudio"
        f"/best"
    )


# ── Fallback chain ─────────────────────────────────────────────

async def _resolve_stream_url(video_id: str, quality: str, session_id: str | None = None) -> tuple[str, str]:
    h = int(quality.rstrip("p"))

    chain: list[tuple[str, object]] = [
        # 1. InnerTube ANDROID + proxy  (~2-10s, highest priority)
        ("InnerTube ANDROID+proxy", lambda: _innertube_android_stream(video_id, h, session_id)),
        # 2-4. yt-dlp + tv_embedded/android/ios client + proxy — all using
        # _fmt(h) (AV1-excluded), NOT a bare "best" selector. "best" has no
        # codec filter at all, so for any video where the chosen client's
        # best-at-this-height format happens to be AV1, these tiers would
        # silently hand back an AV1 stream and the LATER InnerTube clients
        # (which DO avoid AV1, see _pick_best_stream) would never get a
        # chance to find a clean one. AV1-permissive selectors stay
        # reserved for the explicit last-resort tiers below (6).
        ("yt-dlp+tv_embedded+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="tv_embedded", label="yt-dlp+tv_embedded", session_id=session_id
        )),
        ("yt-dlp+android+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android", label="yt-dlp+android", session_id=session_id
        )),
        ("yt-dlp+ios+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="ios", label="yt-dlp+ios", session_id=session_id
        )),
        # 5. yt-dlp + android client + relaxed format (no ext=mp4 constraint).
        # Tries non-AV1 variants first, same as tiers 2-4, but its own
        # trailing bare `/best` means THIS tier can accept AV1 if none of
        # those variants match for this client — intentional, one tier
        # earlier than the universal last-resort below, not a regression
        # of the original bug (4 strict, AV1-free attempts already ran first).
        ("yt-dlp+android-constrained+proxy", lambda: _ytdlp_stream(
            video_id, _fmt_relaxed(h), client="android", label="yt-dlp+android-constrained", session_id=session_id
        )),
        # 6. yt-dlp unconstrained (any client, any format) — explicit final
        # last resort, AV1 permitted here ONLY (see _fmt_unconstrained docstring).
        ("yt-dlp+unconstrained+proxy", lambda: _ytdlp_stream(
            video_id, _fmt_unconstrained(), label="yt-dlp+unconstrained", session_id=session_id
        )),
    ]

    last_err: Exception | None = None
    for idx, (label, attempt) in enumerate(chain, 1):
        try:
            url = await attempt()
            return url, _STREAM_USER_AGENTS[label]
        except Exception as exc:
            logger.warning(f"[{video_id}] stream method {idx} ({label}) failed: {exc}")
            last_err = exc

    raise RuntimeError(
        f"All {len(chain)} stream methods failed for {video_id}. Last error: {last_err}"
    )


# ── Public API ─────────────────────────────────────────────────

async def get_stream_url(video_id: str, quality: str = "1080p", session_id: str | None = None) -> tuple[str, str]:
    """Returns (video_url, user_agent). user_agent is the UA the URL must be downloaded with."""
    # 1. Look up job-specific cache first
    if session_id:
        job_cache_key = f"{video_id}:{quality}:{session_id}"
        cached = await _maybe_get_cached(job_cache_key)
        if cached:
            logger.info(f"[{video_id}] stream ← job-specific cache ({session_id})")
            return cached, _ANDROID_HEADERS["User-Agent"]

    # 2. Look up global cache
    global_cache_key = f"{video_id}:{quality}"
    cached = await _maybe_get_cached(global_cache_key)
    if cached:
        if not url_is_ip_bound(cached):
            logger.info(f"[{video_id}] stream ← global cache (non-IP-bound)")
            return cached, _ANDROID_HEADERS["User-Agent"]
        else:
            logger.info(f"[{video_id}] ignoring global cache: URL is IP-bound")

    # 3. Resolve the URL
    url, user_agent = await _resolve_stream_url(video_id, quality, session_id)

    # 4. Cache appropriately
    if url_is_ip_bound(url):
        if session_id:
            job_cache_key = f"{video_id}:{quality}:{session_id}"
            await _maybe_cache(job_cache_key, url)
    else:
        await _maybe_cache(global_cache_key, url)

    return url, user_agent


async def get_stream_urls(
    video_id: str,
    quality: str = "1080p",
    session_id: str | None = None,
    proxy_override: str | None = None,
) -> tuple[str, str | None, str]:
    """
    Resolve both video and audio CDN URLs for clip extraction.

    High-resolution adaptive (DASH) video formats (e.g. 1080p) are video-only —
    audio must be fetched as a separate stream and merged during extraction.
    Returns (video_url, audio_url, user_agent) where audio_url is None if the
    picked video stream already has embedded audio (progressive format) or no
    separate audio stream is available, and user_agent is the UA both URLs
    must be downloaded with (CDN URLs are bound to the requesting client's UA).

    proxy_override: when set, ALL resolution attempts use this proxy instead of
    DataImpulse. Used by the FFmpeg stage to resolve URLs through the SAME IP
    that will download them (Proxy-Seller ISP), avoiding IP-bound signature
    mismatches.

    Tries yt-dlp (tv_embedded, with audio) FIRST — in production all three
    InnerTube clients (ANDROID/TV/IOS) were consistently getting blocked or
    rejected before ever reaching yt-dlp, so every job paid for 3 guaranteed
    failures (~8s) before landing on the one path that actually works. If
    yt-dlp fails too, falls back to InnerTube ANDROID → TV → IOS, then
    finally to the video-only chain (get_stream_url) as a last resort.
    """
    h = int(quality.rstrip("p"))

    # ── 1. yt-dlp + tv_embedded + audio (now first — see docstring) ────
    proxy = proxy_override or get_dataimpulse_proxy(purpose="stream-ytdlp-tv_embedded")
    opts = _ytdlp_base_opts(proxy)
    opts["format"] = _fmt(h)
    opts["extractor_args"] = {"youtube": {"player_client": ["tv_embedded"]}}
    loop = asyncio.get_running_loop()
    try:
        info = await loop.run_in_executor(
            _YTDLP_POOL,
            _ytdlp_run_sync,
            opts,
            f"https://www.youtube.com/watch?v={video_id}",
        )
        video_url = _pick_stream_ytdlp(info)
        if video_url:
            audio_url = _pick_audio_ytdlp(info)
            logger.info(
                f"[{video_id}] stream+audio ← yt-dlp tv_embedded "
                f"(audio={'separate' if audio_url else 'embedded/none'})"
            )
            return video_url, audio_url, _WEB_USER_AGENT
        logger.warning(f"[{video_id}] yt-dlp tv_embedded returned no video URL; trying InnerTube clients")
    except Exception as ytdlp_exc:
        logger.warning(f"[{video_id}] yt-dlp tv_embedded failed ({ytdlp_exc}); trying InnerTube clients")

    # ── 2. InnerTube ANDROID → TV → IOS — video+audio resolved in ONE
    # call so both CDN URLs share the same proxy exit IP (required for
    # IP-bound URLs) ─────────────────────────────────────────────────
    _clients = [
        ("ANDROID", True,  _ANDROID_HEADERS["User-Agent"]),
        ("TV",      False, CLIENTS["TV"]["headers"]["User-Agent"]),
        ("IOS",     False, CLIENTS["IOS"]["headers"]["User-Agent"]),
    ]
    last_exc: Exception | None = None
    for client_name, send_params, user_agent in _clients:
        try:
            proxy = proxy_override or get_dataimpulse_proxy(purpose=f"stream-innertube-{client_name}")
            data = await call_player_api(video_id, client_name=client_name, send_params=send_params, proxy_url=proxy)

            blocked, reason = _innertube_is_blocked(data)
            if blocked:
                raise RuntimeError(f"InnerTube {client_name} blocked — {reason}")

            video_url = _pick_best_stream(data, h)
            if not video_url:
                raise RuntimeError(f"InnerTube {client_name}: no video stream URL in response")

            video_fmt = _find_format_by_url(data, video_url)
            audio_url = None if (video_fmt and _format_has_audio(video_fmt)) else _pick_best_audio_stream(data)

            logger.info(
                f"[{video_id}] stream+audio ← InnerTube {client_name} (proxy={bool(proxy)}, "
                f"audio={'separate' if audio_url else 'embedded/none'})"
            )
            return video_url, audio_url, user_agent
        except Exception as exc:
            logger.warning(f"[{video_id}] get_stream_urls InnerTube {client_name} failed ({exc}); trying next client")
            last_exc = exc

    # ── 3. All else failed — video-only chain as the final fallback ────
    logger.warning(f"[{video_id}] yt-dlp + all InnerTube clients failed ({last_exc}); falling back to video-only chain")
    video_url, user_agent = await get_stream_url(video_id, quality, session_id)
    return video_url, None, user_agent


async def get_audio_stream_url(video_id: str, session_id: str | None = None) -> str:
    """Audio-only stream URL — used by testing.py Lab."""
    # 1. Look up job-specific cache first
    if session_id:
        job_cache_key = f"{video_id}:audio:{session_id}"
        cached = await get_cached_stream_url(job_cache_key)
        if cached:
            logger.info(f"[{video_id}] audio stream ← job-specific cache ({session_id})")
            return cached

    # 2. Look up global cache
    global_cache_key = f"{video_id}:audio"
    cached = await get_cached_stream_url(global_cache_key)
    if cached:
        if not url_is_ip_bound(cached):
            logger.info(f"[{video_id}] audio stream ← global cache (non-IP-bound)")
            return cached
        else:
            logger.info(f"[{video_id}] ignoring global audio cache: URL is IP-bound")

    # 3. Resolve — fresh IP per client attempt
    for client_name in ["ANDROID", "TV", "IOS"]:
        try:
            proxy = get_dataimpulse_proxy(purpose=f"stream-audio-{client_name}")
            data = await call_player_api(video_id, client_name=client_name, send_params=True, proxy_url=proxy)
            url = _pick_best_audio_stream(data)
            if url:
                # 4. Cache appropriately
                if url_is_ip_bound(url):
                    if session_id:
                        job_cache_key = f"{video_id}:audio:{session_id}"
                        await cache_stream_url(job_cache_key, url)
                else:
                    await cache_stream_url(global_cache_key, url)
                return url
        except Exception:
            continue

    raise RuntimeError(f"Could not resolve audio stream for {video_id}")


def _best_thumbnail(details: dict, video_id: str) -> str:
    """
    Highest-resolution thumbnail URL from InnerTube's own
    `videoDetails.thumbnail.thumbnails[]` (ordered smallest -> largest),
    falling back to the standard hqdefault.jpg guess if that's missing —
    handles privacy/age-restricted/unusual videos where the guessed URL
    might not actually exist.
    """
    thumbs = (details.get("thumbnail") or {}).get("thumbnails") or []
    if thumbs:
        return thumbs[-1]["url"]
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


async def get_video_metadata(video_id: str, session_id: str | None = None) -> dict:
    """
    Fetch video title, duration, thumbnail.

    Order:
      1. YouTube oEmbed              — public endpoint, no proxy, fastest
                                        (no duration field — InnerTube below
                                        is always needed for an actual duration)
      2. InnerTube ANDROID, WITH proxy — full metadata including duration
      3. InnerTube ANDROID, no proxy   — fallback, if #2 fails (proxy down/
                                          unconfigured) or returns empty

    #2 used to run without a proxy first ("low-risk, no IP rotation
    needed"), but in production this runs from a Cloud Run datacenter IP,
    which YouTube blocks/rate-limits far more aggressively than a
    residential IP — the no-proxy attempt was silently failing on every
    request in production, falling back to oEmbed's hardcoded duration=0
    every time (visible as "0:00" everywhere duration is shown, e.g. the
    minutes-gateway slider never appearing since it has nothing to set a
    range over). Proxy-first fixes that; #3 is just a safety net.
    """
    # ── 1. oEmbed (fast, no proxy) ─────────────────────────────
    oembed_url = f"https://www.youtube.com/oembed?url=https://youtu.be/{video_id}&format=json"
    oembed_meta: dict | None = None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(oembed_url)
            resp.raise_for_status()
            d = resp.json()
        oembed_meta = {
            "title":     d.get("title", ""),
            "channel":   d.get("author_name", ""),
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "duration":  0,          # oEmbed has no duration field
            "video_id":  video_id,
        }
    except Exception as e:
        logger.warning(f"[{video_id}] oEmbed metadata failed: {e}")

    # ── 2 & 3. InnerTube ANDROID — WITH proxy first, no-proxy fallback ──
    proxy_url = get_dataimpulse_proxy(purpose="stream-metadata")
    for attempt, use_proxy in ((2, proxy_url), (3, None)):
        if attempt == 3 and use_proxy is None:
            # #2 already ran with no proxy (none configured) — no point retrying identically
            break
        try:
            data = await call_player_api(video_id, client_name="ANDROID", proxy_url=use_proxy)
            details = data.get("videoDetails", {})
            if details:
                logger.info(f"[{video_id}] Metadata duration resolved via InnerTube (attempt {attempt}, proxy={'yes' if use_proxy else 'no'})")
                return {
                    "title":     details.get("title", "")     or (oembed_meta or {}).get("title", ""),
                    "channel":   details.get("author", "")    or (oembed_meta or {}).get("channel", ""),
                    "thumbnail": _best_thumbnail(details, video_id),
                    "duration":  int(details.get("lengthSeconds", 0)),
                    "video_id":  video_id,
                }
        except Exception as e:
            logger.warning(f"[{video_id}] InnerTube ANDROID metadata failed (attempt {attempt}, proxy={'yes' if use_proxy else 'no'}): {e}")

    # oEmbed succeeded but InnerTube didn't — return oEmbed data (duration=0)
    if oembed_meta:
        return oembed_meta

    raise RuntimeError(f"[{video_id}] Both oEmbed and InnerTube metadata failed")


def extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"embed\/([0-9A-Za-z_-]{11})",
        r"shorts\/([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    return None
