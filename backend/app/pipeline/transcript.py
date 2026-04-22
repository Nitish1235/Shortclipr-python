"""
transcript.py — Step 2 of the ShortClipr pipeline.

Decision tree:
  1. Try youtube-transcript-api (fast, no auth, 0.2s)
  2. If no captions → stream audio via InnerTube → chunk into Whisper
     → yield partial transcript blocks as async generator
     → caller starts AI analysis early (after 5 min of transcript available)
"""

import asyncio
import logging
import re
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path

import httpx
from openai import AsyncOpenAI
from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ── Data types ─────────────────────────────────────────────────

TranscriptEntry = dict  # {"text": str, "start": float, "duration": float}


# ── Primary path ───────────────────────────────────────────────

async def get_transcript(video_id: str, language: str = "en") -> tuple[list[TranscriptEntry], bool]:
    """
    Returns (transcript_entries, used_whisper_fallback).

    Primary:  youtube-transcript-api — runs in thread pool (sync lib).
    Fallback: Whisper streaming via _whisper_fallback_transcript().
    """
    loop = asyncio.get_event_loop()
    try:
        entries = await loop.run_in_executor(
            None, _fetch_yt_transcript, video_id, language
        )
        logger.info(f"[{video_id}] Transcript found in {language}: {len(entries)} entries")
        return entries, False

    except (NoTranscriptFound, TranscriptsDisabled) as e:
        logger.warning(f"[{video_id}] No YouTube captions: {e}. Falling back to Whisper.")
        entries = await _whisper_fallback_transcript(video_id)
        return entries, True

    except Exception as e:
        logger.error(f"[{video_id}] Transcript fetch error: {e}. Trying Whisper.")
        entries = await _whisper_fallback_transcript(video_id)
        return entries, True


def _fetch_yt_transcript(video_id: str, language: str) -> list[TranscriptEntry]:
    """Sync call — run inside executor to avoid blocking the event loop."""
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    
    # Map friendly names to codes
    lang_map = {
        "English": "en",
        "Spanish": "es",
        "French": "fr",
        "German": "de",
    }
    target_code = lang_map.get(language, "en")
    
    # Try to find the specific language requested
    try:
        transcript = transcript_list.find_transcript([target_code])
    except Exception:
        # Fallback to English if requested fails, or just the first available
        try:
            transcript = transcript_list.find_transcript(["en"])
        except Exception:
            transcript = transcript_list.find_generated_transcript(["en", "es", "fr", "de"])

    return transcript.fetch()


# ── Whisper fallback (streaming) ───────────────────────────────

async def _whisper_fallback_transcript(video_id: str) -> list[TranscriptEntry]:
    """
    1. Get audio-only stream URL from InnerTube
    2. Download audio in 30-second chunks with FFmpeg
    3. Transcribe each chunk with Whisper in parallel
    4. Return merged transcript
    """
    from app.pipeline.stream import get_audio_stream_url  # avoid circular import

    audio_url = await get_audio_stream_url(video_id)
    entries: list[TranscriptEntry] = []

    async for chunk_entries in _transcribe_audio_streaming(audio_url, video_id):
        entries.extend(chunk_entries)

    return entries


async def _transcribe_audio_streaming(
    audio_url: str,
    video_id: str,
    chunk_seconds: int = 30,
) -> AsyncGenerator[list[TranscriptEntry], None]:
    """
    Stream audio URL → chunk into 30s segments → Whisper → yield partial transcript.

    KEY optimization: caller can subscribe to this generator and start
    sending partial transcript to GPT-4o as soon as enough is accumulated
    (see orchestrator.py for early-AI-start logic).
    """
    with tempfile.TemporaryDirectory(prefix="sc_whisper_") as tmpdir:
        tmp = Path(tmpdir)

        # Get total duration first (fast metadata call)
        duration = await _get_audio_duration(audio_url)
        logger.info(f"[{video_id}] Audio duration: {duration:.0f}s — splitting into {chunk_seconds}s chunks")

        # Build time windows
        windows = [
            (start, min(start + chunk_seconds, duration))
            for start in range(0, int(duration), chunk_seconds)
        ]

        # Process chunks with controlled concurrency (max 4 parallel Whisper calls)
        semaphore = asyncio.Semaphore(4)

        async def process_chunk(idx: int, start: float, end: float) -> list[TranscriptEntry]:
            async with semaphore:
                chunk_path = tmp / f"chunk_{idx:04d}.mp3"
                await _extract_audio_chunk(audio_url, start, end, chunk_path)
                return await _whisper_transcribe_chunk(chunk_path, offset=start)

        tasks = [
            asyncio.create_task(process_chunk(i, s, e))
            for i, (s, e) in enumerate(windows)
        ]

        # Yield results in ORDER as they arrive (preserve timeline)
        for task in tasks:
            result = await task
            yield result


async def _get_audio_duration(audio_url: str) -> float:
    """Use ffprobe to get duration without downloading the file."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-i", audio_url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    import json
    data = json.loads(stdout)
    return float(data["format"]["duration"])


async def _extract_audio_chunk(
    audio_url: str,
    start: float,
    end: float,
    output_path: Path,
) -> None:
    """Extract a specific time range of audio to an mp3 file."""
    duration = end - start
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-ss", str(start),
        "-t", str(duration),
        "-i", audio_url,
        "-vn",                    # no video
        "-ar", "16000",           # Whisper expects 16kHz
        "-ac", "1",               # mono
        "-c:a", "libmp3lame",
        "-q:a", "4",
        str(output_path),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()


async def _whisper_transcribe_chunk(
    chunk_path: Path,
    offset: float = 0.0,
) -> list[TranscriptEntry]:
    """
    Send a single audio chunk to OpenAI Whisper.
    Adjust timestamps by offset so they align with the original video timeline.
    """
    with open(chunk_path, "rb") as f:
        response = await openai.audio.transcriptions.create(
            model=settings.WHISPER_MODEL,
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    entries = []
    for seg in response.segments:
        entries.append({
            "text": seg.text.strip(),
            "start": seg.start + offset,
            "duration": seg.end - seg.start,
        })
    return entries


# ── Formatting ─────────────────────────────────────────────────

def format_transcript_for_llm(entries: list[TranscriptEntry]) -> str:
    """
    Format transcript for GPT-4o prompt:
    '00:42 - hey guys welcome back to the channel...'
    """
    lines = []
    for e in entries:
        start = e["start"]
        mm = int(start) // 60
        ss = int(start) % 60
        lines.append(f"{mm:02d}:{ss:02d} - {e['text'].strip()}")
    return "\n".join(lines)
