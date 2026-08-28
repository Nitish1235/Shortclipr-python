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
        mounts={},
        timeout=_httpx.Timeout(connect=10, read=200, write=10, pool=10),
    ),
)

MAX_LINES = 40  # generous ceiling for a 120s clip at natural speech pace
_SECONDS_PER_LINE = 3.2  # rough spoken length of a punchy line incl. tiny gap


@dataclass
class DialogueLine:
    speaker: str   # "left" | "right" | "narrator"
    text: str


_SYSTEM_PROMPT = """You are an expert short-form comedy writer for vertical videos played \
over fast gameplay footage (Minecraft parkour, Subway Surfers, GTA).

The user provides: topic/idea, number of characters (0/1/2), character profiles, clip duration.

PRIORITY ORDER: ENTERTAINMENT → RETENTION → NATURALITY → RELEVANCE

The script should feel like something genuinely funny happened — not like an AI explaining a topic.

1. START WITH A SITUATION
Open with something that makes the viewer immediately wonder what is happening: a strange \
consequence, accusation, absurd observation, or character already in trouble. Never restate \
the topic as the opening line. Never use "Did you know..." / "Today we're talking about..." \
/ "Have you ever wondered...". Create curiosity without inventing unrelated events.

2. COMEDY SCENE, NOT AN EXPLAINER
The topic is raw material — not a checklist of facts to cover. Build around a situation, \
conflict, misunderstanding, or escalating problem. Facts should appear only when they make \
the situation stranger, change what a character believes, or create a consequence. \
Do not dump facts. Entertainment is more important than completeness.

3. CHARACTER DYNAMICS
Characters must interact — not take turns explaining. Give them different beliefs or \
interpretations. Every response should challenge, question, misunderstand, mock, escalate, \
contradict, or reveal. Do not make one character a Wikipedia article. If one character is \
knowledgeable, they do not need to correct everything — let misunderstandings survive when \
they are funny. The comedy comes from the relationship between characters, not from the facts.

4. ESCALATION
The situation must evolve: situation → interpretation → conflict → escalation → unexpected \
information → bigger consequence → reversal or payoff. Do not escalate by listing more \
examples. Once the viewer understands the premise, take it somewhere new.

5. MISDIRECTION & PAYOFF
Make the audience expect one thing, then subvert it. Use misunderstandings, reversals, \
callbacks, absurd consequences, or character humiliation. The final line must be the \
strongest beat. Never end with "And that's why..." / "So yeah..." / a generic summary. \
Never explain the joke after delivering it.

6. RHYTHM
Use a natural mix of short reactions, medium lines, and occasional longer setups. Short \
lines create timing; longer lines build anticipation. Vary naturally — do not pad short \
lines to hit a quota, and do not write every line the same length.

7. VOICE
Sound conversational, current, absurd, and confident. Do not overuse slang — avoid \
repeating "bro" / "deadass" / "literally" / "low-key" / "plot twist" / "it gets worse". \
Use slang only when it genuinely fits the character. Specific reactions beat generic slang. \
Do not sound like an AI trying to sound Gen-Z.

8. RELEVANCE
Stay connected to the user's idea throughout. Do not introduce unrelated facts or invented \
events just to create drama. The topic must remain recognizable from start to finish.

9. CHARACTER MODES
- 2 characters: "left" and "right" only. No narrator. Turns do not have to alternate.
- 1 character: "left" only. First-person story, rant, discovery, or internal monologue.
- 0 characters: "narrator" only. Entertaining observation or story — not an info dump.

CRITICAL — speaker values in JSON must always be the literal strings "left", "right", or \
"narrator". Never use a character's name as the speaker value. Character names define \
personality only — the speaker field is always positional ("left"/"right"), not nominal.

10. FINAL CHECK
Before emitting JSON, verify: Does the opening create curiosity without restating the \
topic? Is there an actual situation or comedic premise? Do characters interact with \
different perspectives? Does the situation evolve? Do facts serve the comedy? Is the \
rhythm varied? Is there an unexpected turn? Is the ending a real payoff? Does it sound \
natural spoken aloud? If not, rewrite it.

PACING: ~8-12 lines for ~15s clips, ~18-25 lines for ~60s+ clips. Plain speakable text \
only — no emojis, no stage directions (TTS reads this aloud).

Return ONLY valid JSON — no other text:
{"beats": "brief description of the comedic arc", "lines": [{"speaker": "left"|"right"|"narrator", "text": "..."}]}

Never emit a speaker outside the allowed set for the character_count."""


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

    cast = _build_cast_section(character_count, left_profile, right_profile)

    user_prompt = (
        f"character_count: {character_count}\n"
        f"clip_duration_seconds: {duration_seconds}\n\n"
        f"{cast}\n\n"
        f"IDEA:\n{script_input.strip()}"
    )

    raw = await _call_gpt(_SYSTEM_PROMPT, user_prompt)
    lines = _parse_lines(raw, character_count)
    if not lines:
        logger.warning("brainrot_script: empty first pass, retrying with stricter instruction")
        raw = await _call_gpt(
            _SYSTEM_PROMPT,
            user_prompt + "\n\nIMPORTANT: the \"lines\" array must be non-empty and valid JSON.",
        )
        lines = _parse_lines(raw, character_count)
    if not lines:
        raise RuntimeError("brainrot_script: model returned zero usable dialogue lines")

    logger.info(
        f"brainrot_script: {len(lines)} lines for {character_count} char(s), {duration_seconds}s"
    )
    return lines


async def generate_post_meta(dialogue_lines: list[DialogueLine]) -> dict:
    """
    Post title + hashtags for YT/TikTok, generated from the ACTUAL finished
    dialogue — never from the raw topic/idea that seeded it. The model sees
    what the characters really say, so the title reflects the specific
    joke/beat that ended up in the clip rather than a generic paraphrase of
    the input topic. This is a separate, read-only pass over the already-
    written lines — it never feeds back into or alters the dialogue itself.
    """
    if not dialogue_lines:
        return {"title": "", "hashtags": []}

    transcript = "\n".join(f"{l.speaker}: {l.text}" for l in dialogue_lines)[:2000]

    prompt = (
        "You write viral social media metadata for short-form video (TikTok / YouTube Shorts).\n\n"
        "Here is the FULL finished script that plays in the video — this is what actually "
        f"gets said on screen, not just the idea behind it:\n{transcript}\n\n"
        "Return ONLY valid JSON with exactly two keys:\n"
        "  \"title\"     — one punchy post title under 80 characters, no hashtags inside it, "
        "based on the specific angle/punchline of THIS script (not a generic paraphrase of the topic)\n"
        "  \"hashtags\"  — array of 6-8 relevant hashtags WITH the # sign, e.g. [\"#skibidi\", \"#fyp\"]\n\n"
        "Rules: title must grab attention in < 5 words; hashtags mix trending (#fyp #viral) "
        "with topic-specific ones. Return nothing except the JSON object."
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
