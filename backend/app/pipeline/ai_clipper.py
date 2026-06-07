"""
ai_clipper.py — Step 4 of the ShortClipr pipeline.

Uses GPT-4o-mini for viral clip detection.
  • ~30× cheaper than GPT-4o
  • Same 128k context window
  • Fast enough for real-time job processing
  • No local models, no extra dependencies

Flow:
  1. Format transcript with MM:SS.d timestamps
  2. Truncate to token budget for very long videos
  3. Single GPT-4o-mini call → clip list with scores
  4. Validate + deduplicate overlapping clips
  5. Return top N sorted by viral_score
"""

import json
import logging
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.pipeline.transcript import TranscriptEntry

logger = logging.getLogger(__name__)
settings = get_settings()

# GPT-4o-mini: $0.15/1M input tokens vs GPT-4o's $5/1M — 33× cheaper
CLIP_MODEL = "gpt-4o-mini"

# Built-in SDK retry: 3 attempts, exponential backoff (2s → 4s → 8s)
_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, max_retries=3)

# Transcript character budget for GPT-4o-mini
# 128k context − system prompt − output = ~100k chars safely
MAX_TRANSCRIPT_CHARS = 100_000


# ── Data model ──────────────────────────────────────────────────

@dataclass
class ClipTimestamp:
    start:           float   # seconds from video start
    end:             float
    title:           str
    viral_score:     int     # 0-100
    reason:          str
    caption_preview: str

    @property
    def duration(self) -> float:
        return self.end - self.start

    def to_dict(self) -> dict[str, Any]:
        return {
            "start":           self.start,
            "end":             self.end,
            "title":           self.title,
            "viral_score":     self.viral_score,
            "reason":          self.reason,
            "caption_preview": self.caption_preview,
            "duration":        self.duration,
        }


# ── Prompts ──────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert viral content strategist for TikTok, Instagram Reels, and YouTube Shorts.

Analyse the timestamped transcript and select the most viral clip moments.

RULES:
1. Every clip MUST be self-contained — viewers need zero prior context
2. Start at a natural sentence beginning, end at a natural sentence end — NEVER mid-sentence
3. The HOOK (first 3 seconds) must grab attention immediately — this is the #1 factor
4. Prioritise: shocking facts, emotional moments, controversy, humour, clear tips, plot twists
5. Avoid: rambling, jargon-heavy sections, mid-story moments, slow introductions
6. Clip duration: {min_dur}s – {max_dur}s
7. No two clips may overlap in time
8. Only include clips with viral_score ≥ 50

VIRAL SCORE RUBRIC:
  90–100  Exceptional hook + value — will stop scroll instantly
  70–89   Good hook, clear value — will likely perform well
  50–69   Decent clip, some engagement potential
  < 50    Do NOT include — skip entirely

