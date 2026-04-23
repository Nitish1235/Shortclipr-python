"""
transcript.py — Step 2 of the ShortClipr pipeline.

Fetches captions directly via InnerTube API.
Handles auto-generated captions in ANY language.
Whisper fallback is only used if NO captions exist.
"""

import asyncio
import json
import logging
import re
import tempfile
import xml.etree.ElementTree as ET
from collections.abc import AsyncGenerator
from pathlib import Path

import httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.pipeline.stream import call_player_api

logger = logging.getLogger(__name__)
settings = get_settings()
openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ── Data types ─────────────────────────────────────────────────

TranscriptEntry = dict  # {"text": str, "start": float, "duration": float}


# ── Primary path ───────────────────────────────────────────────

async def get_transcript(video_id: str, language: str = "en") -> tuple[list[TranscriptEntry], bool]:
    """Returns (transcript_entries, used_whisper_fallback)."""
    try:
        entries = await _fetch_innertube_captions(video_id, language)
        if entries:
            logger.info(f"[{video_id}] InnerTube captions fetched: {len(entries)} entries")
            return entries, False
        else:
            raise ValueError("No caption tracks found")

    except Exception as e:
        logger.warning(f"[{video_id}] No captions via InnerTube: {e}. Falling back to Whisper.")
        entries = await _whisper_fallback_transcript(video_id)
        return entries, True


# ── InnerTube caption fetching ─────────────────────────────────

async def _fetch_innertube_captions(video_id: str, language: str = "en") -> list[TranscriptEntry]:
    """Fetch captions using the verified InnerTube client registry."""
    lang_map = {
        "English": "en",
        "Spanish": "es",
        "French": "fr",
        "German": "de",
        "Hindi": "hi",
    }
    preferred_lang = lang_map.get(language)

    player_data = None
    # Try Golden Identities: ANDROID_VR first, then TV, then IOS
    for label in ["ANDROID_VR", "TV", "IOS", "MWEB"]:
        try:
            data = await call_player_api(video_id, label)
            captions = data.get("captions", {})
            if captions:
                player_data = data
                logger.info(f"[{video_id}] Caption data via {label}")
                break
        except Exception as e:
            logger.warning(f"[{video_id}] Caption {label} client failed: {e}")

    if not player_data:
        raise RuntimeError("No caption data from any InnerTube client")

    tracks = (
        player_data.get("captions", {})
        .get("playerCaptionsTracklistRenderer", {})
        .get("captionTracks", [])
    )

    if not tracks:
        raise RuntimeError("Video has no caption tracks")

    # Pick the best track
    chosen = None
    if preferred_lang:
        for t in tracks:
            if t.get("languageCode", "").startswith(preferred_lang):
                chosen = t
                break
    if not chosen:
        for t in tracks:
            if t.get("languageCode", "").startswith("en"):
                chosen = t
                break
    if not chosen:
        for t in tracks:
            if t.get("kind") == "asr":
                chosen = t
                break
    if not chosen:
        chosen = tracks[0]

    logger.info(f"[{video_id}] Using caption track: {chosen.get('languageCode')} (kind={chosen.get('kind', 'manual')})")

    caption_url = chosen.get("baseUrl", "")
    if not caption_url:
        raise RuntimeError("Caption track has no baseUrl")

    return await _parse_caption_url(caption_url, video_id)


async def _parse_caption_url(url: str, video_id: str) -> list[TranscriptEntry]:
    """Download and parse YouTube timed text XML/JSON."""
    json_url = url + "&fmt=json3" if "?" in url else url + "?fmt=json3"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(json_url)

    if resp.status_code == 200:
        try:
            data = resp.json()
            events = data.get("events", [])
            entries = []
            for event in events:
                segs = event.get("segs")
                if not segs: continue
                text = "".join(s.get("utf8", "") for s in segs).strip()
                if not text or text == "\n": continue
                start_ms = event.get("tStartMs", 0)
                duration_ms = event.get("dDurationMs", 2000)
                entries.append({
                    "text": text,
                    "start": start_ms / 1000.0,
                    "duration": duration_ms / 1000.0,
                })
            if entries: return entries
        except Exception:
            pass

    # Fallback to XML
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    return _parse_caption_xml(resp.text, video_id)


