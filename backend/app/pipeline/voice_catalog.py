"""
voice_catalog.py — Static catalog of available TTS voices for both providers.

Each entry carries the exact API parameter value, a human label, gender tag,
and locale — enough for the frontend voice picker and the admin sample
generator to iterate without hitting the provider APIs for discovery.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Voice:
    voice_id: str
    provider: str
    locale: str
    label: str
    gender: str


VOICES: list[Voice] = [
    # ── UnrealSpeech (5 voices, English only) ────────────────────
    # Previous voice_ids (Dan/Will/Scarlett/Liv/Amy) were removed/renamed by
    # UnrealSpeech at some point — every one now 400s with "Invalid VoiceId"
    # (see the admin voice-sample-generation logs). Replaced with 5 from
    # their current allowed list. Gender tags are inferred from the name —
    # UnrealSpeech's error response lists valid IDs but not genders — so
    # worth a listen via the admin "Generate voice samples" tool after
    # deploying to confirm they sound right, not just that they're accepted.
    Voice("Ethan",     "unrealspeech", "en-US", "Ethan",     "male"),
    Voice("Daniel",    "unrealspeech", "en-US", "Daniel",    "male"),
    Voice("Charlotte", "unrealspeech", "en-US", "Charlotte", "female"),
    Voice("Emily",     "unrealspeech", "en-US", "Emily",     "female"),
    Voice("Amelia",    "unrealspeech", "en-US", "Amelia",    "female"),

    # ── Lemonfox — English US ────────────────────────────────────
    Voice("heart",    "lemonfox", "en-US", "Heart",    "female"),
    Voice("bella",    "lemonfox", "en-US", "Bella",    "female"),
    Voice("jessica",  "lemonfox", "en-US", "Jessica",  "female"),
    Voice("nicole",   "lemonfox", "en-US", "Nicole",   "female"),
    Voice("nova",     "lemonfox", "en-US", "Nova",     "female"),
    Voice("sarah",    "lemonfox", "en-US", "Sarah",    "female"),
    Voice("skye",     "lemonfox", "en-US", "Skye",     "female"),
    Voice("alloy",    "lemonfox", "en-US", "Alloy",    "neutral"),
    Voice("aoede",    "lemonfox", "en-US", "Aoede",    "female"),
    Voice("kore",     "lemonfox", "en-US", "Kore",     "female"),
    Voice("rivers",   "lemonfox", "en-US", "Rivers",   "neutral"),
    Voice("michael",  "lemonfox", "en-US", "Michael",  "male"),
    Voice("echo",     "lemonfox", "en-US", "Echo",     "male"),
    Voice("eric",     "lemonfox", "en-US", "Eric",     "male"),
    Voice("fenrir",   "lemonfox", "en-US", "Fenrir",   "male"),
    Voice("liam",     "lemonfox", "en-US", "Liam",     "male"),
    Voice("onyx",     "lemonfox", "en-US", "Onyx",     "male"),
    Voice("puck",     "lemonfox", "en-US", "Puck",     "male"),
    Voice("adams",    "lemonfox", "en-US", "Adams",    "male"),
    Voice("santa",    "lemonfox", "en-US", "Santa",    "male"),

    # ── Lemonfox — English GB ────────────────────────────────────
    Voice("alice",    "lemonfox", "en-GB", "Alice",    "female"),
    Voice("emma",     "lemonfox", "en-GB", "Emma",     "female"),
    Voice("isabella", "lemonfox", "en-GB", "Isabella", "female"),
    Voice("lily",     "lemonfox", "en-GB", "Lily",     "female"),
    Voice("daniel",   "lemonfox", "en-GB", "Daniel",   "male"),
    Voice("fable",    "lemonfox", "en-GB", "Fable",    "male"),
    Voice("george",   "lemonfox", "en-GB", "George",   "male"),
    Voice("lewis",    "lemonfox", "en-GB", "Lewis",    "male"),
]

_BY_KEY: dict[str, Voice] = {f"{v.provider}:{v.voice_id}": v for v in VOICES}

SAMPLE_TEXT = "Hey, what's up? This is how I sound when I'm talking in your brainrot clips. Pretty cool, right?"

# Default voice per (provider, gender). Used to auto-assign a fitting voice
# when the user doesn't hand-pick one — a female-presenting character gets a
# female voice, etc. "neutral" (creatures/bots/objects) leans on a
# distinctive, non-gendered-sounding pick. Rotation lists give left vs. right
# characters different voices even at the same gender, so a two-character clip
# never has both sides sounding identical.
DEFAULT_VOICES_BY_GENDER: dict[str, dict[str, list[str]]] = {
    "unrealspeech": {
        "male":    ["Ethan", "Daniel"],
        "female":  ["Charlotte", "Emily", "Amelia"],
        "neutral": ["Daniel", "Charlotte"],
    },
    "lemonfox": {
        "male":    ["michael", "eric", "liam", "onyx", "fenrir"],
        "female":  ["sarah", "bella", "nova", "jessica", "nicole"],
        "neutral": ["puck", "alloy", "rivers", "fenrir"],
    },
}


def get_voice(provider: str, voice_id: str) -> Voice | None:
    return _BY_KEY.get(f"{provider}:{voice_id}")


def list_voices(provider: str | None = None, locale: str | None = None) -> list[Voice]:
    result = VOICES
    if provider:
        result = [v for v in result if v.provider == provider]
    if locale:
        result = [v for v in result if v.locale == locale]
    return result


def default_voice_for(provider: str, gender: str, slot: int = 0) -> str:
    """Pick a fitting voice_id for a character's gender.

    provider: "unrealspeech" | "lemonfox"
    gender:   "male" | "female" | "neutral" (falls back to neutral)
    slot:     0 for the first/left character, 1 for the second/right — rotates
              through the gender's voice list so two same-gender characters
              still get distinct voices.
    """
    by_gender = DEFAULT_VOICES_BY_GENDER.get(provider, DEFAULT_VOICES_BY_GENDER["unrealspeech"])
    options = by_gender.get(gender) or by_gender["neutral"]
    return options[slot % len(options)]
