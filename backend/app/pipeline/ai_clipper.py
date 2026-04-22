"""
ai_clipper.py — Step 4 of the ShortClipr pipeline.

Sends transcript to GPT-4o, receives viral clip timestamps with scores.
Supports PARTIAL transcript mode:
  - When Whisper fallback is active, orchestrator calls this early
    with partial transcript (5+ minutes) to get initial clip candidates.
  - Results are refined when full transcript is ready.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.pipeline.transcript import format_transcript_for_llm, TranscriptEntry

logger = logging.getLogger(__name__)
settings = get_settings()
openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


# ── Data model ─────────────────────────────────────────────────

@dataclass
class ClipTimestamp:
    start: float          # seconds from video start
    end: float            # seconds from video start
    title: str            # suggested clip title
    viral_score: int      # 0-100
    reason: str           # why AI picked this (shown to user)
    caption_preview: str  # first ~10 words of clip

    @property
    def duration(self) -> float:
        return self.end - self.start

    def to_dict(self) -> dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "title": self.title,
            "viral_score": self.viral_score,
            "reason": self.reason,
            "caption_preview": self.caption_preview,
            "duration": self.duration,
        }


# ── System prompt ──────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an expert viral content strategist who identifies the best 
short-form clip moments from long videos for TikTok, Instagram Reels, and YouTube Shorts.

Your job is to analyse a timestamped transcript and return clip timestamps that will 
perform best as standalone short videos.

RULES FOR SELECTING CLIPS:
1. Each clip MUST be self-contained — viewers shouldn't need context from earlier in the video
2. Start at a natural sentence beginning, end at a natural sentence end — NEVER mid-sentence
3. Prioritise clips with: strong hooks (first 3 seconds), surprising facts, emotional moments, 
   controversy, humour, or actionable tips
4. Avoid: rambling sections, mid-story moments, technical jargon without explanation
5. Clips must be between {min_duration}s and {max_duration}s long

VIRAL SCORE RUBRIC (0-100):
- 90-100: Exceptional hook + strong emotional/educational value, will stop scroll instantly
- 70-89:  Good hook, clear value, likely to perform well
- 50-69:  Decent clip, some engagement potential
- Below 50: Avoid recommending

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON array.

OUTPUT FORMAT:
[
  {{
    "start": <float seconds>,
    "end": <float seconds>,
    "title": "<punchy 5-7 word title>",
    "viral_score": <int 0-100>,
    "reason": "<1-2 sentence explanation of why this clip will perform>",
    "caption_preview": "<first 10-15 words of the clip>"
  }}
]"""


# ── Main function ──────────────────────────────────────────────

async def find_viral_clips(
    transcript: list[TranscriptEntry],
    options: dict,
    partial: bool = False,
) -> list[ClipTimestamp]:
    """
    Analyse transcript and return viral clip timestamps.

    Args:
        transcript: List of transcript entries.
        options:    {clip_count, min_duration, max_duration, topic}
        partial:    If True, transcript is incomplete (Whisper streaming).
                    Returns best effort results to enable early extraction.
    """
    clip_count = options.get("clip_count", 10)
    min_duration = options.get("min_duration", 30)
    max_duration = options.get("max_duration", 90)
    topic = options.get("topic", "").strip()

    transcript_text = format_transcript_for_llm(transcript)

    user_prompt = _build_user_prompt(
        transcript_text=transcript_text,
        clip_count=clip_count,
        min_duration=min_duration,
        max_duration=max_duration,
        topic=topic,
        partial=partial,
    )

    system = _SYSTEM_PROMPT.format(
        min_duration=min_duration,
        max_duration=max_duration,
    )

    logger.info(f"Sending {len(transcript)} entries to GPT-4o (partial={partial})")

    raw_json = await _call_gpt(system, user_prompt)
    clips = _parse_gpt_response(raw_json, min_duration, max_duration)

    # Sort by viral score descending, return top N
    clips.sort(key=lambda c: c.viral_score, reverse=True)

    logger.info(f"GPT-4o returned {len(clips)} clip candidates")
    return clips[:clip_count]


def _build_user_prompt(
    transcript_text: str,
    clip_count: int,
    min_duration: float,
    max_duration: float,
    topic: str,
    partial: bool,
) -> str:
    topic_instruction = ""
    if topic:
        topic_instruction = (
            f"\n\nFOCUS ONLY on moments related to: '{topic}'. "
            f"Ignore unrelated sections even if they score higher."
        )

    partial_note = ""
    if partial:
        partial_note = (
            "\n\nNOTE: This is a PARTIAL transcript — the video is still being processed. "
            "Return your best {n} candidates based on what's available. "
            "Timestamps are accurate."
        ).format(n=clip_count)

    return (
        f"Find exactly {clip_count} viral clips from this transcript.\n"
        f"Duration per clip: {min_duration}s to {max_duration}s.\n"
        f"{topic_instruction}{partial_note}\n\n"
        f"TRANSCRIPT:\n{transcript_text}"
    )


async def _call_gpt(system: str, user: str) -> str:
    response = await openai.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,   # Low temp for consistent JSON output
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "[]"
    # GPT sometimes wraps array in an object — unwrap it
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            # Find the first list value
            for v in parsed.values():
                if isinstance(v, list):
                    return json.dumps(v)
        return content
    except Exception:
        return content


def _parse_gpt_response(
    raw: str,
    min_duration: float,
    max_duration: float,
) -> list[ClipTimestamp]:
    """Parse and validate GPT JSON response into ClipTimestamp objects."""
    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            logger.error(f"GPT response not a list: {type(data)}")
            return []
    except json.JSONDecodeError as e:
        logger.error(f"GPT JSON parse error: {e}\nRaw: {raw[:500]}")
        return []

    clips = []
    for item in data:
        try:
            start = float(item["start"])
            end = float(item["end"])
            duration = end - start

            # Validate duration bounds
            if not (min_duration * 0.8 <= duration <= max_duration * 1.2):
                logger.debug(f"Clip {start:.0f}-{end:.0f} skipped: duration {duration:.0f}s out of range")
                continue

            clips.append(ClipTimestamp(
                start=start,
                end=end,
                title=str(item.get("title", "Untitled Clip"))[:100],
                viral_score=max(0, min(100, int(item.get("viral_score", 50)))),
                reason=str(item.get("reason", ""))[:500],
                caption_preview=str(item.get("caption_preview", ""))[:200],
            ))
        except (KeyError, ValueError, TypeError) as e:
            logger.warning(f"Skipping malformed clip entry: {e} — {item}")

    return clips