def _parse_caption_xml(xml_text: str, video_id: str) -> list[TranscriptEntry]:
    entries = []
    try:
        root = ET.fromstring(xml_text)
        for text_el in root.iter("text"):
            raw = text_el.text or ""
            raw = (raw.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                   .replace("&quot;", '"').replace("&#39;", "'").replace("\n", " "))
            raw = re.sub(r"<[^>]+>", "", raw).strip()
            if not raw: continue
            start = float(text_el.get("start", 0))
            dur = float(text_el.get("dur", 2.0))
            entries.append({"text": raw, "start": start, "duration": dur})
    except Exception as e:
        logger.error(f"[{video_id}] Caption XML parse error: {e}")
    return entries


# ── Whisper fallback (streaming) ───────────────────────────────

async def _whisper_fallback_transcript(video_id: str) -> list[TranscriptEntry]:
    from app.pipeline.stream import get_audio_stream_url
    audio_url = await get_audio_stream_url(video_id)
    entries: list[TranscriptEntry] = []
    async for chunk_entries in _transcribe_audio_streaming(audio_url, video_id):
        entries.extend(chunk_entries)
    return entries


async def _transcribe_audio_streaming(audio_url: str, video_id: str, chunk_seconds: int = 30) -> AsyncGenerator[list[TranscriptEntry], None]:
    with tempfile.TemporaryDirectory(prefix="sc_whisper_") as tmpdir:
        tmp = Path(tmpdir)
        duration = await _get_audio_duration(audio_url)
        windows = [(start, min(start + chunk_seconds, duration)) for start in range(0, int(duration), chunk_seconds)]
        semaphore = asyncio.Semaphore(4)
        async def process_chunk(idx: int, start: float, end: float) -> list[TranscriptEntry]:
            async with semaphore:
                chunk_path = tmp / f"chunk_{idx:04d}.mp3"
                await _extract_audio_chunk(audio_url, start, end, chunk_path)
                return await _whisper_transcribe_chunk(chunk_path, offset=start)
        tasks = [asyncio.create_task(process_chunk(i, s, e)) for i, (s, e) in enumerate(windows)]
        for task in tasks:
            result = await task
            yield result


async def _get_audio_duration(audio_url: str) -> float:
    proc = await asyncio.create_subprocess_exec("ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-i", audio_url, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    data = json.loads(stdout)
    return float(data["format"]["duration"])


async def _extract_audio_chunk(audio_url: str, start: float, end: float, output_path: Path) -> None:
    duration = end - start
    proc = await asyncio.create_subprocess_exec("ffmpeg", "-y", "-ss", str(start), "-t", str(duration), "-i", audio_url, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", str(output_path), stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await proc.wait()


async def _whisper_transcribe_chunk(chunk_path: Path, offset: float = 0.0) -> list[TranscriptEntry]:
    with open(chunk_path, "rb") as f:
        response = await openai.audio.transcriptions.create(model=settings.WHISPER_MODEL, file=f, response_format="verbose_json", timestamp_granularities=["segment"])
    entries = []
    for seg in response.segments:
        entries.append({"text": seg.text.strip(), "start": seg.start + offset, "duration": seg.end - seg.start})
    return entries


def format_transcript_for_llm(entries: list[TranscriptEntry]) -> str:
    lines = []
    for e in entries:
        start = e["start"]
        mm = int(start) // 60
        ss = int(start) % 60
        lines.append(f"{mm:02d}:{ss:02d} - {e['text'].strip()}")
    return "\n".join(lines)
