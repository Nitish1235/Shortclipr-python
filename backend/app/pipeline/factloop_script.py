"""
factloop_script.py — narration writer for Factloop (data/fact video renderer).

Replaces brainrot_script.py's comedy-dialogue writer. Input is now one
structured data record — a title, a short list of facts/stats, and an
optional tone/context line — instead of a topic + character cast. Output is
a single-narrator voiceover script, paced to the requested clip duration the
same way the old writer was (target line count derived from
duration_seconds), but every line is additionally tagged with `kind` and
(for stat lines) which fact it's narrating via `stat_key` — that tag is what
lets factloop_composite.py sync each fact's animated on-screen callout to
the exact moment the narrator says that number, using the real TTS-derived
start/end timing computed downstream in factloop_stage.py (same mechanism
brainrot_stage.py's _synthesize_timeline already used for dialogue).

No review step exists in this product (see factloop_stage.py's module
docstring) — whatever this writes is what gets synthesized and rendered,
with no user edit pass in between.
"""
import asyncio
import json
import logging

from dataclasses import dataclass

from openai import AsyncOpenAI, APIConnectionError, APIStatusError

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SCRIPT_MODEL = "gpt-5-mini"

import httpx as _httpx
_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    max_retries=2,
    http_client=_httpx.AsyncClient(
        mounts={},
        timeout=_httpx.Timeout(connect=10, read=200, write=10, pool=10),
    ),
)

MAX_LINES = 40
_SECONDS_PER_LINE = 3.2

VALID_KINDS = ("hook", "stat", "context", "outro")


@dataclass
class NarrationLine:
    kind: str            # "hook" | "stat" | "context" | "outro"
    text: str
    stat_key: str | None = None    # which fact this line narrates (kind == "stat" only)
    image_query: str | None = None  # short visual search phrase for this line's on-screen image
                                     # (factloop_image.py tries this against stock photo libraries
                                     # first, then falls back to AI generation — see that module)


_SYSTEM_PROMPT = """You are an expert short-form data-recap narrator for vertical videos played \
over fast gameplay footage (Minecraft parkour, Subway Surfers, GTA) — the "stat reveal" format: \
a single confident voiceover bringing a set of real facts/numbers to life, NOT a comedy skit and \
NOT two characters arguing.

The user provides: a title/subject, a numbered list of facts (each with a label, a value, and an \
optional unit), an optional tone/context line, and the target clip duration.

CORE GOAL: make the viewer feel the scale/significance of these specific numbers. Confident, \
punchy, energetic delivery — think a highlight-reel narrator or a "wrapped"-style recap voice, \
never a dry data readout.

STRUCTURE — exactly one line per fact, plus a hook and (if there's room) a short outro:
1. HOOK (kind="hook", stat_key=null): one opening line that sets up the subject and makes the \
   viewer want to know the numbers. Grab attention immediately — a bold claim, a question, or the \
   headline number itself. Do not summarize the whole video here.
2. STAT lines (kind="stat", one per fact, in an order that builds — biggest/most impressive number \
   doesn't have to be first, pace it for escalation): each line must clearly say that fact's label \
   and value/unit in natural spoken language (numbers spelled out or in digits, whichever reads more \
   naturally aloud), with a little color/context/reaction around it — not just "label: value" \
   read aloud. stat_key MUST be set to that fact's exact key as given by the user, unchanged.
3. CONTEXT lines (kind="context", stat_key=null): OPTIONAL short connective lines between stats if \
   the tone/context calls for it (a transition, a reaction, a comparison) — use sparingly, most \
   clips need zero of these; do not pad.
4. OUTRO (kind="outro", stat_key=null): one short closing line — a punchy takeaway, not a summary \
   list of the numbers again. Only include this if clip_duration_seconds comfortably fits it \
   alongside the hook + every stat line.

RULES:
- EVERY fact the user provides gets exactly one stat line — never skip a fact, never invent one \
  that wasn't given, never merge two facts into one line.
- Plain speakable text only — no emojis, no stage directions, no markdown, no hashtags (TTS reads \
  this aloud verbatim).
- Vary sentence rhythm — don't make every stat line the same shape ("X had Y" repeated N times \
  reads flat and robotic).
- Respect the tone/context line if the user gave one (e.g. "hype sports commentary", "calm \
  investor update", "motivational") — otherwise default to confident and energetic.
- Never invent numbers, names, or claims beyond what the user's facts/title/context state.

IMAGE_QUERY (every line, especially "hook" and "stat"): a short (3-6 word) visual search phrase \
for what should be ON SCREEN while this line plays — a real photo/stock-search query, not a \
caption. Make it SPECIFIC and VARIED per line, not the same generic shot repeated: think about \
what this particular fact is actually about and pick a different angle/moment/action each time \
(e.g. for a cricketer's stats: "batting" -> a batting-stance photo, "wickets" -> a bowling-action \
photo, a century/milestone -> a celebration photo, an aggressive stat -> an intense close-up). \
Include the subject's name/identity from the title when the subject is a specific named person, \
place, or thing (so the search has a chance of finding a real match) — e.g. "Virat Kohli batting \
stance", "Virat Kohli century celebration", not just "batting" or "celebration" alone. For a non- \
person subject (a company, a product, a research topic), describe a concrete real-world scene \
instead (e.g. "quarterly sales chart office", "climate data glacier melting").

SUBJECT (top-level, once for the whole video): the bare canonical name of who/what this video is \
about, extracted from the title — 2-4 words, NO extra descriptive words, dates, or phrasing. This \
is used as a real-photo search fallback when a specific per-line image_query finds nothing, so it \
must be just the identifiable name/entity itself: title "Virat Kohli's 2026 Season in Numbers" -> \
subject "Virat Kohli" (not "Virat Kohli 2026 season"); title "Acme Corp Q4 Earnings Recap" -> \
subject "Acme Corp" (not "Acme Corp Q4 earnings"); title "How Fast Is Climate Change" -> subject \
"climate change" (not the full question). If the title has no single clear named subject, repeat \
the shortest reasonable summary of it instead.

Return ONLY valid JSON — no other text:
{"subject": "...", "lines": [{"kind": "hook"|"stat"|"context"|"outro", "stat_key": "<fact key>"|null, \
"image_query": "...", "text": "..."}]}"""