OUTPUT FORMAT — return ONLY this JSON object, no extra text:
{{
  "clips": [
    {{
      "start":           <float — seconds from video start>,
      "end":             <float — seconds from video start>,
      "title":           "<punchy 5-7 word title>",
      "viral_score":     <integer 50-100>,
      "reason":          "<1-2 sentences: what makes this clip viral>",
      "caption_preview": "<first 10-15 spoken words of the clip>"
    }}
  ]
}}"""


# ── Transcript formatting ────────────────────────────────────────

def _format_transcript(transcript: list[TranscriptEntry]) -> str:
    """
    Format with sub-second precision timestamps.
    Format: MM:SS.d  — tenths of a second so GPT picks precise boundaries.
    Example: 03:45.7 - You won't believe what happened next...
    """
    lines = []
    for e in transcript:
        start   = e["start"]
        total_s = int(start)
        mm      = total_s // 60
        ss      = total_s % 60
        tenth   = int((start - total_s) * 10)
        lines.append(f"{mm:02d}:{ss:02d}.{tenth} - {e['text'].strip()}")
    return "\n".join(lines)


def _truncate_transcript(text: str) -> str:
    """
    If transcript exceeds budget: keep first 60 % + last 40 %.
    Preserves the opening (where hooks usually are) and the ending
    (strong conclusions, reveals) — skips the often-repetitive middle.
    """
    if len(text) <= MAX_TRANSCRIPT_CHARS:
        return text
    split      = int(MAX_TRANSCRIPT_CHARS * 0.6)
    remainder  = MAX_TRANSCRIPT_CHARS - split
    truncated  = (
        text[:split]
        + "\n\n[... middle section omitted for length ...]\n\n"
        + text[-remainder:]
    )
    logger.warning(
        f"Transcript truncated: {len(text):,} → {MAX_TRANSCRIPT_CHARS:,} chars"
    )
    return truncated


# ── Main function ────────────────────────────────────────────────

async def find_viral_clips(
    transcript: list[TranscriptEntry],
    options:    dict,
) -> list[ClipTimestamp]:
    """
    Send transcript to GPT-4o-mini → validate → deduplicate → return top N clips.
    """
    clip_count   = options.get("clip_count",   10)
    min_dur      = float(options.get("min_duration", 30))
    max_dur      = float(options.get("max_duration", 90))
    topic        = (options.get("topic") or "").strip()

    transcript_text = _format_transcript(transcript)
    transcript_text = _truncate_transcript(transcript_text)

    system = _SYSTEM_PROMPT.format(min_dur=int(min_dur), max_dur=int(max_dur))

    topic_line = (
        f"\nFOCUS ONLY on moments related to: '{topic}'. "
        "Ignore unrelated sections even if they score higher.\n"
        if topic else ""
    )

    user_prompt = (
        f"Find exactly {clip_count} viral clips from this transcript.\n"
        f"{topic_line}\n"
        f"TRANSCRIPT:\n{transcript_text}"
    )

    logger.info(
        f"GPT-4o-mini request — {len(transcript)} entries, "
        f"{len(transcript_text):,} chars, want {clip_count} clips"
    )

    raw = await _call_gpt(system, user_prompt)

    clips = _parse_response(raw, min_dur, max_dur)
    clips = _deduplicate(clips)
    clips.sort(key=lambda c: c.viral_score, reverse=True)

    logger.info(f"GPT-4o-mini → {len(clips)} valid clips, returning top {clip_count}")
    return clips[:clip_count]


# ── GPT call ────────────────────────────────────────────────────

async def _call_gpt(system: str, user: str) -> str:
    response = await _client.chat.completions.create(
        model=CLIP_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        temperature=0.3,       # low temp → consistent JSON output
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or '{"clips":[]}'


# ── Response parsing ─────────────────────────────────────────────

def _parse_response(
    raw:      str,
    min_dur:  float,
    max_dur:  float,
) -> list[ClipTimestamp]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e} | raw={raw[:400]}")
        return []

    # Extract clips array — handles {"clips":[...]} and bare [...]
    if isinstance(parsed, dict):
        data = parsed.get("clips") or []
        if not data:
            for v in parsed.values():
                if isinstance(v, list):
                    data = v
                    break
    elif isinstance(parsed, list):
        data = parsed
    else:
        logger.error(f"Unexpected GPT output type: {type(parsed)}")
        return []

    clips: list[ClipTimestamp] = []
    for item in data:
        try:
            start = float(item["start"])
            end   = float(item["end"])
            dur   = end - start
            score = int(item.get("viral_score", 50))

            if score < 50:
                logger.debug(f"Skipping low-score clip {start:.0f}-{end:.0f}s (score={score})")
                continue

            if not (min_dur * 0.8 <= dur <= max_dur * 1.2):
                logger.debug(
                    f"Skipping clip {start:.0f}-{end:.0f}s: "
                    f"duration {dur:.0f}s outside [{min_dur:.0f}–{max_dur:.0f}s]"
                )
                continue

            clips.append(ClipTimestamp(
                start          = start,
                end            = end,
                title          = str(item.get("title", "Untitled"))[:100],
                viral_score    = max(0, min(100, score)),
                reason         = str(item.get("reason", ""))[:500],
                caption_preview= str(item.get("caption_preview", ""))[:200],
            ))

        except (KeyError, ValueError, TypeError) as e:
            logger.warning(f"Skipping malformed clip entry: {e} — {item}")

    return clips


# ── Deduplication ────────────────────────────────────────────────

def _deduplicate(clips: list[ClipTimestamp]) -> list[ClipTimestamp]:
    """
    Remove overlapping clips — greedy selection, highest viral_score wins.
    """
    by_score  = sorted(clips, key=lambda c: c.viral_score, reverse=True)
    accepted: list[ClipTimestamp] = []

    for cand in by_score:
        overlap = any(
            not (cand.end <= kept.start or cand.start >= kept.end)
            for kept in accepted
        )
        if not overlap:
            accepted.append(cand)

    return accepted
