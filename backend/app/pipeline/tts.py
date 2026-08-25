"""
tts.py — Brainrot Clips Maker text-to-speech.

Two providers, selected per-job:
  unrealspeech — https://api.v8.unrealspeech.com/stream (sync, <=1000 chars/call)
  lemonfox     — https://api.lemonfox.ai/v1/audio/speech (OpenAI-compatible)

Both return raw audio bytes directly (no polling/async task needed) — dialogue
lines are short enough to stay well under either provider's per-call limit.

Duration is measured via ffprobe on the returned bytes rather than trusted
from provider metadata, since neither API guarantees a duration field in the
response — this keeps brainrot_stage.py's timeline math (real per-line audio
duration → caption/overlay timestamps) correct regardless of provider quirks.
"""
import asyncio
import logging
import tempfile
from pathlib import Path

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Same "no proxy" rule as ai_clipper.py's OpenAI client — these are TTS
# providers, not YouTube, and must not go through the Proxy-Seller ISP proxy.
# mounts={} (rather than the removed proxies= kwarg) explicitly disables any
# environment-variable-driven proxying for this client.
_http_client = httpx.AsyncClient(
    mounts={},
    timeout=httpx.Timeout(connect=10, read=30, write=10, pool=10),
)

UNREALSPEECH_STREAM_URL = "https://api.v8.unrealspeech.com/stream"
LEMONFOX_SPEECH_URL = "https://api.lemonfox.ai/v1/audio/speech"

# Every line, every clip, every provider — slower than the providers' own
# defaults reads as more natural/less rushed for brainrot's punchy short
# lines. Lemonfox's `speed` is a literal multiplier (OpenAI-compatible:
# 0.5-4.0, default 1.0), so 0.8 there is exact. UnrealSpeech's `Speed` is its
# own -1.0..1.0 scale with no published conversion formula — -0.2 is an
# approximation of ~0.8x based on their one documented example (Speed=-0.5 →
# ~1.5x duration, i.e. ~0.67x speed); listen and retune this constant if it
# sounds off in practice.
TTS_SPEED_MULTIPLIER = 0.8
_UNREALSPEECH_SPEED = -0.2

# Default voices per provider/locale. UnrealSpeech only ships US English
# voices (see voice_catalog.py) — en-GB requests fall back to en-US there.
DEFAULT_VOICES = {
    "unrealspeech": {"en-US": "Charlotte", "en-GB": "Charlotte"},
    "lemonfox":     {"en-US": "sarah",     "en-GB": "alice"},
}


class TTSError(RuntimeError):
    pass


async def synthesize(text: str, voice: str, provider: str, locale: str = "en-US") -> tuple[bytes, float]:
    """Synthesize one dialogue line. Returns (mp3_bytes, duration_seconds).

    voice: provider-specific voice id, or "" to use DEFAULT_VOICES[provider][locale].
    """
    voice = voice or DEFAULT_VOICES[provider].get(locale, DEFAULT_VOICES[provider]["en-US"])

    if provider == "unrealspeech":
        audio_bytes = await _unrealspeech(text, voice)
    elif provider == "lemonfox":
        audio_bytes = await _lemonfox(text, voice, locale)
    else:
        raise TTSError(f"Unknown TTS provider: {provider!r}")

    duration = await _probe_duration(audio_bytes)
    return audio_bytes, duration


async def _unrealspeech(text: str, voice_id: str) -> bytes:
    if not settings.UNREALSPEECH_API_KEY:
        raise TTSError("UNREALSPEECH_API_KEY is not set")
    if len(text) > 1000:
        raise TTSError(f"UnrealSpeech /stream is limited to 1000 chars, got {len(text)}")

    resp = await _http_client.post(
        UNREALSPEECH_STREAM_URL,
        headers={"Authorization": f"Bearer {settings.UNREALSPEECH_API_KEY}"},
        json={"Text": text, "VoiceId": voice_id, "Bitrate": "192k", "Speed": _UNREALSPEECH_SPEED, "Pitch": 1.0},
    )
    if resp.status_code != 200:
        raise TTSError(f"UnrealSpeech {resp.status_code}: {resp.text[:300]}")
    return resp.content


async def _lemonfox(text: str, voice: str, locale: str) -> bytes:
    if not settings.LEMONFOX_API_KEY:
        raise TTSError("LEMONFOX_API_KEY is not set")

    lang = "en-gb" if locale == "en-GB" else "en-us"
    resp = await _http_client.post(
        LEMONFOX_SPEECH_URL,
        headers={"Authorization": f"Bearer {settings.LEMONFOX_API_KEY}"},
        json={"input": text, "voice": voice, "language": lang, "response_format": "mp3", "speed": TTS_SPEED_MULTIPLIER},
    )
    if resp.status_code != 200:
        raise TTSError(f"Lemonfox {resp.status_code}: {resp.text[:300]}")
    return resp.content


async def _probe_duration(audio_bytes: bytes) -> float:
    """ffprobe the raw bytes via a temp file — same shell-out convention the
    rest of the pipeline already uses for ffmpeg/ffprobe calls."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = Path(tmp.name)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(tmp_path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise TTSError(f"ffprobe failed on TTS output: {stderr.decode()[-200:]}")
        return float(stdout.decode().strip())
    finally:
        tmp_path.unlink(missing_ok=True)
