"""
ai_clipper.py — Step 4 of the ShortClipr pipeline.

Uses GPT-4o-mini for viral clip detection.
  • ~30× cheaper than GPT-4o
  • Fast enough for real-time job processing
  • No local models, no extra dependencies

Flow:
  1. Split the transcript into `clip_count` equal-duration time chunks
  2. One parallel GPT-4o-mini call per chunk → best "start" moment + score.
     gpt-4o-mini has a strong positional bias toward the start of long
     contexts ("lost in the middle") — a single call over the whole
     transcript reliably clusters all picks in the first minute, even when
     explicitly told to spread out. Per-chunk calls are the only reliable
     way to get clips spread across the whole video.
  3. Compute each clip's "end" by snapping to a transcript line boundary
     near start + target_duration — gpt-4o-mini is unreliable at picking
     "end" timestamps itself (it tends to echo the per-line caption duration,
     producing sub-second "clips").
  4. Validate + deduplicate overlapping clips
  5. Re-rank by score (100 = most viral, descending) and return top N
"""

import asyncio
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

# Built-in SDK retry handles 429 + 5xx — connection errors need our own retry.
# http_client=None lets httpx use system env (no proxy) — OpenAI must NOT go
# through the Decodo residential proxy; it's YouTube-specific.
import httpx as _httpx
_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    max_retries=2,
    http_client=_httpx.AsyncClient(
        proxies=None,   # explicitly ignore HTTP_PROXY / HTTPS_PROXY env vars
        timeout=_httpx.Timeout(connect=10, read=60, write=10, pool=10),
    ),
)

# Per-chunk transcript character budget for GPT-4o-mini
MAX_CHUNK_CHARS = 40_000

# Curated trending emoji (mirrors src/pages/Editor.jsx TRENDING_EMOJI),
# split into 5 mood/theme groups of 9 — the model picks the single
# best-fitting GROUP for the clip's tone, then ONE emoji within it. Giving
# it a pre-grouped, narrowed choice keeps the pick on-theme and consistent,
# instead of free-choosing from all 45 with no thematic anchor.
EMOJI_GROUPS: dict[str, list[str]] = {
    "hype":      ["🔥", "💯", "⚡", "✨", "🎉", "💥", "⭐", "🚀", "😎"],
    "shock":     ["😱", "🤯", "👀", "💀", "😭", "🥶", "😂", "🤣", "🚨"],
    "money":     ["💰", "📈", "📉", "🤑", "💸", "👑", "🔑", "✅", "🆗"],
    "connection": ["👍", "👏", "🙌", "🙏", "🤝", "❤️", "💪", "🫡", "❌"],
    "thinking":  ["🤔", "🧠", "👇", "👆", "➡️", "🎬", "👎", "⚠️", "🎯"],
}
_ALL_EMOJI = {e for group in EMOJI_GROUPS.values() for e in group}

def _emoji_groups_prompt_block() -> str:
    lines = [f'  {name}: {" ".join(emojis)}' for name, emojis in EMOJI_GROUPS.items()]
    return "\n".join(lines)


# ── Data model ──────────────────────────────────────────────────

@dataclass
class ClipTimestamp:
    start:           float   # seconds from video start
    end:             float
    title:           str
    viral_score:     int     # 0-100
    reason:          str
    caption_preview: str
    title_emoji:     str = ""   # one emoji from EMOJI_GROUPS, AI-picked per clip; "" = none

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def title_with_emoji(self) -> str:
        return f"{self.title_emoji} {self.title}".strip() if self.title_emoji else self.title

    def to_dict(self) -> dict[str, Any]:
        return {
            "start":           self.start,
            "end":             self.end,
            "title":           self.title,
            "title_emoji":     self.title_emoji,
            "viral_score":     self.viral_score,
            "reason":          self.reason,
            "caption_preview": self.caption_preview,
            "duration":        self.duration,
        }


# ── Prompts ──────────────────────────────────────────────────────

