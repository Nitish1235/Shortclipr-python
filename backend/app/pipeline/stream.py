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
from app.core.proxy import get_proxy_url, url_is_ip_bound
from app.core.redis import cache_stream_url, get_cached_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()
# Validate proxy environment variables early – will raise a clear error if mis‑configured
from app.core.proxy import validate_proxy_env
validate_proxy_env()

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

    Prefers the highest quality at or below target_height (e.g. 1080p → 720p → 480p).
    Only falls back above the cap if the video has no streams at or below it at all.
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

    # Best quality within the cap (1080p → 720p → 480p → ...)
    within_cap = [s for s in video_streams if s.get("height", 0) <= target_height]
    if within_cap:
        return within_cap[0]["url"]

    # Video has no streams at or below cap — return lowest available rather than nothing
    return video_streams[-1]["url"]


def _pick_best_audio_stream(data: dict) -> str | None:
    """Pick best audio-only stream URL from InnerTube response (legacy helper)."""
    sd = data.get("streamingData", {})
    audio = [
        f for f in sd.get("adaptiveFormats", [])
        if f.get("mimeType", "").startswith("audio/") and "url" in f
    ]
    if not audio:
        return None
    audio.sort(key=lambda f: int(f.get("bitrate", 0)), reverse=True)
    return audio[0]["url"]


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
    """Pick a direct CDN stream URL from yt-dlp extract_info output."""
    if not info:
        return None
    # Prefer formats with googlevideo.com URLs (direct CDN, supports range requests)
    for f in reversed(info.get("formats", [])):
        if f.get("url") and "googlevideo.com" in f.get("url", ""):
            return f["url"]
    return info.get("url")


# ── Method 1: InnerTube ANDROID + proxy-cheap ─────────────────

async def _innertube_android_stream(video_id: str, target_height: int, session_id: str | None = None) -> str:
    proxy = get_proxy_url(session_id)
    data = await call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)

    blocked, reason = _innertube_is_blocked(data)
    if blocked:
        raise RuntimeError(f"InnerTube ANDROID blocked — {reason}")

    url = _pick_best_stream(data, target_height)
    if not url:
        raise RuntimeError("InnerTube ANDROID: no video stream URL in response")

    logger.info(f"[{video_id}] stream ← InnerTube ANDROID (proxy={bool(proxy)})")
    return url


