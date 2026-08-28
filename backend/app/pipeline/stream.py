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
from app.core.proxy import get_proxycheap_proxy, get_proxy_url, url_is_ip_bound

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
    "yt-dlp+android_music+proxy": _WEB_USER_AGENT,
    "yt-dlp+android_creator+proxy": _WEB_USER_AGENT,
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

    # YouTube now returns serverAbrStreamingUrl instead of per-format CDN URLs
    # for ANDROID clients — adaptiveFormats exist but none have a `url` field.
    # Treat this as a fast-fail so callers skip straight to yt-dlp.
    fmts = data.get("streamingData", {}).get("adaptiveFormats", [])
    if fmts and not any("url" in f for f in fmts):
        return True, "ABR-only response (no per-format CDN URLs — serverAbrStreamingUrl mode)"

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


def _pick_best_stream_high(data: dict, min_height: int = 1080) -> str | None:
    """
    Pick the HIGHEST quality non-AV1 stream from InnerTube response,
    targeting at least min_height. Codec preference: H.264 → VP9 → any non-AV1.

    Used for gameplay downloads where we want the best possible quality
    (4K or 1440p or 1080p) rather than capping at a target.
    Tries streams >= min_height first, falls back to the best available.
    """
    sd = data.get("streamingData", {})
    formats = sd.get("formats", []) + sd.get("adaptiveFormats", [])
    video_streams = sorted(
        [f for f in formats if f.get("mimeType", "").startswith("video/") and "url" in f],
        key=lambda f: (f.get("height", 0), "avc1" in f.get("mimeType", ""), "vp9" in f.get("mimeType", "")),
        reverse=True,
    )
    if not video_streams:
        return None

    def _not_av1(f: dict) -> bool:
        return "av01" not in f.get("mimeType", "")

    def _is_h264(f: dict) -> bool:
        return "avc1" in f.get("mimeType", "")

    def _is_vp9(f: dict) -> bool:
        return "vp9" in f.get("mimeType", "")

    # First: try at or above min_height, prefer H.264 → VP9 → any non-AV1
    high_res = [s for s in video_streams if s.get("height", 0) >= min_height and _not_av1(s)]
    for pred in (_is_h264, _is_vp9, _not_av1):
        candidates = [s for s in high_res if pred(s)]
        if candidates:
            return candidates[0]["url"]

    # Fallback: best available non-AV1 regardless of height
    non_av1 = [s for s in video_streams if _not_av1(s)]
    if non_av1:
        return non_av1[0]["url"]

    return video_streams[0]["url"] if video_streams else None


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


def _ytdlp_result_has_embedded_audio(info: dict | None) -> bool:
    """
    True when yt-dlp picked a SINGLE muxed format (no requested_formats
    bestvideo+bestaudio combo) that already carries its own audio track —
    e.g. _fmt()'s tier-4 `best[height<=h]` fallback landing on a genuinely
    progressive format. False (not just "unknown") means the picked video
    format is video-only and a separate audio URL still needs resolving.
    """
    if not info or info.get("requested_formats"):
        return False
    return info.get("acodec", "none") not in ("none", None)


# ── Method 1: InnerTube ANDROID + proxy-cheap ─────────────────

async def _innertube_android_stream(
    video_id: str, target_height: int, session_id: str | None = None, proxy_override: str | None = None
) -> str:
    proxy = proxy_override or get_proxycheap_proxy(purpose="stream-innertube")
    data = await call_player_api(video_id, client_name="ANDROID", send_params=True, proxy_url=proxy)

    blocked, reason = _innertube_is_blocked(data)
    if blocked:
        raise RuntimeError(f"InnerTube ANDROID blocked — {reason}")

    url = _pick_best_stream(data, target_height)
    if not url:
        raise RuntimeError("InnerTube ANDROID: no video stream URL in response")

    logger.info(f"[{video_id}] stream ← InnerTube ANDROID (proxy={bool(proxy)})")
    return url


