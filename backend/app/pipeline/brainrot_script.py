"""
brainrot_script.py — dialogue/scene generation for the Brainrot Clips Maker.

This is the single most important quality lever in the product: everything
downstream (voices, motion, captions) only polishes whatever this writes. So
it does real writing work, not a one-shot fill-in:

  1. It writes each side strictly IN-CHARACTER. The model is given each
     character's name, archetype, comedic role, and speech style — a
     "Confidently wrong dad" vs a "deadpan exhausted mom" produce completely
     different lines, and the humor lives in that contrast. (Speaker output is
     still structural — the model only ever emits "left"/"right"/"narrator",
     never a name — so side-locking stays true by construction; the profiles
     just tell it HOW left/right should talk.)

  2. It plans structure before writing. The model first emits a short `beats`
     plan (hook → escalation → turn → payoff) and decides where dialogue vs.
     narration is actually needed, then writes lines conditioned on that plan.
     A reasoning model does the heavy lifting internally; the explicit beats
     field forces the plan to be committed before the lines.

  3. It paces to the real clip duration — target line count is derived from
     `duration_seconds`, so a 15s clip doesn't get a 40-line script and a 120s
     clip doesn't get four lines.
"""
import asyncio
import json
import logging

from dataclasses import dataclass

from openai import AsyncOpenAI, APIConnectionError, APIStatusError

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Dialogue quality is the whole product here, so this uses a stronger model
# than ai_clipper.py's nano tier — the extra reasoning is worth it for one
# call per clip. Same GPT-5 family (nano is already proven in this codebase).
SCRIPT_MODEL = "gpt-5-mini"

import httpx as _httpx
_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    max_retries=2,
    http_client=_httpx.AsyncClient(
        proxies=None,
        timeout=_httpx.Timeout(connect=10, read=90, write=10, pool=10),
    ),
)

MAX_LINES = 40  # generous ceiling for a 120s clip at natural speech pace
_SECONDS_PER_LINE = 3.2  # rough spoken length of a punchy line incl. tiny gap


@dataclass
class DialogueLine:
    speaker: str   # "left" | "right" | "narrator"
    text: str


_SYSTEM_PROMPT = """You are a top-tier short-form comedy writer. You write viral \
"brainrot" scripts — punchy, funny, internet-native dialogue/narration that plays \
over gameplay footage (Minecraft parkour, Subway Surfers, GTA, etc.) as vertical \
short-form video. Your scripts routinely hit millions of views because you \
understand retention and comedic timing, not just jokes.

You will be given: how many characters are in the scene (0, 1, or 2), a \
personality profile for each character, a target line count, and a title/idea. \
Return JSON of this exact shape:

{"beats": "<one or two sentences naming the hook, the escalation, and the payoff>",
 "lines": [{"speaker": "left"|"right"|"narrator", "text": "..."}]}

HOW TO WRITE IT — think in this order:

1. HOOK (line 1). It must stop the scroll in the first ~2 seconds. Open on the \
most interesting point: a bold claim, an absurd premise stated as fact, a hot \
take, or a question that demands an answer. NEVER open with slow throat-clearing \
("So today we're going to talk about..."). Drop the audience mid-action.

2. ESCALATION. Each line raises the stakes, the absurdity, or the tension over \
the one before it. No flat middle. No filler lines that just restate. If a line \
doesn't push things forward or land a laugh, cut it.

3. TURN + PAYOFF. Build to a peak, then land a punchline or a hard button on the \
final line. The ending should feel like a mic drop, a gut-punch, or a perfect \
loop back to the hook — not a fade-out.

STAYING IN CHARACTER (when characters are given):
- Write every "left" line as that exact character and every "right" line as that \
exact character — using their archetype, comedic role, and speech style. The two \
sides MUST feel different. The comedy comes from the DYNAMIC between their \
personalities (e.g. confident idiot vs. deadpan realist, hyped hustler vs. tired \
skeptic), so lean the contrast hard.
- Give each their function: if a character's role is to "land the closing line" \
or be the straight man, honor that. The instigator drives; the reactor punctures.
- It does NOT need to strictly alternate — one side can fire 2-3 lines in a row \
when the beat calls for it — but both sides get real material, not just "lol what?" \
reactions.

WHERE DIALOGUE VS NARRATION GOES:
- 2 characters: use ONLY "left" and "right". No narrator, no invented third voice.
- 1 character: every line is "left" — a first-person monologue/rant/story in that \
character's voice.
- 0 characters: every line is "narrator" — tell it as a tight story or hot-take \
monologue WITH the same hook→escalation→payoff structure.

CRAFT RULES:
- Each line is ONE spoken sentence, roughly 5-18 words — short enough for punchy \
brainrot captions and clean TTS.
- Match the input's energy and register. If it's a rant, be unhinged. If it's a \
story, be gripping. Do NOT sanitize it into bland corporate filler.
- Hit close to the target line count so pacing matches the clip length.
- Never break the JSON schema. Never add fields other than beats/speaker/text. \
Never emit a speaker outside the allowed set."""