# ── Methods 2-5: yt-dlp variants via proxy-cheap ──────────────

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

    proxy = get_proxy_url(session_id)
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
    Tries mp4 first, then any container, then any combined stream at or below cap.
    Never returns above the cap unless the video literally has no streams below it.
    """
    return (
        f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]"
        f"/bestvideo[height<={height}]+bestaudio"
        f"/best[height<={height}]"
        f"/best"
    )


def _fmt_unconstrained() -> str:
    """
    Most permissive format selector - no height or extension constraints.
    Used as final fallback when all else fails.
    """
    return "best"


def _fmt_relaxed(height: int) -> str:
    """
    Relaxed format selector - no extension constraint.
    Used as an additional fallback when strict mp4 selector fails.
    """
    return (
        f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
        f"/bestvideo+bestaudio/best"
    )


# ── Fallback chain ─────────────────────────────────────────────

async def _resolve_stream_url(video_id: str, quality: str, session_id: str | None = None) -> tuple[str, str]:
    h = int(quality.rstrip("p"))

    chain: list[tuple[str, object]] = [
        # 1. InnerTube ANDROID + proxy  (~2-10s, highest priority)
        ("InnerTube ANDROID+proxy", lambda: _innertube_android_stream(video_id, h, session_id)),
        # 2. yt-dlp + tv_embedded client + proxy (very reliable, ~15-30s)
        ("yt-dlp+tv_embedded+proxy", lambda: _ytdlp_stream(
            video_id, "best", client="tv_embedded", label="yt-dlp+tv_embedded", session_id=session_id
        )),
        # 3. yt-dlp + android client + proxy (use "best" format)
        ("yt-dlp+android+proxy", lambda: _ytdlp_stream(
            video_id, "best", client="android", label="yt-dlp+android", session_id=session_id
        )),
        # 4. yt-dlp + ios client + proxy
        ("yt-dlp+ios+proxy", lambda: _ytdlp_stream(
            video_id, "best", client="ios", label="yt-dlp+ios", session_id=session_id
        )),
        # 5. yt-dlp with height-constrained format (for android)
        ("yt-dlp+android-constrained+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android", label="yt-dlp+android-constrained", session_id=session_id
        )),
        # 6. yt-dlp unconstrained (any client, any format)
        ("yt-dlp+unconstrained+proxy", lambda: _ytdlp_stream(
            video_id, "best", label="yt-dlp+unconstrained", session_id=session_id
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


async def get_stream_urls(video_id: str, quality: str = "1080p", session_id: str | None = None) -> tuple[str, str | None, str]:
    """
    Resolve both video and audio CDN URLs for clip extraction.

    High-resolution adaptive (DASH) video formats (e.g. 1080p) are video-only —
    audio must be fetched as a separate stream and merged during extraction.
    Returns (video_url, audio_url, user_agent) where audio_url is None if the
    picked video stream already has embedded audio (progressive format) or no
    separate audio stream is available, and user_agent is the UA both URLs
    must be downloaded with (CDN URLs are bound to the requesting client's UA).

    Falls back to get_stream_url() (video only, audio=None) if the InnerTube
    ANDROID call fails — the yt-dlp fallback chain returns "best" which is
    typically a combined audio+video stream already.
    """
    h = int(quality.rstrip("p"))
    try:
        proxy = get_proxy_url(session_id)
        data = await call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)

        blocked, reason = _innertube_is_blocked(data)
        if blocked:
            raise RuntimeError(f"InnerTube ANDROID blocked — {reason}")

        video_url = _pick_best_stream(data, h)
        if not video_url:
            raise RuntimeError("InnerTube ANDROID: no video stream URL in response")

        video_fmt = _find_format_by_url(data, video_url)
        audio_url = None if (video_fmt and _format_has_audio(video_fmt)) else _pick_best_audio_stream(data)

        logger.info(
            f"[{video_id}] stream+audio ← InnerTube ANDROID (proxy={bool(proxy)}, "
            f"audio={'separate' if audio_url else 'embedded/none'})"
        )
        return video_url, audio_url, _ANDROID_HEADERS["User-Agent"]
    except Exception as exc:
        logger.warning(f"[{video_id}] get_stream_urls InnerTube failed ({exc}); falling back to video-only")
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

    # 3. Resolve
    proxy = get_proxy_url(session_id)
    for client_name in ["ANDROID", "TV", "IOS"]:
        try:
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


async def get_video_metadata(video_id: str, session_id: str | None = None) -> dict:
    """
    Fetch video title, duration, thumbnail.

    Order:
      1. YouTube oEmbed  — public endpoint, no proxy, fastest
                           (no duration field — triggers InnerTube for duration)
      2. InnerTube ANDROID, no proxy — full metadata including duration

    Metadata calls are cheap/low-risk and don't need proxy bandwidth or IP
    rotation — only transcript + stream/download routes go through the proxy.
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

    # ── 2. InnerTube ANDROID, no proxy (for duration, or if oEmbed failed) ──
    try:
        data = await call_player_api(video_id, client_name="ANDROID", proxy_url=None)
        details = data.get("videoDetails", {})
        if details:
            return {
                "title":     details.get("title", "")     or (oembed_meta or {}).get("title", ""),
                "channel":   details.get("author", "")    or (oembed_meta or {}).get("channel", ""),
                "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "duration":  int(details.get("lengthSeconds", 0)),
                "video_id":  video_id,
            }
    except Exception as e:
        logger.warning(f"[{video_id}] InnerTube ANDROID metadata failed: {e}")

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