# ── Methods 2-5: yt-dlp variants via proxy-cheap ─────────────

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
    proxy_override: str | None = None,
) -> str:
    import yt_dlp

    proxy = proxy_override or get_proxycheap_proxy(purpose=f"stream-ytdlp-{label}")
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

    protocol=https is REQUIRED on every tier — as of late 2026 YouTube's
    tv_embedded client returns BOTH direct fMP4 URLs (protocol=https, with
    an MP4 sidx box the DASH downloader parses for byte-range slicing) AND
    m3u8_native HLS manifests for the SAME height/codec pair. yt-dlp's
    format ranker often picks the HLS variant when both are available, and
    downloader.py's `_probe_full_sidx` then fails with "sidx box not found"
    because HLS playlists carry no MP4 boxes at all. Restricting to
    protocol=https forces the direct fMP4 variant, which is what the
    downstream DASH slicer needs.

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
        f"bestvideo[height<={height}][ext=mp4][vcodec!^=av01][protocol=https]+bestaudio[ext=m4a][protocol=https]"
        f"/bestvideo[height<={height}][vcodec!^=av01][protocol=https]+bestaudio[ext=m4a][protocol=https]"
        f"/bestvideo[height<={height}][vcodec!^=av01][protocol=https]+bestaudio[protocol=https]"
        f"/best[height<={height}][vcodec!^=av01][protocol=https]"
    )


def _fmt_unconstrained() -> str:
    """
    Most permissive format selector - no height or extension constraints.
    Used as final fallback when all else fails.

    Still pins protocol=https on the preferred tiers so the DASH downloader
    can slice a sidx (HLS variants have no sidx box) — see _fmt() docstring.
    The trailing `/best` stays unconstrained as the true last resort so we
    never fail to return SOME URL.
    """
    return "bestvideo[vcodec!^=av01][protocol=https]+bestaudio[protocol=https]/bestvideo[vcodec!^=av01]+bestaudio/best"


def _fmt_relaxed(height: int) -> str:
    """
    Relaxed format selector - no extension constraint.
    Used as an additional fallback when strict mp4 selector fails.

    protocol=https on the leading tiers so the DASH downloader gets a
    direct fMP4 URL (with sidx) instead of an HLS manifest — see _fmt()
    docstring. The trailing bare `/best` intentionally has no protocol
    constraint so this tier can still accept HLS as a genuine last resort
    for a given client.
    """
    return (
        f"bestvideo[height<={height}][vcodec!^=av01][protocol=https]+bestaudio[protocol=https]"
        f"/best[height<={height}][vcodec!^=av01][protocol=https]"
        f"/bestvideo[vcodec!^=av01][protocol=https]+bestaudio[protocol=https]"
        f"/best"
    )