def _target_lines(duration_seconds: int, fact_count: int) -> int:
    # Paced the same way brainrot_script.py was (duration / seconds-per-line),
    # but floored to "hook + one line per fact" so a long fact list is never
    # squeezed below one stat line each regardless of a short duration pick.
    by_duration = round(duration_seconds / _SECONDS_PER_LINE)
    floor = fact_count + 1
    return max(floor, min(MAX_LINES, by_duration))


def _facts_block(facts: list[dict]) -> str:
    lines = []
    for f in facts:
        unit = f.get("unit") or ""
        lines.append(f'- key="{f["key"]}" label="{f["label"]}" value="{f["value"]}"{f" unit=" + repr(unit) if unit else ""}')
    return "\n".join(lines)


async def generate_narration(
    title: str,
    facts: list[dict],       # [{key, label, value, unit}]
    context: str = "",
    duration_seconds: int = 30,
) -> tuple[str, list[NarrationLine]]:
    """Returns (subject, lines) — subject is GPT's bare canonical name for
    the video ("Virat Kohli" from a title like "Virat Kohli's 2026 Season
    in Numbers"), used by factloop_image.py as a broader real-photo search
    fallback when a specific per-line image_query finds nothing (the exact
    title is usually too sentence-like to match well against stock/
    Wikimedia Commons search)."""
    if not facts:
        raise ValueError("factloop_script: at least one fact is required")

    target = _target_lines(duration_seconds, len(facts))
    valid_keys = {f["key"] for f in facts}

    user_prompt = (
        f"title: {title.strip()}\n"
        f"clip_duration_seconds: {duration_seconds}\n"
        f"target_total_lines: ~{target} (hook + one per fact + optional short outro/context)\n"
        f"tone_context: {context.strip() or '(none given — default confident/energetic)'}\n\n"
        f"facts:\n{_facts_block(facts)}"
    )

    raw = await _call_gpt(_SYSTEM_PROMPT, user_prompt)
    subject = _parse_subject(raw, title)
    lines = _parse_lines(raw, valid_keys)
    if not lines or not _covers_all_facts(lines, valid_keys):
        logger.warning("factloop_script: first pass missing lines/facts, retrying with stricter instruction")
        raw = await _call_gpt(
            _SYSTEM_PROMPT,
            user_prompt + "\n\nIMPORTANT: the \"lines\" array must be non-empty, valid JSON, and "
            "include EXACTLY one kind=\"stat\" line per fact key listed above — no more, no fewer.",
        )
        subject = _parse_subject(raw, title) or subject
        lines = _parse_lines(raw, valid_keys)

    if not lines:
        raise RuntimeError("factloop_script: model returned zero usable narration lines")
    if not _covers_all_facts(lines, valid_keys):
        # Still incomplete after retry — append a plain fallback line for any
        # fact the model skipped, rather than silently dropping a stat the
        # user explicitly asked to include.
        covered = {l.stat_key for l in lines if l.stat_key}
        by_key = {f["key"]: f for f in facts}
        for key in valid_keys - covered:
            f = by_key[key]
            unit = f"{f['unit']} " if f.get("unit") else ""
            lines.append(NarrationLine(
                kind="stat", stat_key=key, text=f"{f['label']}: {unit}{f['value']}.",
                image_query=f"{title.strip()} {f['label']}".strip(),
            ))

    logger.info(f"factloop_script: {len(lines)} lines for {len(facts)} fact(s), {duration_seconds}s, subject={subject!r}")
    return subject, lines


