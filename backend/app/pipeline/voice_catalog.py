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

def get_voice(provider: str, voice_id: str) -> Voice | None:
    return _BY_KEY.get(f"{provider}:{voice_id}")


_BY_VOICE_ID: dict[str, Voice] = {v.voice_id: v for v in VOICES}


def find_voice(voice_id: str) -> Voice | None:
    """Resolve a Voice from just its voice_id, regardless of provider —
    the combined picker (Studio) shows all 33 voices from both providers
    in one flat list with no provider selector, so callers downstream of
    a user's pick (TTS synthesis, sample lookup) need to recover which
    provider that voice_id actually belongs to. Exact, case-sensitive
    match — voice_id casing differs by provider by construction (e.g.
    UnrealSpeech "Daniel" vs Lemonfox "daniel" are deliberately distinct
    strings), so this never collides across the two catalogs today, but
    if a future addition ever makes two providers share an exact voice_id
    string, this returns whichever was added to VOICES first."""
    return _BY_VOICE_ID.get(voice_id)


# Every voice, grouped by gender, across BOTH providers — the "combine
# them, don't show as separate providers" pool used by
# default_voice_for_gender below. Order is deterministic (insertion order
# of VOICES) so slot-rotation is stable across calls/deploys.
_ALL_BY_GENDER: dict[str, list[Voice]] = {"male": [], "female": [], "neutral": []}
for _v in VOICES:
    _ALL_BY_GENDER.setdefault(_v.gender, []).append(_v)


def default_voice_for_gender(gender: str, slot: int = 0) -> Voice:
    """Auto-assign a fitting voice when the user leaves a character on
    "Auto voice" — gender-matched, drawn from the FULL combined catalog
    (both providers) so two same-gender characters still get genuinely
    different-sounding defaults, not just a rotation within one provider's
    5-voice UnrealSpeech subset. slot rotates left=0/right=1."""
    options = _ALL_BY_GENDER.get(gender) or _ALL_BY_GENDER["neutral"]
    return options[slot % len(options)]


def list_voices(provider: str | None = None, locale: str | None = None) -> list[Voice]:
    result = VOICES
    if provider:
        result = [v for v in result if v.provider == provider]
    if locale:
        result = [v for v in result if v.locale == locale]
    return result