def _fmt_high_quality(min_height: int = 1080, max_height: int | None = None) -> str:
    """
    High-quality format selector for gameplay downloads.

    When max_height is set (e.g. max_height=1080), pins to an exact resolution
    tier — useful when the output canvas is fixed (e.g. 1080×1920) and downloading
    a higher-res stream (1440p/4K) would just waste bandwidth with no quality gain.

    When max_height is None, grabs the BEST possible resolution ≥ min_height.
    AV1 is excluded at every tier (Cloud Run has no HW AV1 decoder).
    """
    if max_height is not None:
        # Exact-tier selector: height must be >= min AND <= max
        h_filter = f"[height>={min_height}][height<={max_height}]"
        h_filter_best = f"[height<={max_height}]"
    else:
        h_filter = f"[height>={min_height}]"
        h_filter_best = ""

    # protocol=https on every tier — YouTube now returns both direct fMP4
    # AND m3u8_native HLS variants for the same height/codec on tv_embedded,
    # and yt-dlp often picks HLS. HLS has no MP4 sidx box, so downloader.py
    # can't byte-range-slice it. See _fmt() docstring for the full story.
    return (
        # Tier 1: exact tier, strict mp4+m4a (best for DASH byte-range slicing)
        f"bestvideo{h_filter}[ext=mp4][vcodec!^=av01][protocol=https]+bestaudio[ext=m4a][protocol=https]"
        # Tier 2: same but any container
        f"/bestvideo{h_filter}[vcodec!^=av01][protocol=https]+bestaudio[ext=m4a][protocol=https]"
        # Tier 3: any audio container
        f"/bestvideo{h_filter}[vcodec!^=av01][protocol=https]+bestaudio[protocol=https]"
        # Tier 4: single-stream progressive
        f"/best{h_filter}[vcodec!^=av01][protocol=https]"
        # Tier 5: best available non-AV1 within max cap (or uncapped)
        f"/bestvideo{h_filter_best}[vcodec!^=av01][protocol=https]+bestaudio[ext=m4a][protocol=https]"
        f"/bestvideo{h_filter_best}[vcodec!^=av01][protocol=https]+bestaudio[protocol=https]"
        f"/best[vcodec!^=av01][protocol=https]"
    )


# ── Fallback chain ─────────────────────────────────────────────