_CHUNK_SYSTEM_PROMPT = """\
You are an expert viral content strategist for TikTok, Instagram Reels, and YouTube Shorts.

Below is ONE SEGMENT of a longer video's transcript. Each line is prefixed with a line
number in brackets, like "[42] some spoken text". Find the SINGLE most viral moment within
THIS SEGMENT to turn into a short clip.

RULES:
1. "start_line" = the [N] line number where the clip should BEGIN — it MUST be the start of
   a natural sentence/thought, NEVER mid-sentence. Copy the bracketed number EXACTLY as shown
   on that line — do not compute, guess, or offset it.
2. The HOOK (the first few seconds right after "start_line") must grab attention immediately —
   this is the #1 factor
3. Prioritise: shocking facts, emotional moments, controversy, humour, clear tips, plot twists
4. Avoid: rambling, jargon-heavy sections, mid-story moments, slow introductions
5. The clip will run for roughly {min_dur}-{max_dur} seconds starting at "start_line" (a
   separate system picks the exact end point) — only choose a "start_line" if the content
   from there stays interesting and self-contained for at least that long
6. "viral_score": rate THIS moment's viral potential on an absolute 0-100 scale
   (90-100 exceptional, 70-89 good, 50-69 decent, <50 weak)
7. "title" = a 5-6 word CURIOSITY-GAP title burned on-screen as a hook card. This is NOT a
   summary — it must open a loop the viewer has to keep watching to close. Tease the outcome,
   never state it: no punchlines, numbers, names, or results that resolve the curiosity.
   Good patterns: bold unresolved claim ("The Mistake That Cost Everything"), withheld reveal
   ("Nobody Saw This Coming"), contrarian tease ("Why This Actually Works"), direct address
   ("You're Doing This Completely Wrong"). Bad: anything a viewer could read and feel like they
   already know what happens — that kills the rewatch/watch-through motive entirely.
8. "title_emoji" = ONE emoji to prefix the title card with. First pick whichever GROUP below
   best matches this moment's tone, then pick exactly ONE emoji from that group only — never
   mix emoji across groups, never invent an emoji outside this list:
{emoji_groups}
{topic_line}
OUTPUT FORMAT — return ONLY this JSON object, no extra text:
{{
  "start_line":      <integer — the [N] of the transcript line where this clip begins>,
  "title":           "<5-6 word curiosity-gap hook title — see rule 7, do not reveal the outcome>",
  "title_emoji":      "<exactly one emoji from the single best-fitting group in rule 8>",
  "viral_score":     <integer 0-100>,
  "reason":          "<1-2 sentences: what makes this moment viral>",
  "caption_preview": "<first 10-15 spoken words starting at this moment>"
}}"""


# ── Transcript helpers ────────────────────────────────────────────

def _video_duration(transcript: list[TranscriptEntry]) -> float:
    if not transcript:
        return 0.0
    last = transcript[-1]
    return last["start"] + last.get("duration", 0)


def _format_lines(indexed_chunk: list[tuple[int, TranscriptEntry]]) -> str:
    """
    Format each line with a [N] index prefix (N = global index into the full
    transcript) so GPT can return that index instead of having to read/compute
    a timestamp. Example: [42] You won't believe what happened next...
    """
    lines = []
    for idx, e in indexed_chunk:
        lines.append(f"[{idx}] {e['text'].strip()}")
    return "\n".join(lines)


def _truncate_lines(text: str) -> str:
    """
    If a chunk's transcript exceeds budget: keep first 60% + last 40%.
    Preserves the opening (where hooks usually are) and the ending
    (strong conclusions, reveals) — skips the often-repetitive middle.
    """
    if len(text) <= MAX_CHUNK_CHARS:
        return text
    split     = int(MAX_CHUNK_CHARS * 0.6)
    remainder = MAX_CHUNK_CHARS - split
    truncated = (
        text[:split]
        + "\n\n[... middle section omitted for length ...]\n\n"
        + text[-remainder:]
    )
    logger.warning(f"Chunk transcript truncated: {len(text):,} → {MAX_CHUNK_CHARS:,} chars")
    return truncated


