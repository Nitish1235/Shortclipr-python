"""
transcript.py — Step 2 of the ShortClipr pipeline.

Transcript extraction: 3-method fallback chain, all via proxy-cheap.

Priority order (proven entry counts → broadest compatibility):
  1. youtube-transcript-api v1.2.4 + proxy-cheap  (proven: 2389 entries, fastest)
  2. InnerTube ANDROID + proxy-cheap              (player + timedtext via SAME proxy)
  3. yt-dlp subtitle extraction + proxy-cheap

Fallback triggers on:
  - TranscriptsDisabled         → HARD STOP (no captions exist on this video)
  - VideoUnavailable            → HARD STOP (video gone/private)
  - NoTranscriptFound           → try next method
  - TooManyRequests             → try next method (proxy rotation helps)
  - YouTubeRequestFailed        → try next method
  - HTTP 4xx/5xx                → try next method
  - Empty result                → try next method
  - Any other exception         → try next method

InnerTube method note: the caption baseUrl contains an IP-tied auth token.
The timedtext fetch MUST use the same proxy as the player API call.

_fetch_innertube_captions is kept for backward compatibility with testing.py Lab.
"""

import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

_NOISE_RE = re.compile(
    r"\[.*?\]"          # [Music] [Applause] [Laughter] etc.
    r"|\(.*?\)"         # (laughs) (clapping) etc.
    r"|[*♪♫♬]"         # * emphasis markers, music notes
    r"|<[^>]+>"         # any leftover HTML/ASS tags
)

def _clean(text: str) -> str:
    """Remove transcript noise characters before display."""
    return _NOISE_RE.sub("", text).strip()

import httpx

from app.core.proxy import get_proxycheap_proxy
from app.pipeline.stream import call_player_api

logger = logging.getLogger(__name__)

TranscriptEntry = dict  # {"text": str, "start": float, "duration": float}

_TRANSCRIPT_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="transcript")

LANG_MAP = {
    # Frontend display names → ISO 639-1 codes
    "English":              "en",
    "Spanish":              "es",
    "French":               "fr",
    "German":               "de",
    "Hindi":                "hi",
    "Portuguese":           "pt",
    "Italian":              "it",
    "Japanese":             "ja",
    "Korean":               "ko",
    "Chinese":              "zh",
    # "Auto" variants → None, meaning "no language bias — use the video's
    # REAL spoken language." This used to map to "en", which was a bug:
    # requesting English explicitly can win over the video's actual
    # original-language track whenever a manually-uploaded (possibly
    # translated) English caption track also exists — e.g. a Hindi video
    # with a community-contributed English subtitle track would get that
    # translation burned in instead of the real Hindi transcript. `None`
    # tells every fetch method below to skip language bias entirely and
    # prefer the auto-generated (ASR) track, which YouTube transcribes
    # directly from the audio and never translates.
    "Auto":                 None,
    "Auto / No translation": None,
    "auto":                 None,
}

# ── Sentinel for hard "no captions" signal ─────────────────────

class _TranscriptsDisabledError(Exception):
    """Video has transcripts disabled — no point trying other methods."""


def _transcript_proxy_session(session_id: str | None) -> str | None:
    """
    Use the same session key as the stream fetch so transcript requests
    land on the same proxy port. The stream port is pre-validated as
    reachable by the time transcript fetching begins (they run concurrently
    in the orchestrator, but the stream's yt-dlp+tv_embedded path has already
    confirmed the port is not IP-blocked by YouTube). A separate `:transcript`
    suffix gave a DIFFERENT port that was more likely to be flagged.
    """
    return session_id


# ── Public API ─────────────────────────────────────────────────

