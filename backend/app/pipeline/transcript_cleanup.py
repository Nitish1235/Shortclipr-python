"""
transcript_cleanup.py — OpenAI-based transcript text cleanup.

Runs AFTER transcript fetch + gateway/free-tier windowing (api_stage.py),
BEFORE the transcript is used for AI clip-finding (ai_clipper.py) and
caption burning (captions.py's get_clip_captions() — see ffmpeg_stage.py).
Cleaning it once here means both consumers benefit automatically.

Fixes ASR/OCR-style corruption in the transcript TEXT ONLY — garbled
characters, mojibake, stray symbols, obviously mis-heard words — without
ever touching timing (start/duration) or translating/rephrasing content.
transcript.py's regex _clean() already strips [Music]/(laughs)/music-note
glyphs/stray tags at ingestion; this is a second, smarter pass for the
kind of corruption regex can't catch — genuinely wrong or garbled words
that need surrounding context to detect and fix.

Fails open: any error here (API down, malformed response, timeout) just
returns the ORIGINAL entries unchanged — occasional subtitle artifacts
are far better than a broken pipeline.
"""

import asyncio
import json
import logging

import httpx as _httpx
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.pipeline.transcript import TranscriptEntry

logger = logging.getLogger(__name__)
settings = get_settings()

# Same cheap model already used for clip selection (see ai_clipper.py) —
# this task is even simpler (proofreading, not JSON-schema clip picking).
CLEANUP_MODEL = "gpt-5-nano"

# Separate AsyncOpenAI instance (not shared with ai_clipper.py) to keep
# this module independently importable/testable — mirrors the exact same
# proxy/timeout config: OpenAI must never route through the YouTube-only
# Proxy-Seller/DataImpulse proxies.
_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    max_retries=2,
    http_client=_httpx.AsyncClient(
        mounts={},
        timeout=_httpx.Timeout(connect=10, read=60, write=10, pool=10),
    ),
)

# Entries per chunk (parallel calls) — small prompts stay cheap/fast.
# _MAX_CHUNKS bounds total cost/latency on very long transcripts: anything
# past _CHUNK_SIZE * _MAX_CHUNKS lines is left uncleaned rather than
# ballooning API calls for a single job.
_CHUNK_SIZE = 150
_MAX_CHUNKS = 8

_SYSTEM_PROMPT = """You are a proofreader for auto-generated YouTube video transcripts that get burned in as video subtitles.

Your ONLY job: fix corrupted or garbled TEXT — ASR mis-hearings, stray encoding artifacts (mojibake, broken/repeated punctuation, leftover symbols), and words that are clearly wrong given the surrounding context.

STRICT RULES:
- Do NOT translate. Keep the exact same language as the input.
- Do NOT rephrase, summarize, or paraphrase — only fix genuine corruption.
- Do NOT add or remove punctuation for style — only if it's clearly a transcription artifact.
- Do NOT touch lines that already look correct — leave them out of your response entirely.
- Never invent content that wasn't implied by the surrounding lines.

Input is a numbered list of transcript lines: "[index] text".
Output ONLY a JSON object: {"fixes": {"<index>": "<corrected text>", ...}}
Include ONLY indices that actually need a correction. If nothing needs fixing, return {"fixes": {}}.
"""


def _format_chunk(indexed: list[tuple[int, str]]) -> str:
    return "\n".join(f"[{i}] {t}" for i, t in indexed)


async def _clean_chunk(indexed: list[tuple[int, str]]) -> dict[int, str]:
    """One GPT call over one chunk of (index, text) pairs.
    Returns {index: fixed_text} for whatever the model flagged — empty
    dict on any failure (network error, malformed JSON, etc.)."""
    if not indexed:
        return {}
    try:
        response = await _client.chat.completions.create(
            model=CLEANUP_MODEL,
            messages=[
                {"role": "developer", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _format_chunk(indexed)},
            ],
            reasoning_effort="low",
            max_completion_tokens=4096,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        fixes = data.get("fixes", {})
        valid_indices = {i for i, _ in indexed}
        out: dict[int, str] = {}
        for k, v in fixes.items():
            try:
                idx = int(k)
            except (TypeError, ValueError):
                continue
            if idx in valid_indices and isinstance(v, str) and v.strip():
                out[idx] = v.strip()
        return out
    except Exception as e:
        logger.warning(f"Transcript cleanup chunk failed (using originals for this chunk): {e}")
        return {}


async def clean_transcript(entries: list[TranscriptEntry], video_id: str = "") -> list[TranscriptEntry]:
    """
    Best-effort OpenAI cleanup pass over transcript text. Returns a NEW
    list (never mutates the input) with `text` fields corrected where the
    model flagged genuine corruption — `start`/`duration` are always
    preserved exactly as-is. On any failure, returns entries unchanged.
    """
    if not entries or not settings.OPENAI_API_KEY:
        return entries

    indexed_all = [(i, e.get("text", "")) for i, e in enumerate(entries) if e.get("text", "").strip()]
    if not indexed_all:
        return entries

    total = len(indexed_all)
    capped = indexed_all[: _CHUNK_SIZE * _MAX_CHUNKS]
    if len(capped) < total:
        logger.info(f"[{video_id}] Transcript cleanup: capping to first {len(capped)}/{total} lines")

    chunks = [capped[i : i + _CHUNK_SIZE] for i in range(0, len(capped), _CHUNK_SIZE)]

    try:
        results = await asyncio.gather(*[_clean_chunk(c) for c in chunks], return_exceptions=True)
    except Exception as e:
        logger.warning(f"[{video_id}] Transcript cleanup failed entirely (using original transcript): {e}")
        return entries

    fixes: dict[int, str] = {}
    for r in results:
        if isinstance(r, dict):
            fixes.update(r)

    if not fixes:
        return entries

    cleaned = [dict(e) for e in entries]  # shallow copy — don't mutate caller's list
    for idx, text in fixes.items():
        cleaned[idx]["text"] = text

    logger.info(f"[{video_id}] Transcript cleanup: corrected {len(fixes)}/{total} lines")
    return cleaned