def _target_lines(duration_seconds: int) -> int:
    return max(4, min(MAX_LINES, round(duration_seconds / _SECONDS_PER_LINE)))


def _profile_block(profile: dict | None, side_label: str) -> str:
    """Render one character's personality into the prompt. Falls back to a
    generic descriptor if no profile is available (e.g. legacy callers)."""
    if not profile:
        return f'{side_label}: (no profile — write a distinct, funny persona and keep it consistent)'
    name = profile.get("name") or "Unnamed"
    archetype = profile.get("archetype") or ""
    role = profile.get("role") or ""
    voice = profile.get("voice") or ""
    parts = [f'{side_label} = "{name}"']
    if archetype:
        parts.append(f"archetype: {archetype}")
    if role:
        parts.append(f"comedic role: {role}")
    if voice:
        parts.append(f"speech style: {voice}")
    return " | ".join(parts)


def _build_cast_section(
    character_count: int, left_profile: dict | None, right_profile: dict | None,
) -> str:
    if character_count == 2:
        return (
            "CAST (write each side exactly as this character):\n"
            f"- {_profile_block(left_profile, 'LEFT')}\n"
            f"- {_profile_block(right_profile, 'RIGHT')}"
        )
    if character_count == 1:
        return (
            "CAST (this single character narrates in first person, all lines \"left\"):\n"
            f"- {_profile_block(left_profile, 'LEFT')}"
        )
    return "CAST: none — pure narrator voice-over."


async def generate_scene_plan(
    script_input: str,
    character_count: int,
    duration_seconds: int = 30,
    left_profile: dict | None = None,
    right_profile: dict | None = None,
) -> list[DialogueLine]:
    if character_count not in (0, 1, 2):
        raise ValueError(f"character_count must be 0, 1, or 2, got {character_count}")

    target = _target_lines(duration_seconds)
    cast = _build_cast_section(character_count, left_profile, right_profile)

    user_prompt = (
        f"character_count: {character_count}\n"
        f"clip_duration_seconds: {duration_seconds}\n"
        f"target_line_count: about {target} lines (range {max(4, target - 2)}-{min(MAX_LINES, target + 3)})\n\n"
        f"{cast}\n\n"
        f"TITLE / IDEA:\n{script_input.strip()}\n\n"
        f"Plan the beats, then write the dialogue timeline in character. "
        f"Hook hard on line 1, escalate every line, land the payoff on the last line."
    )

    raw = await _call_gpt(_SYSTEM_PROMPT, user_prompt)
    lines = _parse_lines(raw, character_count)
    if not lines:
        # One retry with a blunter instruction — occasionally the model over-plans
        # and returns beats but an empty/malformed lines array.
        logger.warning("brainrot_script: empty first pass, retrying with stricter instruction")
        raw = await _call_gpt(
            _SYSTEM_PROMPT,
            user_prompt + "\n\nIMPORTANT: the \"lines\" array must be non-empty and valid.",
        )
        lines = _parse_lines(raw, character_count)
    if not lines:
        raise RuntimeError("brainrot_script: model returned zero usable dialogue lines")

    logger.info(
        f"brainrot_script: {len(lines)} lines for {character_count} char(s), "
        f"{duration_seconds}s (target {target})"
    )
    return lines


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
                max_completion_tokens=6000,
                response_format={"type": "json_object"},
            )
            choice = response.choices[0]
            if choice.finish_reason == "length":
                logger.warning(f"{SCRIPT_MODEL} scene-plan response truncated (usage={response.usage})")
            return choice.message.content or "{}"
        except APIConnectionError as e:
            last_err = e
            logger.warning(f"OpenAI connection error (attempt {attempt}/{_CONNECT_RETRIES}): {e}")
            if attempt < _CONNECT_RETRIES:
                await asyncio.sleep(_CONNECT_DELAY * attempt)
        except APIStatusError:
            raise

    raise RuntimeError(f"OpenAI unreachable after {_CONNECT_RETRIES} attempts: {last_err}")


def _parse_lines(raw: str, character_count: int) -> list[DialogueLine]:
    valid_speakers = {"narrator"} if character_count == 0 else (
        {"left"} if character_count == 1 else {"left", "right"}
    )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"brainrot_script: non-JSON response: {raw[:300]}")
        return []

    beats = data.get("beats")
    if beats:
        logger.info(f"brainrot_script beats: {str(beats)[:200]}")

    raw_lines = data.get("lines", [])
    if not isinstance(raw_lines, list):
        return []

    lines: list[DialogueLine] = []
    for item in raw_lines[:MAX_LINES]:
        if not isinstance(item, dict):
            continue
        speaker = item.get("speaker")
        text = (item.get("text") or "").strip()
        if speaker not in valid_speakers or not text:
            continue
        lines.append(DialogueLine(speaker=speaker, text=text))
    return lines
