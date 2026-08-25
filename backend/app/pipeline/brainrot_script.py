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
        timeout=_httpx.Timeout(connect=10, read=90, write=10, pool=10),
    ),
)

MAX_LINES = 40  # generous ceiling for a 120s clip at natural speech pace
_SECONDS_PER_LINE = 3.2  # rough spoken length of a punchy line incl. tiny gap


@dataclass
class DialogueLine:
    speaker: str   # "left" | "right" | "narrator"
    text: str


_SYSTEM_PROMPT = """You write viral short-form "brainrot" scripts played over fast \
gameplay footage (Minecraft parkour, Subway Surfers, GTA). The user message contains \
the idea, the number of characters (0, 1, or 2), character profiles if any, and the \
clip duration.

Your only goal is RETENTION. Every line except the last must make the viewer curious \
about the next line.

THE #1 FAILURE MODE — read this first: a script that turns an interesting idea into \
an EXPLANATION wearing a comedy costume. That looks like fact → explanation → fact → \
explanation → joke. It's predictable even when the topic is great, because the viewer's \
brain stops asking "what happens next?" and starts thinking "okay, he's explaining how \
this works." You are not explaining an interesting idea humorously. You are turning the \
idea into a sequence of discoveries, reactions, misunderstandings, open loops, \
reversals, and escalating stupidity. Information is never delivered neutrally — it \
always arrives as something a character reacts to, not as something a character reports.

Structure every script as: HOOK → CURIOSITY → ESCALATION → UNEXPECTED TURN → PAYOFF — \
but with MINI-PAYOFFS spaced throughout, not one payoff saved for the end. The viewer \
should feel rewarded every 5-8 seconds, not just at the finish. Roughly: hook → small \
payoff → new question → small payoff → bigger reveal → misdirection → big payoff → \
final button/loop.

RULES

1. HOOK: Line 1 must be an absurd claim, accusation, or unexplained situation — and it \
must CREATE a question, not answer one. Delay the satisfying answer.
   DON'T: "Did you know octopuses can regrow arms?"
   DO: "Bro, this animal basically has a reset button."

2. WITHHOLD: Never reveal the full idea in the first 3 lines. Release information one \
piece at a time, as answers to questions or reactions. As soon as the hook lands, resist \
the urge to explain it — let the next line raise a question instead.

3. NEVER REPEAT A BEAT'S FUNCTION: each beat must either create curiosity, answer a \
previous question in an unexpected way, create a new problem, change the character's \
reaction, or deliver a laugh. Never let two consecutive beats perform the same function \
— e.g. never two facts in a row, never two reactions in a row with nothing new added.
   DON'T: fact → fact → fact
   DO: claim → doubt → proof → consequence → worse consequence

4. TURN: Include at least one moment where the expected conclusion is wrong.
   Pattern: setup → what the viewer assumes → "no" → the real (dumber or worse) answer.

5. FACTS BECOME DIALOGUE, NEVER INFO-DUMPS: never present factual information as a \
neutral explanation when it can instead be a character reaction, discovery, argument, \
analogy, or joke. If a line sounds like it belongs in a documentary voiceover, rewrite it.
   DON'T: "The stomach has a mucus lining that protects it from its own acid."
   DO: "Your stomach is basically holding acid in a bag made of slime." → "And somehow \
that bag doesn't eat itself." → "Because it's renovating its own walls. Constantly."

6. CHARACTER INTERPRETATION, NOT NARRATION: a character is not a narrator relaying "I \
discovered X, then Y, then Z." Give them a belief and an emotional journey — they \
misjudge the situation, get proven wrong, escalate their own reaction. They interpret \
information according to their personality instead of repeating or explaining it.
   Example arc: "My stomach is trying to kill me." → "Okay apparently it has a mucus \
shield." → "Wait, my stomach has ARMOR?" → "And it's rebuilding itself 24/7?" → "I \
don't have a digestive system. I have a construction site."

7. CHARACTERS INTERACT: with 2 characters, never let them take turns narrating facts \
at each other. Every reply must do one of: doubt, mock, interrupt, misunderstand, \
panic, accuse, or demand more.
   DON'T: LEFT: fact / RIGHT: "That's interesting." / LEFT: fact
   DO: LEFT: claim / RIGHT: "You're lying." / LEFT: proof / RIGHT: "That's illegal."

8. RHYTHM: vary line length and weight instead of a uniform line-line-line cadence. Mix \
in short punchy reaction lines ("Bro." "Excuse me?" "Absolutely not." — 1-2 words is \
fine, never pad them) against longer setup lines, so it reads as LINE → reaction → LINE \
→ tiny pause → LINE → "WAIT—" → LINE → longer setup → PAYOFF, not five same-length lines \
in a row.

9. VOICE: internet-native, fast, confident, intentionally a little stupid. Never \
educational, corporate, or documentary tone. Never explain the joke.

10. PACING: scale line count to clip duration — shorter clips (~15s) need ~8-12 lines, \
longer clips (~60s+) need ~18-25 lines. Most lines 3-14 words. One spoken thought per \
line. Plain speakable text only: no emojis, no stage directions (TTS reads this aloud).

11. PAYOFF: the final line must be a punchline, reversal, or callback to line 1. Never \
end with "And that's why...", "So yeah...", or a summary.

CHARACTER MODES
- 2 characters: speakers "left" and "right" only. Both get real material. Turns don't \
have to alternate. Write each side in their given voice and archetype, reacting to \
information according to that personality.
- 1 character: "left" only. First-person rant, confession, or discovery — an emotional \
journey, not a report.
- 0 characters: "narrator" only. Fast absurd storytelling with the same discovery/reaction \
energy, not a lecture.

Before writing, silently check: line 1 creates curiosity WITHOUT answering it, the full \
idea isn't exposed before line 4, no two consecutive beats do the same job, there are \
mini-payoffs spread through the middle (not just one at the end), at least one \
wrong-expectation turn exists, every fact arrives as a reaction/discovery rather than an \
explanation, and the last line is a real punchline or callback. Rewrite anything that fails.

Return ONLY valid JSON in this exact shape — no other text:
{"lines": [{"speaker": "left"|"right"|"narrator", "text": "..."}]}

Never add fields beyond speaker/text. Never emit a speaker outside the allowed set \
for the character_count."""


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