async def get_transcript(video_id: str, language: str = "en", session_id: str | None = None) -> list[TranscriptEntry]:
    """
    Return transcript entries via 3-method proxy-backed fallback chain.
    Raises RuntimeError if all methods fail.

    lang_code resolves to None for "Auto" — every fetch method below treats
    None as "no language bias, prefer the video's real spoken-language
    (auto-generated) track" rather than defaulting to English.
    """
    lang_code = LANG_MAP.get(language, language)
    errors: list[str] = []

    # ── Method 1: youtube-transcript-api + proxy-cheap ────────
    try:
        entries = await _ytta_proxy(video_id, lang_code, session_id)
        if entries:
            logger.info(f"[{video_id}] transcript ← ytta+proxy ({len(entries)} entries)")
            return entries
        errors.append("ytta: empty result")
    except _TranscriptsDisabledError:
        raise RuntimeError(f"[{video_id}] Video has transcripts disabled — cannot extract captions")
    except _VideoUnavailableError as e:
        raise RuntimeError(f"[{video_id}] Video unavailable: {e}")
    except Exception as e:
        logger.warning(f"[{video_id}] ytta+proxy failed: {e}")
        errors.append(f"ytta: {e}")

    # ── Method 2: InnerTube ANDROID + proxy-cheap ─────────────
    # player + timedtext calls share the same proxy URL — critical because
    # the caption baseUrl contains an IP-bound auth token.
    try:
        entries = await _innertube_android_proxy(video_id, lang_code, session_id)
        if entries:
            logger.info(f"[{video_id}] transcript ← InnerTube ANDROID+proxy ({len(entries)} entries)")
            return entries
        errors.append("innertube: empty result")
    except Exception as e:
        logger.warning(f"[{video_id}] InnerTube ANDROID+proxy failed: {e}")
        errors.append(f"innertube: {e}")

    # ── Method 3: yt-dlp subtitle extraction + proxy-cheap ────
    try:
        entries = await _ytdlp_subs_proxy(video_id, lang_code, session_id)
        if entries:
            logger.info(f"[{video_id}] transcript ← yt-dlp subs+proxy ({len(entries)} entries)")
            return entries
        errors.append("ytdlp: empty result")
    except Exception as e:
        logger.warning(f"[{video_id}] yt-dlp subs+proxy failed: {e}")
        errors.append(f"ytdlp: {e}")

    raise RuntimeError(
        f"[{video_id}] All 3 transcript methods failed — {'; '.join(errors)}"
    )


async def get_transcript_with_retries(
    video_id: str,
    language: str = "en",
    session_id: str | None = None,
    max_retries: int = 2,
) -> list[TranscriptEntry]:
    """
    Resilient wrapper around get_transcript() for the main job pipeline.

    Retries the FULL 3-method fallback chain up to `max_retries` additional
    times (so up to 1 + max_retries attempts total) on transient failures —
    proxy blips, rate limits, etc. Skips remaining retries immediately once
    a video is confirmed to have transcripts disabled outright; that's a
    permanent state, retrying just burns time for the same result.

    Never raises: returns an empty list if every attempt is exhausted,
    letting the caller fall back to random (non-transcript-driven) clip
    selection (see ai_clipper.find_random_clips) instead of failing the
    whole job over one missing/broken transcript.
    """
    last_exc: Exception | None = None
    for attempt in range(1 + max_retries):
        try:
            return await get_transcript(video_id, language=language, session_id=session_id)
        except Exception as e:
            last_exc = e
            logger.warning(
                f"[{video_id}] Transcript fetch attempt {attempt + 1}/{1 + max_retries} failed: {e}"
            )
            if "transcripts disabled" in str(e).lower():
                logger.warning(f"[{video_id}] Transcripts disabled — skipping remaining retries")
                break
            if attempt < max_retries:
                await asyncio.sleep(2.0 * (attempt + 1))

    logger.error(
        f"[{video_id}] Transcript unavailable after retries ({last_exc}) — "
        f"proceeding without transcript (random clip selection)"
    )
    return []


# ── Method 1: youtube-transcript-api + proxy-cheap ────────────

class _VideoUnavailableError(Exception):
    pass


