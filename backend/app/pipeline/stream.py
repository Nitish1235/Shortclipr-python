"""
stream.py — Step 3 of the ShortClipr pipeline.

Stream URL extraction: 5-method fallback chain, all via proxy-cheap.

Priority order (fastest → broadest compatibility):
  1. InnerTube ANDROID + proxy-cheap   (~2s, ~100% success rate)
  2. yt-dlp + proxy-cheap + tv_embedded
  3. yt-dlp + proxy-cheap + relaxed 1080p format
  4. yt-dlp + proxy-cheap (default)
  5. yt-dlp + proxy-cheap + android client

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

import httpx

from app.core.config import get_settings
from app.core.proxy import get_proxy_url
from app.core.redis import cache_stream_url, get_cached_stream_url

logger = logging.getLogger(__name__)
settings = get_settings()

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
        "clientVersion": "19.29.01",
        "androidSdkVersion": 30,
        "hl": "en",
        "gl": "US",
    }
}

_ANDROID_HEADERS = {
    "User-Agent": (
        "com.google.android.youtube/19.29.01 "
        "(Linux; U; Android 11; en_US; Pixel 5 Build/RQ3A.211001.001) gzip"
    ),
    "X-Youtube-Client-Name": "3",
    "X-Youtube-Client-Version": "19.29.01",
    "Content-Type": "application/json",
    "X-Goog-Api-Format-Version": "2",
}

_ANDROID_API_KEY = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"

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

    client_kwargs: dict = {"timeout": 20}
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

async def _innertube_android_stream(video_id: str, target_height: int) -> str:
    proxy = get_proxy_url()
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
    return opts


async def _ytdlp_stream(
    video_id: str,
    format_str: str,
    *,
    client: str | None = None,
    label: str,
) -> str:
    import yt_dlp

    proxy = get_proxy_url()
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


# ── Fallback chain ─────────────────────────────────────────────

async def _resolve_stream_url(video_id: str, quality: str) -> str:
    h = int(quality.rstrip("p"))

    chain: list[tuple[str, object]] = [
        # 1. InnerTube ANDROID + proxy  (~2s, highest priority)
        ("InnerTube ANDROID+proxy", lambda: _innertube_android_stream(video_id, h)),
        # 2. yt-dlp + tv_embedded + proxy
        ("yt-dlp+tv_embedded+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="tv_embedded", label="yt-dlp+tv_embedded"
        )),
        # 3. yt-dlp + relaxed 1080p format + proxy
        # (drops [ext=mp4] constraint — sometimes succeeds when strict selector fails)
        ("yt-dlp+1080p-relaxed+proxy", lambda: _ytdlp_stream(
            video_id,
            "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
            label="yt-dlp+1080p-relaxed",
        )),
        # 4. yt-dlp + default format + proxy
        ("yt-dlp+default+proxy", lambda: _ytdlp_stream(
            video_id, "bestvideo+bestaudio/best", label="yt-dlp+default"
        )),
        # 5. yt-dlp + android client + proxy
        ("yt-dlp+android+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android", label="yt-dlp+android"
        )),
    ]

    last_err: Exception | None = None
    for idx, (label, attempt) in enumerate(chain, 1):
        try:
            return await attempt()
        except Exception as exc:
            logger.warning(f"[{video_id}] stream method {idx} ({label}) failed: {exc}")
            last_err = exc

    raise RuntimeError(
        f"All 5 stream methods failed for {video_id}. Last error: {last_err}"
    )


# ── Public API ─────────────────────────────────────────────────

async def get_stream_url(video_id: str, quality: str = "1080p") -> str:
    cache_key = f"{video_id}:{quality}"
    cached = await get_cached_stream_url(cache_key)
    if cached:
        return cached
    url = await _resolve_stream_url(video_id, quality)
    await cache_stream_url(cache_key, url)
    return url


async def get_audio_stream_url(video_id: str) -> str:
    """Audio-only stream URL — used by testing.py Lab."""
    cache_key = f"{video_id}:audio"
    cached = await get_cached_stream_url(cache_key)
    if cached:
        return cached

    proxy = get_proxy_url()
    for client_name in ["ANDROID", "TV", "IOS"]:
        try:
            data = await call_player_api(video_id, client_name=client_name, send_params=True, proxy_url=proxy)
            url = _pick_best_audio_stream(data)
            if url:
                await cache_stream_url(cache_key, url)
                return url
        except Exception:
            continue

    raise RuntimeError(f"Could not resolve audio stream for {video_id}")


async def get_video_metadata(video_id: str) -> dict:
    """
    Fetch video title, duration, thumbnail.

    Order:
      1. YouTube oEmbed  — public endpoint, no proxy, fastest
                           (no duration field — triggers InnerTube for duration)
      2. InnerTube ANDROID + proxy-cheap  — full metadata including duration
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

    # ── 2. InnerTube ANDROID + proxy (for duration, or if oEmbed failed) ──
    proxy = get_proxy_url()
    try:
        data = await call_player_api(video_id, client_name="ANDROID", proxy_url=proxy)
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