async def _resolve_stream_url(
    video_id: str, quality: str, session_id: str | None = None, proxy_override: str | None = None
) -> tuple[str, str]:
    h = int(quality.rstrip("p"))

    chain: list[tuple[str, object]] = [
        # 1. InnerTube ANDROID + proxy  (~2-10s, highest priority)
        ("InnerTube ANDROID+proxy", lambda: _innertube_android_stream(video_id, h, session_id, proxy_override)),
        # 2-5. yt-dlp + tv_embedded/android_music/android/ios client + proxy
        # — all using _fmt(h) (AV1-excluded), NOT a bare "best" selector.
        # "best" has no codec filter at all, so for any video where the
        # chosen client's best-at-this-height format happens to be AV1,
        # these tiers would silently hand back an AV1 stream and the LATER
        # InnerTube clients (which DO avoid AV1, see _pick_best_stream)
        # would never get a chance to find a clean one. AV1-permissive
        # selectors stay reserved for the explicit last-resort tiers below (7).
        ("yt-dlp+tv_embedded+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="tv_embedded", label="yt-dlp+tv_embedded", session_id=session_id,
            proxy_override=proxy_override,
        )),
        # android_music / android_creator added 2026-08 as extra yt-dlp
        # tiers alongside tv_embedded — YouTube tightened bot detection hard
        # enough that InnerTube ANDROID/TV/IOS (below) fail every request in
        # production (LOGIN_REQUIRED / status=ERROR / HTTP 500), leaving
        # tv_embedded as the only method that actually worked; a
        # single-method chain meant any tv_embedded hiccup took the whole
        # job down. Both verified independently (2026-08-28) to still return
        # direct fMP4 (sidx-parseable) 1080p URLs that download cleanly
        # through both proxy-cheap and Proxy-Seller. See get_stream_urls
        # docstring for the full picture.
        ("yt-dlp+android_music+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android_music", label="yt-dlp+android_music", session_id=session_id,
            proxy_override=proxy_override,
        )),
        ("yt-dlp+android_creator+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android_creator", label="yt-dlp+android_creator", session_id=session_id,
            proxy_override=proxy_override,
        )),
        ("yt-dlp+android+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="android", label="yt-dlp+android", session_id=session_id,
            proxy_override=proxy_override,
        )),
        ("yt-dlp+ios+proxy", lambda: _ytdlp_stream(
            video_id, _fmt(h), client="ios", label="yt-dlp+ios", session_id=session_id,
            proxy_override=proxy_override,
        )),
        # yt-dlp + android client + relaxed format (no ext=mp4 constraint).
        # Tries non-AV1 variants first, same as the tiers above, but its own
        # trailing bare `/best` means THIS tier can accept AV1 if none of
        # those variants match for this client — intentional, one tier
        # earlier than the universal last-resort below, not a regression
        # of the original bug (the strict, AV1-free attempts already ran first).
        ("yt-dlp+android-constrained+proxy", lambda: _ytdlp_stream(
            video_id, _fmt_relaxed(h), client="android", label="yt-dlp+android-constrained", session_id=session_id,
            proxy_override=proxy_override,
        )),
        # yt-dlp unconstrained (any client, any format) — explicit final
        # last resort, AV1 permitted here ONLY (see _fmt_unconstrained docstring).
        ("yt-dlp+unconstrained+proxy", lambda: _ytdlp_stream(
            video_id, _fmt_unconstrained(), label="yt-dlp+unconstrained", session_id=session_id,
            proxy_override=proxy_override,
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

async def get_stream_url(
    video_id: str, quality: str = "1080p", session_id: str | None = None, proxy_override: str | None = None
) -> tuple[str, str]:
    """Returns (video_url, user_agent). user_agent is the UA the URL must be downloaded with.

    proxy_override: when set, skip cache reads (a cached URL may be IP-bound
    to a DIFFERENT proxy's exit IP than the one the caller needs — see
    get_stream_urls' proxy_override docstring) and force every resolution
    attempt through this exact proxy instead of proxy-cheap.
    """
    if not proxy_override:
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
    url, user_agent = await _resolve_stream_url(video_id, quality, session_id, proxy_override)

    # 4. Cache appropriately
    if url_is_ip_bound(url):
        if session_id:
            job_cache_key = f"{video_id}:{quality}:{session_id}"
            await _maybe_cache(job_cache_key, url)
    else:
        await _maybe_cache(f"{video_id}:{quality}", url)

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
    proxy-cheap. Used by the FFmpeg stage to resolve URLs through the SAME IP
    that will download them (Proxy-Seller ISP), avoiding IP-bound signature
    mismatches.

    Tries yt-dlp (tv_embedded, then android_music, then android_creator —
    all with audio) FIRST — in production all three InnerTube clients
    (ANDROID/TV/IOS) were consistently getting blocked or rejected before
    ever reaching yt-dlp, so every job paid for 3 guaranteed failures (~8s)
    before landing on the one path that actually works. android_music and
    android_creator were added as extra yt-dlp tiers (2026-08) after
    YouTube tightened bot detection on the InnerTube ANDROID/TV/IOS
    endpoints hard enough that all three fail every request (LOGIN_REQUIRED
    / status=ERROR / HTTP 500) — without a second/third yt-dlp fallback, ANY
    tv_embedded hiccup took down the whole job with no real fallback left
    (InnerTube TV/IOS were dead weight). If all three yt-dlp tiers fail,
    falls back to InnerTube ANDROID → TV → IOS anyway (cheap, ~10s total,
    and may recover if YouTube's InnerTube-side block lifts), then finally
    to the video-only chain (get_stream_url) as a last resort.
    """
    h = int(quality.rstrip("p"))
    loop = asyncio.get_running_loop()

    # ── 1-3. yt-dlp + tv_embedded, android_music, android_creator — all
    # with audio, tried in order (see docstring for why these tiers exist) ──
    for client, label in (
        ("tv_embedded", "yt-dlp tv_embedded"),
        ("android_music", "yt-dlp android_music"),
        ("android_creator", "yt-dlp android_creator"),
    ):
        proxy = proxy_override or get_proxycheap_proxy(purpose=f"stream-ytdlp-{client}")
        opts = _ytdlp_base_opts(proxy)
        opts["format"] = _fmt(h)
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
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
                if not audio_url and not _ytdlp_result_has_embedded_audio(info):
                    # This client matched a video-only format (no bestaudio
                    # pair, no embedded audio either) — don't ship this clip
                    # silently muted just because THIS proxy IP's format
                    # list lacked a combo; make one explicit attempt at the
                    # dedicated audio resolver.
                    audio_url = await _backfill_missing_audio(video_id, session_id, proxy_override)
                logger.info(
                    f"[{video_id}] stream+audio ← {label} "
                    f"(audio={'separate' if audio_url else 'none'})"
                )
                return video_url, audio_url, _WEB_USER_AGENT
            logger.warning(f"[{video_id}] {label} returned no video URL; trying next method")
        except Exception as ytdlp_exc:
            logger.warning(f"[{video_id}] {label} failed ({ytdlp_exc}); trying next method")

    # ── 4. InnerTube ANDROID → TV → IOS — video+audio resolved in ONE
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
            proxy = proxy_override or get_proxycheap_proxy(purpose=f"stream-innertube-{client_name}")
            data = await call_player_api(video_id, client_name=client_name, send_params=send_params, proxy_url=proxy)

            blocked, reason = _innertube_is_blocked(data)
            if blocked:
                raise RuntimeError(f"InnerTube {client_name} blocked — {reason}")

            video_url = _pick_best_stream(data, h)
            if not video_url:
                raise RuntimeError(f"InnerTube {client_name}: no video stream URL in response")

            video_fmt = _find_format_by_url(data, video_url)
            has_embedded_audio = bool(video_fmt and _format_has_audio(video_fmt))
            audio_url = None if has_embedded_audio else _pick_best_audio_stream(data)
            if not has_embedded_audio and not audio_url:
                # This client's response had no separate audio stream either
                # — same fresh-IP-dependent gap as the yt-dlp path above.
                audio_url = await _backfill_missing_audio(video_id, session_id, proxy_override)

            logger.info(
                f"[{video_id}] stream+audio ← InnerTube {client_name} (proxy={bool(proxy)}, "
                f"audio={'separate' if audio_url else 'embedded/none' if has_embedded_audio else 'none'})"
            )
            return video_url, audio_url, user_agent
        except Exception as exc:
            logger.warning(f"[{video_id}] get_stream_urls InnerTube {client_name} failed ({exc}); trying next client")
            last_exc = exc

    # ── 5. All else failed — video-only chain as the final fallback ────
    # get_stream_url()'s own internal chain only ever returns (url, user_agent)
    # — even when one of its yt-dlp attempts happened to also resolve audio,
    # that info is discarded. Rather than silently ship video-only clips,
    # make ONE more explicit attempt at a separate audio stream via the
    # dedicated audio resolver below before giving up on audio entirely.
    logger.warning(f"[{video_id}] yt-dlp (tv_embedded, android_music, android_creator) + all InnerTube clients failed ({last_exc}); falling back to video-only chain")
    video_url, user_agent = await get_stream_url(video_id, quality, session_id, proxy_override)

    audio_url = await _backfill_missing_audio(video_id, session_id, proxy_override)
    if audio_url:
        logger.info(f"[{video_id}] Video-only fallback still recovered a separate audio stream")

    return video_url, audio_url, user_agent


async def _backfill_missing_audio(
    video_id: str, session_id: str | None, proxy_override: str | None
) -> str | None:
    """
    Last-chance explicit audio resolve for a step that found video but no
    paired audio. Returns None (never raises) so callers can ship
    video-only rather than fail the whole job over a missing audio track.
    """
    try:
        return await get_audio_stream_url(video_id, session_id, proxy_override=proxy_override)
    except Exception as audio_exc:
        logger.warning(f"[{video_id}] Audio backfill failed ({audio_exc}) — proceeding video-only")
        return None


async def get_stream_urls_high_quality(
    video_id: str,
    min_height: int = 1080,
    max_height: int | None = None,
    session_id: str | None = None,
    proxy_override: str | None = None,
) -> tuple[str, str | None, str]:
    """
    Like get_stream_urls but targets the best quality in [min_height, max_height].

    When max_height is None: grabs the highest available >= min_height (4K/1440p/1080p).
    When max_height == min_height: pins to an exact tier (e.g. exactly 1080p).
    Used for gameplay downloads — output canvas is 1080x1920 so pinning to 1080p
    avoids wasting bandwidth downloading a 1440p stream that gets downscaled anyway.

    AV1 is excluded at every tier (Cloud Run has no HW AV1 decoder).
    """
    cap = max_height or min_height
    logger.info(f"[{video_id}] resolving HQ stream (min={min_height}p, max={max_height or 'uncapped'}p)")

    # ── 1. yt-dlp + tv_embedded with _fmt_high_quality selector ─────────
    proxy = proxy_override or get_proxycheap_proxy(purpose="stream-ytdlp-hq")
    opts = _ytdlp_base_opts(proxy)
    opts["format"] = _fmt_high_quality(min_height, max_height)
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
            # Log the actual selected height for visibility
            sel_h = next(
                (f.get("height") for f in (info.get("requested_formats") or []) if f.get("vcodec", "none") != "none"),
                "?"
            )
            logger.info(
                f"[{video_id}] HQ stream ← yt-dlp tv_embedded height={sel_h} "
                f"(audio={'separate' if audio_url else 'embedded/none'})"
            )
            return video_url, audio_url, _WEB_USER_AGENT
        logger.warning(f"[{video_id}] HQ yt-dlp tv_embedded returned no video URL; trying InnerTube")
    except Exception as ytdlp_exc:
        logger.warning(f"[{video_id}] HQ yt-dlp tv_embedded failed ({ytdlp_exc}); trying InnerTube")

    # ── 2. yt-dlp + android client (different player, same HQ selector) ─
    proxy = proxy_override or get_proxycheap_proxy(purpose="stream-ytdlp-hq-android")
    opts2 = _ytdlp_base_opts(proxy)
    opts2["format"] = _fmt_high_quality(min_height, max_height)
    opts2["extractor_args"] = {"youtube": {"player_client": ["android"]}}
    try:
        info2 = await loop.run_in_executor(
            _YTDLP_POOL,
            _ytdlp_run_sync,
            opts2,
            f"https://www.youtube.com/watch?v={video_id}",
        )
        video_url = _pick_stream_ytdlp(info2)
        if video_url:
            audio_url = _pick_audio_ytdlp(info2)
            logger.info(f"[{video_id}] HQ stream ← yt-dlp android (audio={'separate' if audio_url else 'embedded/none'})")
            return video_url, audio_url, _ANDROID_HEADERS["User-Agent"]
    except Exception as ytdlp2_exc:
        logger.warning(f"[{video_id}] HQ yt-dlp android failed ({ytdlp2_exc}); trying InnerTube ANDROID")

    # ── 3. InnerTube ANDROID → TV → IOS with _pick_best_stream_high ─────
    _clients = [
        ("ANDROID", True,  _ANDROID_HEADERS["User-Agent"]),
        ("TV",      False, CLIENTS["TV"]["headers"]["User-Agent"]),
        ("IOS",     False, CLIENTS["IOS"]["headers"]["User-Agent"]),
    ]
    last_exc: Exception | None = None
    for client_name, send_params, user_agent in _clients:
        try:
            proxy = proxy_override or get_proxycheap_proxy(purpose=f"stream-innertube-hq-{client_name}")
            data = await call_player_api(video_id, client_name=client_name, send_params=send_params, proxy_url=proxy)

            blocked, reason = _innertube_is_blocked(data)
            if blocked:
                raise RuntimeError(f"InnerTube {client_name} blocked — {reason}")

            # If max_height is pinned (e.g. =1080), use capped picker; otherwise grab highest
            if max_height is not None:
                video_url = _pick_best_stream(data, max_height)
            else:
                video_url = _pick_best_stream_high(data, min_height)
            if not video_url:
                raise RuntimeError(f"InnerTube {client_name}: no video stream URL in response")

            video_fmt = _find_format_by_url(data, video_url)
            audio_url = None if (video_fmt and _format_has_audio(video_fmt)) else _pick_best_audio_stream(data)

            logger.info(
                f"[{video_id}] HQ stream ← InnerTube {client_name} (proxy={bool(proxy)}, "
                f"audio={'separate' if audio_url else 'embedded/none'})"
            )
            return video_url, audio_url, user_agent
        except Exception as exc:
            logger.warning(f"[{video_id}] HQ InnerTube {client_name} failed ({exc}); trying next")
            last_exc = exc

    # ── 4. Final fallback: standard get_stream_urls at min_height cap ────
    logger.warning(f"[{video_id}] All HQ methods failed ({last_exc}); falling back to standard {min_height}p stream")
    return await get_stream_urls(video_id, f"{min_height}p", session_id, proxy_override)



async def get_audio_stream_url(
    video_id: str,
    session_id: str | None = None,
    proxy_override: str | None = None,
) -> str:
    """Audio-only stream URL — used by testing.py Lab, and as get_stream_urls's
    last-resort audio attempt when its own video+audio resolution chain is
    fully exhausted (see step 3 above).

    proxy_override: when set, use this proxy for every attempt instead of a
    fresh proxy-cheap IP per client — keeps this call consistent with
    whatever proxy resolved the paired video URL (see get_stream_urls'
    proxy_override docstring for why that matters for IP-bound CDN URLs).
    """
    # 1. Look up job-specific cache first
    if session_id:
        job_cache_key = f"{video_id}:audio:{session_id}"
        cached = await _maybe_get_cached(job_cache_key)
        if cached:
            logger.info(f"[{video_id}] audio stream ← job-specific cache ({session_id})")
            return cached

    # 2. Look up global cache
    global_cache_key = f"{video_id}:audio"
    cached = await _maybe_get_cached(global_cache_key)
    if cached:
        if not url_is_ip_bound(cached):
            logger.info(f"[{video_id}] audio stream ← global cache (non-IP-bound)")
            return cached
        else:
            logger.info(f"[{video_id}] ignoring global audio cache: URL is IP-bound")

    # 3. Resolve — fresh IP per client attempt (unless proxy_override pins one)
    for client_name in ["ANDROID", "TV", "IOS"]:
        try:
            proxy = proxy_override or get_proxycheap_proxy(purpose=f"stream-audio-{client_name}")
            data = await call_player_api(video_id, client_name=client_name, send_params=True, proxy_url=proxy)
            url = _pick_best_audio_stream(data)
            if url:
                # 4. Cache appropriately
                if url_is_ip_bound(url):
                    if session_id:
                        job_cache_key = f"{video_id}:audio:{session_id}"
                        await _maybe_cache(job_cache_key, url)
                else:
                    await _maybe_cache(global_cache_key, url)
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

    # ── 2. InnerTube ANDROID — with proxy (Cloud Run IPs are blocked without one) ──
    proxy_url = get_proxycheap_proxy(purpose="stream-metadata")
    try:
        data = await call_player_api(video_id, client_name="ANDROID", proxy_url=proxy_url)
        details = data.get("videoDetails", {})
        if details:
            logger.info(f"[{video_id}] Metadata duration resolved via InnerTube (proxy={'yes' if proxy_url else 'no'})")
            return {
                "title":     details.get("title", "")     or (oembed_meta or {}).get("title", ""),
                "channel":   details.get("author", "")    or (oembed_meta or {}).get("channel", ""),
                "thumbnail": _best_thumbnail(details, video_id),
                "duration":  int(details.get("lengthSeconds", 0)),
                "video_id":  video_id,
            }
    except Exception as e:
        logger.warning(f"[{video_id}] InnerTube ANDROID metadata failed (proxy={'yes' if proxy_url else 'no'}): {e}")

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