def _ytta_fetch_sync(
    video_id: str,
    lang_code: str | None,
    proxy_url: str | None,
) -> list[TranscriptEntry]:
    """Synchronous YTTA call — runs inside thread pool."""
    from youtube_transcript_api import YouTubeTranscriptApi

    # Import exceptions — available at top level in v1.2.4
    try:
        from youtube_transcript_api import (
            TranscriptsDisabled,
            VideoUnavailable,
            NoTranscriptFound,
            CouldNotRetrieveTranscript,
            YouTubeRequestFailed,
            IpBlocked,
            RequestBlocked,
        )
    except ImportError:
        # Older builds expose exceptions under _errors
        from youtube_transcript_api._errors import (  # type: ignore[no-redef]
            TranscriptsDisabled,
            VideoUnavailable,
            NoTranscriptFound,
            CouldNotRetrieveTranscript,
            YouTubeRequestFailed,
            IpBlocked,
            RequestBlocked,
        )

    try:
        # v1.2.4 takes a configured requests.Session via http_client= (there is
        # no proxies= kwarg on this version). Route the proxy through the session.
        import requests
        session = requests.Session()
        if proxy_url:
            session.proxies = {"http": proxy_url, "https": proxy_url}
        # Without an explicit timeout, requests will hang indefinitely (often
        # 2-3+ min) if the proxy connection is slow/unresponsive, blocking
        # the whole transcript fallback chain. Cap each request at 15s so a
        # bad proxy connection fails fast and falls through to method 2/3.
        _orig_request = session.request
        def _request_with_timeout(method, url, **kwargs):
            kwargs.setdefault("timeout", 15)
            return _orig_request(method, url, **kwargs)
        session.request = _request_with_timeout
        api = YouTubeTranscriptApi(http_client=session)

        def _pick_original_language_transcript(transcript_list):
            """Auto mode: prefer the auto-generated (ASR) track — YouTube
            transcribes that directly from the audio, so it's always the
            video's REAL spoken language, never a translation. A manually
            uploaded track can be a translation (e.g. a Hindi video with a
            community-contributed English subtitle) — those are only used
            as a last resort here, not preferred just for being English."""
            chosen = None
            for t in transcript_list:
                if t.is_generated:
                    chosen = t
                    break
            if chosen is None:
                for t in transcript_list:
                    chosen = t
                    break
            return chosen

        if lang_code is None:
            # Auto — skip language-biased fetch entirely, go straight to
            # "list available transcripts, prefer the real spoken-language
            # (auto-generated) one." Never asks for English specifically.
            transcript_list = api.list(video_id)
            chosen = _pick_original_language_transcript(transcript_list)
            if chosen is None:
                raise NoTranscriptFound(video_id, [], transcript_list)
            logger.info(
                f"[{video_id}] Auto language — using {chosen.language_code} "
                f"({'generated' if chosen.is_generated else 'manual'})"
            )
            fetched = chosen.fetch()
        else:
            # Preferred language, then English fallbacks, then auto-generated English
            lang_prefs = list(dict.fromkeys([lang_code, "en", "en-US", "en-GB", "a.en"]))
            try:
                fetched = api.fetch(video_id, languages=lang_prefs)
            except NoTranscriptFound:
                # Requested language not available — discover what IS available and
                # grab any transcript (preferring auto-generated for speed).
                # This handles videos with only Hindi, Japanese, etc. auto-captions.
                try:
                    transcript_list = api.list(video_id)
                    chosen = _pick_original_language_transcript(transcript_list)
                    if chosen is None:
                        raise NoTranscriptFound(video_id, lang_prefs, transcript_list)
                    logger.info(
                        f"[{video_id}] No {lang_prefs} transcript — falling back to "
                        f"{chosen.language_code} ({'generated' if chosen.is_generated else 'manual'})"
                    )
                    fetched = chosen.fetch()
                except Exception:
                    raise  # let outer handler catch it

        return [
            {"text": _clean(s.text), "start": s.start, "duration": s.duration}
            for s in fetched
            if _clean(s.text)
        ]

    except TranscriptsDisabled:
        raise _TranscriptsDisabledError("TranscriptsDisabled")
    except VideoUnavailable as e:
        raise _VideoUnavailableError(str(e))
    except (NoTranscriptFound, CouldNotRetrieveTranscript, YouTubeRequestFailed, IpBlocked, RequestBlocked) as e:
        raise RuntimeError(f"YTTA {type(e).__name__}: {e}")


async def _ytta_proxy(video_id: str, lang_code: str | None, session_id: str | None = None) -> list[TranscriptEntry]:
    proxy = get_proxycheap_proxy(purpose="transcript-ytta")
    loop = asyncio.get_running_loop()
    # _TranscriptsDisabledError and _VideoUnavailableError propagate naturally
    return await loop.run_in_executor(
        _TRANSCRIPT_POOL,
        _ytta_fetch_sync,
        video_id,
        lang_code,
        proxy,
    )


# ── Method 2: InnerTube ANDROID + proxy-cheap ─────────────────