def _parse_subject(raw: str, fallback_title: str) -> str:
    try:
        data = json.loads(raw)
        subject = str(data.get("subject") or "").strip()
        return subject or fallback_title.strip()
    except json.JSONDecodeError:
        return fallback_title.strip()


def _covers_all_facts(lines: list[NarrationLine], valid_keys: set[str]) -> bool:
    covered = {l.stat_key for l in lines if l.kind == "stat" and l.stat_key}
    return valid_keys.issubset(covered)


async def generate_post_meta(narration_lines: list[NarrationLine]) -> dict:
    """Post title + hashtags generated from the ACTUAL finished narration —
    same read-only, after-the-fact pass brainrot_script.py used to do from
    finished dialogue, just fed a transcript built from NarrationLine.text."""
    if not narration_lines:
        return {"title": "", "hashtags": []}

    transcript = " ".join(l.text for l in narration_lines)[:2000]

    prompt = (
        "You write viral social media metadata for short-form video (TikTok / YouTube Shorts).\n\n"
        "Here is the FULL finished narration that plays in the video — a data/fact recap:\n"
        f"{transcript}\n\n"
        "Return ONLY valid JSON with exactly two keys:\n"
        "  \"title\"     — one punchy post title under 80 characters, no hashtags inside it, "
        "based on the specific numbers/subject in THIS narration\n"
        "  \"hashtags\"  — array of 6-8 relevant hashtags WITH the # sign, e.g. [\"#stats\", \"#fyp\"]\n\n"
        "Rules: title must grab attention in < 5 words; hashtags mix trending (#fyp #viral) "
        "with subject-specific ones. Return nothing except the JSON object."
    )
    try:
        resp = await _client.chat.completions.create(
            model=SCRIPT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        title = str(data.get("title", "")).strip()[:100]
        hashtags = [str(h).strip() for h in data.get("hashtags", []) if h][:10]
        return {"title": title, "hashtags": hashtags}
    except Exception as exc:
        logger.warning(f"generate_post_meta (post-script) failed: {exc}")
        return {"title": "", "hashtags": []}


async def _call_gpt(system: str, user: str) -> str:
    _CONNECT_RETRIES = 3
    _CONNECT_DELAY = 3.0

    last_err: Exception | None = None
    for attempt in range(1, _CONNECT_RETRIES + 1):
        try:
            response = await _client.chat.completions.create(
                model=SCRIPT_MODEL,
                messages=[
                    {"role": "developer", "content": system},
                    {"role": "user", "content": user},
                ],
                reasoning_effort="medium",
                max_completion_tokens=8000,
                response_format={"type": "json_object"},
            )
            choice = response.choices[0]
            if choice.finish_reason == "length":
                logger.warning(f"{SCRIPT_MODEL} narration response truncated (usage={response.usage})")
            return choice.message.content or "{}"
        except APIConnectionError as e:
            last_err = e
            logger.warning(f"OpenAI connection error (attempt {attempt}/{_CONNECT_RETRIES}): {e}")
            if attempt < _CONNECT_RETRIES:
                await asyncio.sleep(_CONNECT_DELAY * attempt)
        except APIStatusError:
            raise

    raise RuntimeError(f"OpenAI unreachable after {_CONNECT_RETRIES} attempts: {last_err}")


def _parse_lines(raw: str, valid_keys: set[str]) -> list[NarrationLine]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"factloop_script: non-JSON response: {raw[:300]}")
        return []

    raw_lines = data.get("lines", [])
    if not isinstance(raw_lines, list):
        return []

    lines: list[NarrationLine] = []
    for item in raw_lines[:MAX_LINES]:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        text = (item.get("text") or "").strip()
        stat_key = item.get("stat_key")
        image_query = (item.get("image_query") or "").strip() or None
        if kind not in VALID_KINDS or not text:
            continue
        if kind == "stat":
            if stat_key not in valid_keys:
                continue
        else:
            stat_key = None
        lines.append(NarrationLine(kind=kind, text=text, stat_key=stat_key, image_query=image_query))
    return lines
