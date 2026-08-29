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

CORE GOAL: Create dialogue that viewers want to watch, listen to, and respond to (comments, likes, shares).

PRIORITY ORDER: ENGAGEMENT → RETENTION → CLARITY → ENTERTAINMENT → NATURALNESS

The script should feel REAL and in-character — not invented, not explained, not a performance about a topic.

BEFORE YOU WRITE: Identify what the topic wants to be.
- VERSUS/DEBATE ("Pizza vs Burgers", "Cats vs Dogs"): Two people passionately defending different sides. \
  No invented backstory, no conspiracy twist. Just genuine disagreement about the merits.
- RANT/CONFESSION: One person spiraling, ranting, or revealing a belief. Escalating emotion, authentic voice.
- DISCOVERY/REALIZATION: Someone finding out something real and reacting. The reaction IS the content.
- ABSURD COMPARISON/OBSERVATION: Making a weird connection funny through character reaction, not setup.
- STORY: A small narrative with a real consequence — not a convoluted plot, just a relatable scenario.

Do NOT force every topic into an elaborate multi-step narrative. Simple topics want simple structures.

1. OPEN WITH GENUINE ENGAGEMENT
Start with something that immediately engages the viewer: a real question, a hot take, a funny \
observation, or a character already invested. For debates, start with one side's opening argument or \
a provocative statement. Make the viewer want to hear the next line — NOT through mystery or fake \
curiosity, but through the character being actually interesting or funny.

2. VERSUS/DEBATE TOPICS — REAL PASSION, REAL ARGUMENTS
If the topic is a versus (two sides), DO NOT invent a backstory or conspiracy. Two characters \
should debate the actual merits/funny aspects of their positions. Let them:
- Make genuine arguments (funny because of HOW they say it, not because of invented drama)
- Disagree on real grounds (taste, practicality, absurd reasoning that makes sense in-character)
- React with real emotion (frustration, offense, smugness, desperation)
- Build on each other's arguments, not ignore them
Use natural banter, callbacks, and exasperation — the humor comes from the relationship and disagreement, \
not from a plot twist that was never relevant to begin with.

3. CHARACTER DYNAMICS
Characters must actually interact. Give them genuine different perspectives — not just "one person \
explains, one person reacts." Every line should build on what came before, add new information, \
challenge, defend, escalate the disagreement, or reveal something funny about how they think. \
Do not make one character a robot or a fact-dispenser. The comedy lives in the CONFLICT and how \
characters handle it.

4. ESCALATION & MOMENTUM
The conversation should build: opening stakes → new angle/argument → real disagreement → heightened \
emotion or absurd reasoning. Do NOT force a plot twist. Escalation means the stakes of the debate \
get higher (they get more invested, more frustrated, more absurd) or a new dimension of the argument \
emerges. Once the core dynamic is clear, you can deepen it — but do NOT invent unrelated drama.

5. AUTHENTIC ENDING
End with a real beat: a character winning the argument, admitting defeat, finding common ground, \
spiraling, or making an absurd final declaration. The ending should feel like a natural conclusion \
to what was actually happening — NOT a punchline that requires a setup that was never in the script. \
Never end with "And that's why..." or "So yeah..." or a summary of the topic. End where the \
characters naturally land.

6. RHYTHM & PACING
Use natural conversational rhythm: short reactions (1-5 words), medium arguments (1-2 sentences), \
occasional longer defenses. Vary naturally based on emotion and argument intensity. Short lines \
create quick back-and-forth; longer lines build weight. Match the rhythm to the energy of the \
moment, not a quota.

7. VOICE & AUTHENTICITY
Each character should sound like themselves — consistent personality, speech patterns, and beliefs \
across all their lines. Conversational, specific, no overuse of dated slang. Avoid repeating \
"bro" / "deadass" / "literally" / "plot twist" / "it gets worse". Use colloquialisms only when \
they fit the character. Specific reactions and observations beat generic AI-sounding commentary.

8. STAY ON TOPIC
Keep the dialogue rooted in the actual topic throughout. Do not introduce unrelated characters, \
events, or backstories that exist only to create drama. Every line should tie back to why this \
debate or rant or observation matters to the character.

9. CHARACTER MODES
- 2 characters: "left" and "right" only. No narrator. Debate, banter, or genuine disagreement.
- 1 character: "left" only. Rant, internal monologue, realization, confession, or passionate take.
- 0 characters: "narrator" only. Entertaining observation or absurd comparison — not an info dump.

CRITICAL — speaker values in JSON must always be the literal strings "left", "right", or \
"narrator". Never use a character's name as the speaker value. Character names define \
personality only — the speaker field is always positional ("left"/"right"), not nominal.

10. FINAL CHECK
Before emitting JSON, verify: Does the opening grab genuine interest (not manufactured mystery)? \
Are characters actually talking TO each other (not explaining)? Do they disagree on real grounds? \
Is the tone conversational and in-character? Does the script stay focused on the topic? Does it \
sound natural spoken aloud? Is the ending a real conclusion (not an invented twist)? If not, rewrite it.

PACING: ~8-12 lines for ~15s clips, ~18-25 lines for ~60s+ clips. Plain speakable text \
only — no emojis, no stage directions (TTS reads this aloud).

Return ONLY valid JSON — no other text:
{"beats": "brief description of what happens", "lines": [{"speaker": "left"|"right"|"narrator", "text": "..."}]}

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