async def _innertube_android_proxy(video_id: str, lang_code: str | None, session_id: str | None = None) -> list[TranscriptEntry]:
    """
    Fetch caption track list via InnerTube ANDROID player call, then download
    the timedtext URL — both via the SAME proxy-cheap rotating residential proxy.
    """
    proxy = get_proxycheap_proxy(purpose="transcript-innertube")
    data = await call_player_api(video_id, client_name="ANDROID", proxy_url=proxy)

    ps = data.get("playabilityStatus", {})
    status = ps.get("status", "OK")
    if status in {"LOGIN_REQUIRED", "SIGN_IN_REQUIRED", "AGE_CHECK_REQUIRED"}:
        raise RuntimeError(f"InnerTube blocked: playabilityStatus={status}")

    tracks = (
        data.get("captions", {})
        .get("playerCaptionsTracklistRenderer", {})
        .get("captionTracks", [])
    )
    if not tracks:
        raise RuntimeError(f"InnerTube ANDROID: no caption tracks (playability={status})")

    chosen = _pick_caption_track(tracks, lang_code)
    base_url = chosen.get("baseUrl", "")
    if not base_url:
        raise RuntimeError("Chosen caption track has no baseUrl")

    return await _fetch_timedtext(base_url, video_id, proxy_url=proxy)


def _pick_caption_track(tracks: list[dict], lang_code: str | None) -> dict:
    """Return best caption track for the requested language code.

    lang_code=None means Auto: skip language bias entirely and prefer the
    auto-generated (ASR) track — YouTube transcribes that directly from
    the audio, so it's always the video's REAL spoken language, never a
    translation. A manually uploaded track (which explicit-language
    fallback below WILL consider) can be a translation — e.g. a Hindi
    video with a community-contributed English subtitle track — so Auto
    deliberately does NOT fall back to "any English track" the way an
    explicit language request does.
    """
    if lang_code is None:
        for t in tracks:
            if t.get("kind") == "asr":
                return t
        return tracks[0]

    # 1. Requested language
    for t in tracks:
        if t.get("languageCode", "").startswith(lang_code):
            return t
    # 2. Any English track
    for t in tracks:
        if t.get("languageCode", "").startswith("en"):
            return t
    # 3. Auto-generated (ASR)
    for t in tracks:
        if t.get("kind") == "asr":
            return t
    return tracks[0]


async def _fetch_timedtext(
    base_url: str,
    video_id: str,
    proxy_url: str | None,
) -> list[TranscriptEntry]:
    """Download timedtext in JSON3 format (XML fallback) via proxy."""
    sep = "&" if "?" in base_url else "?"
    json_url = f"{base_url}{sep}fmt=json3"

    client_kwargs: dict = {"timeout": 15, "follow_redirects": True}
    if proxy_url:
        client_kwargs["proxy"] = proxy_url

    # Try JSON3 first — richer format with millisecond timestamps
    async with httpx.AsyncClient(**client_kwargs) as client:
        resp = await client.get(json_url)

    if resp.status_code == 200:
        try:
            events = resp.json().get("events", [])
            entries = []
            for ev in events:
                segs = ev.get("segs")
                if not segs:
                    continue
                text = _clean("".join(s.get("utf8", "") for s in segs))
                if not text or text == "\n":
                    continue
                entries.append({
                    "text": text,
                    "start": ev.get("tStartMs", 0) / 1000.0,
                    "duration": ev.get("dDurationMs", 2000) / 1000.0,
                })
            if entries:
                return entries
        except Exception:
            pass

    # XML fallback — older format, still supported
    async with httpx.AsyncClient(**client_kwargs) as client:
        resp = await client.get(base_url)
        resp.raise_for_status()
    return _parse_caption_xml(resp.text, video_id)


def _parse_caption_xml(xml_text: str, video_id: str) -> list[TranscriptEntry]:
    entries = []
    try:
        root = ET.fromstring(xml_text)
        for el in root.iter("text"):
            raw = el.text or ""
            raw = (raw
                   .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                   .replace("&quot;", '"').replace("&#39;", "'").replace("\n", " "))
            raw = _clean(re.sub(r"<[^>]+>", "", raw))
            if not raw:
                continue
            entries.append({
                "text": raw,
                "start": float(el.get("start", 0)),
                "duration": float(el.get("dur", 2.0)),
            })
    except Exception as e:
        logger.error(f"[{video_id}] Caption XML parse error: {e}")
    return entries


# ── Method 3: yt-dlp subtitle extraction + proxy-cheap ────────