def _chunk_transcript(
    transcript: list[TranscriptEntry],
    clip_count: int,
    video_dur:  float,
) -> list[list[tuple[int, TranscriptEntry]]]:
    """
    Split the transcript into `clip_count` equal-duration time chunks.
    Each entry is paired with its global index into `transcript` so the
    chunk's GPT response (a line number) can be mapped back to a real
    timestamp without GPT needing to read/compute one.

    `video_dur` (from _video_duration) is the transcript's absolute END
    time, not its span — bucketing is done relative to the transcript's
    own first entry (`floor`), not absolute t=0. This matters once the
    transcript has been pre-filtered to a sub-window of the full video
    (e.g. the minutes gateway, or the free-tier transcript cap) starting
    well after t=0: without rebasing, segment_size would be computed from
    the absolute end time while bucket indices use absolute start times,
    collapsing every entry into the last few buckets instead of spreading
    them across the actual window (e.g. a 1800-2400s window with
    clip_count=10 would put everything in buckets 7-9, leaving 0-6 empty).
    """
    if clip_count <= 1 or video_dur <= 0 or not transcript:
        return [list(enumerate(transcript))]

    floor = transcript[0]["start"]
    span = video_dur - floor
    if span <= 0:
        return [list(enumerate(transcript))]

    segment_size = span / clip_count
    chunks: list[list[tuple[int, TranscriptEntry]]] = [[] for _ in range(clip_count)]
    for i, e in enumerate(transcript):
        idx = min(int((e["start"] - floor) // segment_size), clip_count - 1)
        chunks[idx].append((i, e))
    return chunks


# ── Main function ────────────────────────────────────────────────

async def find_viral_clips(
    transcript: list[TranscriptEntry],
    options:    dict,
) -> list[ClipTimestamp]:
    """
    Split transcript into clip_count chunks → one GPT-4o-mini call per chunk
    → validate → deduplicate → re-rank → return top N clips.
    """
    clip_count   = max(1, int(options.get("clip_count", 10)))
    min_dur      = float(options.get("min_duration", 30))
    max_dur      = float(options.get("max_duration", 90))
    topic        = (options.get("topic") or "").strip()

    video_dur = _video_duration(transcript)
    chunks    = _chunk_transcript(transcript, clip_count, video_dur)

    topic_line = (
        f"FOCUS ONLY on moments related to: '{topic}'. If nothing in this segment relates to "
        f"that topic, still pick the best moment but give it a low viral_score (<30).\n"
        if topic else ""
    )
    system = _CHUNK_SYSTEM_PROMPT.format(
        min_dur=int(min_dur), max_dur=int(max_dur), topic_line=topic_line,
        emoji_groups=_emoji_groups_prompt_block(),
    )

    logger.info(
        f"GPT-4o-mini request — {len(transcript)} entries, "
        f"{len(chunks)} chunks, want {clip_count} clips"
    )

    tasks = [_find_clip_in_chunk(chunk, system) for chunk in chunks if chunk]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    candidates: list[dict[str, Any]] = []
    for r in results:
        if isinstance(r, Exception):
            logger.warning(f"Chunk clip search failed: {r}")
        elif r is not None:
            candidates.append(r)

    clips = _build_clips(candidates, transcript, min_dur, max_dur)
    clips = _deduplicate(clips)
    clips.sort(key=lambda c: c.viral_score, reverse=True)

    # Each chunk scores its pick independently (0-100 absolute) — re-rank
    # the combined results into a single relative scale (100 = best overall).
    for i, c in enumerate(clips):
        c.viral_score = max(0, 100 - i)

    if not clips:
        logger.warning("GPT-4o-mini → 0 valid clips across all chunks")
    else:
        logger.info(f"GPT-4o-mini → {len(clips)} valid clips, returning top {clip_count}")
    return clips[:clip_count]


async def _find_clip_in_chunk(chunk: list[tuple[int, TranscriptEntry]], system: str) -> dict[str, Any] | None:
    text   = _truncate_lines(_format_lines(chunk))
    raw    = await _call_gpt(system, f"SEGMENT TRANSCRIPT:\n{text}")
    result = _parse_single(raw)
    if result is None:
        return None

    valid_indices = [i for i, _ in chunk]
    if result["start_idx"] not in valid_indices:
        snapped = min(valid_indices, key=lambda i: abs(i - result["start_idx"]))
        logger.info(f"Chunk returned start_line={result['start_idx']} outside chunk range "
                    f"({valid_indices[0]}-{valid_indices[-1]}) — snapping to {snapped}")
        result["start_idx"] = snapped
    return result


# ── GPT call ────────────────────────────────────────────────────

async def _call_gpt(system: str, user: str) -> str:
    from openai import APIConnectionError, APIStatusError
    _CONNECT_RETRIES = 3
    _CONNECT_DELAY   = 3.0

    last_err: Exception | None = None
    for attempt in range(1, _CONNECT_RETRIES + 1):
        try:
            response = await _client.chat.completions.create(
                model=CLIP_MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                temperature=0.3,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
            choice = response.choices[0]
            if choice.finish_reason == "length":
                logger.warning(f"GPT-4o-mini chunk response truncated (usage={response.usage})")
            return choice.message.content or "{}"
        except APIConnectionError as e:
            last_err = e
            logger.warning(f"OpenAI connection error (attempt {attempt}/{_CONNECT_RETRIES}): {e}")
            if attempt < _CONNECT_RETRIES:
                await asyncio.sleep(_CONNECT_DELAY * attempt)
        except APIStatusError as e:
            # 5xx or unexpected — re-raise, SDK's own retry already ran
            raise

    raise RuntimeError(f"OpenAI unreachable after {_CONNECT_RETRIES} attempts: {last_err}")


# ── Response parsing ─────────────────────────────────────────────

def _parse_single(raw: str) -> dict[str, Any] | None:
    """Parse a single chunk's JSON into {start, title, viral_score, reason, caption_preview}."""
    try:
        item = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning(f"Chunk JSON parse error: {e} | raw={raw[:300]}")
        return None

    # Tolerate the model wrapping its answer in {"clips": [...]}
    if isinstance(item, dict) and isinstance(item.get("clips"), list) and item["clips"]:
        item = item["clips"][0]

    if not isinstance(item, dict):
        logger.warning(f"Unexpected chunk output type: {type(item)}")
        return None

    title_emoji = str(item.get("title_emoji", "")).strip()
    if title_emoji not in _ALL_EMOJI:
        title_emoji = ""   # model invented/mixed an emoji outside the groups — drop it

    try:
        return {
            "start_idx":       int(item["start_line"]),
            "title":           str(item.get("title", "Untitled"))[:100],
            "title_emoji":     title_emoji,
            "viral_score":     max(0, min(100, int(item.get("viral_score", 50)))),
            "reason":          str(item.get("reason", ""))[:500],
            "caption_preview": str(item.get("caption_preview", ""))[:200],
        }
    except (KeyError, ValueError, TypeError) as e:
        logger.warning(f"Skipping malformed chunk clip: {e} — {item}")
        return None


# ── Clip boundary computation ────────────────────────────────────

def _compute_end(
    start:      float,
    transcript: list[TranscriptEntry],
    min_dur:    float,
    max_dur:    float,
    video_dur:  float,
) -> float:
    """
    Snap the clip end to the boundary (start + duration) of a transcript line
    that lands closest to start + target_duration, within [start+min_dur,
    start+max_dur] (clamped to the video length).
    """
    target = start + (min_dur + max_dur) / 2
    lo     = start + min_dur
    hi     = min(start + max_dur, video_dur)

    if hi <= lo:
        return min(start + min_dur, video_dur)

    best, best_diff = None, None
    for e in transcript:
        line_end = e["start"] + e.get("duration", 0)
        if lo <= line_end <= hi:
            diff = abs(line_end - target)
            if best_diff is None or diff < best_diff:
                best, best_diff = line_end, diff

    return best if best is not None else hi


def find_sequential_clips(
    transcript:       list[TranscriptEntry],
    segment_duration: float = 30,
    count:            int   = 22,
) -> list[ClipTimestamp]:
    """
    No AI scoring — split the transcript into up to `count` sequential
    ~segment_duration-second clips starting from the beginning of the video.
    Each boundary is snapped to the nearest transcript line end within
    +/-5s of the target duration (line-wise chunking), so clips don't cut
    off mid-sentence. Used by the admin test lab to batch-test caption
    styles / reframe templates against real content without burning AI calls.
    """
    video_dur = _video_duration(transcript)
    if not transcript or video_dur <= 0:
        return []

    tolerance = 5.0
    clips: list[ClipTimestamp] = []
    cursor = 0.0
    for i in range(count):
        if cursor >= video_dur:
            break
        end = _compute_end(
            cursor, transcript,
            max(segment_duration - tolerance, 1.0),
            segment_duration + tolerance,
            video_dur,
        )
        if end <= cursor:
            break
        preview = next(
            (e["text"].strip() for e in transcript if e["start"] >= cursor and e["text"].strip()),
            "",
        )
        clips.append(ClipTimestamp(
            start=cursor,
            end=end,
            title=f"Segment {i + 1}",
            viral_score=0,
            reason="Sequential test segment (AI scoring skipped)",
            caption_preview=preview[:200],
        ))
        cursor = end

    return clips


def _build_clips(
    candidates: list[dict[str, Any]],
    transcript: list[TranscriptEntry],
    min_dur:    float,
    max_dur:    float,
) -> list[ClipTimestamp]:
    video_dur = _video_duration(transcript)
    clips: list[ClipTimestamp] = []

    for c in candidates:
        idx = c["start_idx"]
        if not (0 <= idx < len(transcript)):
            logger.info(f"Skipping clip start_idx={idx}: outside transcript bounds (0-{len(transcript)})")
            continue
        start = transcript[idx]["start"]
        if not (0 <= start < video_dur):
            logger.info(f"Skipping clip start={start:.1f}s: outside video bounds (0-{video_dur:.1f}s)")
            continue

        end = _compute_end(start, transcript, min_dur, max_dur, video_dur)
        if end - start < min_dur * 0.5:
            logger.info(f"Skipping clip start={start:.1f}s: not enough content before video end")
            continue

        clips.append(ClipTimestamp(
            start           = start,
            end             = end,
            title           = c["title"],
            title_emoji     = c.get("title_emoji", ""),
            viral_score     = c["viral_score"],
            reason          = c["reason"],
            caption_preview = c["caption_preview"],
        ))

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