def _ytdlp_subs_sync(
    video_id: str,
    lang_code: str | None,
    proxy_url: str | None,
) -> list[TranscriptEntry]:
    """yt-dlp subtitle fetch — sync, runs inside thread pool."""
    import yt_dlp

    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 25,
        # tv_embedded client bypasses YouTube bot-detection (same as stream URL fetch)
        "extractor_args": {"youtube": {"player_client": ["tv_embedded"]}},
    }
    if proxy_url:
        opts["proxy"] = proxy_url

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False,
        )

    if not info:
        raise RuntimeError("yt-dlp returned no info")

    subs = info.get("subtitles", {})
    auto = info.get("automatic_captions", {})

    sub_url: str | None = None

    if lang_code is None:
        # Auto — prefer automatic_captions (ASR, transcribed straight from
        # audio, always the real spoken language) over manual `subs`
        # (which CAN be a translation, e.g. a community-contributed English
        # track on a Hindi video). No English bias here at all.
        for source in (auto, subs):
            for lang_key, tracks in source.items():
                for track in tracks:
                    if track.get("ext") in ("json3", "vtt", "srv1"):
                        sub_url = track.get("url")
                        break
                if sub_url:
                    logger.info(f"[{video_id}] Auto language — using yt-dlp caption '{lang_key}'")
                    break
            if sub_url:
                break
    else:
        # Try manual captions first, then auto-generated
        # Priority: requested lang → English variants → any available lang
        preferred_langs = [lang_code, f"{lang_code}-orig", "en", "en-orig", "en-US"]
        for source in (subs, auto):
            for lang in preferred_langs:
                if lang in source:
                    for track in source[lang]:
                        if track.get("ext") in ("json3", "vtt", "srv1"):
                            sub_url = track.get("url")
                            break
                if sub_url:
                    break
            if sub_url:
                break

    # Last resort: grab ANY available language track
    if not sub_url:
        all_available = {**auto, **subs}  # auto first (prefer generated)
        for lang_key, tracks in all_available.items():
            for track in tracks:
                if track.get("ext") in ("json3", "vtt", "srv1"):
                    sub_url = track.get("url")
                    logger.info(f"[{video_id}] yt-dlp: no {lang_code}/en — falling back to '{lang_key}' caption track")
                    break
            if sub_url:
                break

    if not sub_url:
        available = list(subs.keys()) + list(auto.keys())
        raise RuntimeError(f"yt-dlp: no subtitle track found (available: {available[:10]})")

    # Fetch the subtitle URL through the same proxy
    sep = "&" if "?" in sub_url else "?"
    json_url = f"{sub_url}{sep}fmt=json3" if "fmt=" not in sub_url else sub_url

    with httpx.Client(proxy=proxy_url, timeout=15, follow_redirects=True) as client:
        resp = client.get(json_url)
        resp.raise_for_status()

    entries = []
    for ev in resp.json().get("events", []):
        text = _clean("".join(s.get("utf8", "") for s in ev.get("segs", [])))
        if text and text != "\n":
            entries.append({
                "text": text,
                "start": ev.get("tStartMs", 0) / 1000.0,
                "duration": ev.get("dDurationMs", 2000) / 1000.0,
            })
    return entries


async def _ytdlp_subs_proxy(video_id: str, lang_code: str | None, session_id: str | None = None) -> list[TranscriptEntry]:
    proxy = get_proxycheap_proxy(purpose="transcript-ytdlp")
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _TRANSCRIPT_POOL,
        _ytdlp_subs_sync,
        video_id,
        lang_code,
        proxy,
    )


# ── Backward-compat shim for testing.py Lab ───────────────────

async def _fetch_innertube_captions(
    video_id: str,
    language: str = "en",
) -> list[TranscriptEntry]:
    """Legacy shim — wraps method 2 (InnerTube ANDROID+proxy). Used by testing.py."""
    lang_code = LANG_MAP.get(language, language)
    return await _innertube_android_proxy(video_id, lang_code, session_id=None)


# ── LLM formatter ─────────────────────────────────────────────

def format_transcript_for_llm(entries: list[TranscriptEntry]) -> str:
    """
    Format transcript for GPT with sub-second precision.
    Format: MM:SS.d  (tenths of a second) so GPT can pick precise clip boundaries.
    Example: 12:34.7 - Hello world...
    """
    lines = []
    for e in entries:
        start   = e["start"]
        total_s = int(start)
        mm      = total_s // 60
        ss      = total_s % 60
        tenth   = int((start - total_s) * 10)
        lines.append(f"{mm:02d}:{ss:02d}.{tenth} - {e['text'].strip()}")
    return "\n".join(lines)
