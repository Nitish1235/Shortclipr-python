"""
captions.py — Step 7 of the ShortClipr pipeline.

Word-level caption generation with 11 trending styles, 7 colour combos,
9 positions, and proper ASS animation tags.

──────────────────────────────────────────────────────────────────────
STYLES
──────────────────────────────────────────────────────────────────────
  minimal     — Clean static white text, subtle shadow, phrase-level
  fade        — Smooth 400 ms fade-in / fade-out, phrase-level
  word_pop    — Word-by-word bounce  (80 % → 115 % → 100 % scale)
  typewriter  — Words appear one-at-a-time with quick fade, left→right
  slide       — Each word slides in from the left edge
  zoom        — Phrases scale up from 50 % on appear
  shake       — Phrases appear with rapid rotation wiggle (emphasis)
  karaoke     — All words in one line; ASS \kf sweeps white → yellow
  hormozi     — 2-3 words ALL CAPS, opaque box background (Alex Hormozi)
  mrbeast     — 3-4 words, giant text, bounce energy
  neon        — Phrases with coloured glow-blur outline

──────────────────────────────────────────────────────────────────────
COLOUR COMBOS
──────────────────────────────────────────────────────────────────────
  white_black / yellow_black / black_white /
  green_dark  / orange_dark  / cyan_dark   / red_white

──────────────────────────────────────────────────────────────────────
POSITION  (h_align × v_align)
──────────────────────────────────────────────────────────────────────
  h_align : left | center | right
  v_align : top  | center | bottom

──────────────────────────────────────────────────────────────────────
WORDS PER LINE  (user choice 1 / 2 / 3)
──────────────────────────────────────────────────────────────────────
  1 → one word at a time  (most impactful, slowest reading pace)
  2 → two words at a time  (balanced, very popular on TikTok)
  3 → three words at a time  (default, natural speech rhythm)

  Applies globally across ALL styles. Every phrase-level style
  honours this limit. Word-by-word styles (word_pop, typewriter,
  slide) group words into chunks of this size.

ASS colours: &HAABBGGRR  (alpha, blue, green, red — NOT RGB order)
"""

import asyncio
import logging
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.pipeline.title_box import (
    DEFAULT_TITLE_BG, DEFAULT_TITLE_BG_OPACITY, DEFAULT_TITLE_TEXT_COLOR,
    TITLE_TEXT_COLORS, overlay_xy, render_title_box_png,
)
from app.pipeline.transcript import TranscriptEntry

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Data model ─────────────────────────────────────────────────

@dataclass
class Caption:
    start: float       # seconds relative to clip start (0 = clip begins)
    end:   float
    text:  str


# ══════════════════════════════════════════════════════════════
#  COLOUR COMBOS
#  ASS format: &HAABBGGRR   (00 alpha = fully opaque)
# ══════════════════════════════════════════════════════════════

COLOR_COMBOS: dict[str, dict[str, str]] = {
    "white_black": {
        "primary":   "&H00FFFFFF",   # white
        "secondary": "&H0000FFFF",   # yellow  (karaoke active)
        "outline":   "&H00000000",   # black
        "back":      "&H99000000",   # semi-transparent black box
        "highlight": "&H0000FFFF",   # yellow
        "solid_back": "&H00000000",  # opaque black — straddle/title box backing
    },
    "yellow_black": {
        "primary":   "&H0000FFFF",   # yellow
        "secondary": "&H00FFFFFF",   # white
        "outline":   "&H00000000",   # black
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "black_white": {
        "primary":   "&H00000000",   # black
        "secondary": "&H000000FF",   # red
        "outline":   "&H00FFFFFF",   # white
        "back":      "&H99FFFFFF",
        "highlight": "&H000000FF",
        "solid_back": "&H00FFFFFF",  # opaque white
    },
    "green_dark": {
        "primary":   "&H0000FF00",   # lime
        "secondary": "&H00FFFFFF",
        "outline":   "&H00003200",   # dark green
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "orange_dark": {
        "primary":   "&H000080FF",   # orange
        "secondary": "&H00FFFFFF",
        "outline":   "&H00002060",   # dark brown
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "cyan_dark": {
        "primary":   "&H00FFFF00",   # cyan
        "secondary": "&H00FFFFFF",
        "outline":   "&H00800000",   # dark navy
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "red_white": {
        "primary":   "&H000000FF",   # red
        "secondary": "&H0000FFFF",   # yellow
        "outline":   "&H00FFFFFF",   # white
        "back":      "&H99000000",
        "highlight": "&H0000FFFF",
        "solid_back": "&H00FFFFFF",
    },
    # ── Trending 2026 combos (see captions.py module docstring) ──────────
    "butter_yellow": {
        "primary":   "&H006CE1F8",   # butter yellow — dominant 2026 overlay trend
        "secondary": "&H00FFFFFF",
        "outline":   "&H00202020",   # soft dark grey, not harsh black
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "hot_pink_black": {
        "primary":   "&H009314FF",   # hot pink
        "secondary": "&H00FFFFFF",
        "outline":   "&H00000000",
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",
    },
    "electric_blue_white": {
        "primary":   "&H00FF8000",   # electric blue
        "secondary": "&H00000000",
        "outline":   "&H00FFFFFF",
        "back":      "&H99FFFFFF",
        "highlight": "&H00000000",
        "solid_back": "&H00FFFFFF",
    },
    # ── Clean, monochrome combos — no clashing accent outline ────────────
    "pure_white": {
        "primary":   "&H00FFFFFF",   # white
        "secondary": "&H00FFFFFF",   # white (no flashy karaoke swap)
        "outline":   "&H00000000",   # black
        "back":      "&H99000000",
        "highlight": "&H00FFFFFF",
        "solid_back": "&H00000000",  # opaque black box
    },
    "gold_premium": {
        "primary":   "&H0000D7FF",   # gold
        "secondary": "&H00FFFFFF",
        "outline":   "&H00000000",   # black
        "back":      "&H99000000",
        "highlight": "&H0000D7FF",
        "solid_back": "&H00000000",
    },
    "ice_blue": {
        "primary":   "&H00FFE5C8",   # soft ice blue
        "secondary": "&H00FFFFFF",
        "outline":   "&H00101010",   # near-black
        "back":      "&H99000000",
        "highlight": "&H00FFE5C8",
        "solid_back": "&H00000000",
    },
}

DEFAULT_COLOR = "yellow_black"

# Hook title card — shown for the first N seconds of every clip, burned
# from ClipTimestamp.title (the AI-generated 5-6 word curiosity-gap hook).
# Bumped from 1.8s -> 2.6s: a 5-6 word title needs more reading time than
# the old shorter "punchy" titles did.
HOOK_TITLE_DURATION = 2.6

# Templates that render their own background treatment (blur strip / bars /
# frame) around the video — the hook title for these straddles the boundary
# between that background and the actual video, with a SOLID/opaque box.
# Everything else (crop_fill, and any future fill-style template) is treated
# as "fill": the video occupies the whole canvas, so the hook title gets a
# translucent "glass" box instead, since there's no bar to straddle.
TEMPLATE_HAS_BARS = {
    "blur_bg", "zoom_blur", "glass", "color_bars",
}

# Approximate Y (PlayResY=1920 units) of the bar/video boundary for
# TEMPLATE_HAS_BARS templates, derived from extractor.py's _fg_geometry()
# for a typical 16:9 source — close enough across templates that a single
# straddle point looks correct without per-template plumbing.
_BAR_BOUNDARY_Y = 656


# ══════════════════════════════════════════════════════════════
#  POSITION PRESETS  (x, y, ASS alignment code)
#  PlayRes: 1080 × 1920
#  Alignment: 1=BL 2=BC 3=BR  4=ML 5=MC 6=MR  7=TL 8=TC 9=TR
# ══════════════════════════════════════════════════════════════

_POS: dict[str, tuple[int, int, int]] = {
    "top_left":      (80,   220,  7),
    "top_center":    (540,  220,  8),
    "top_right":     (1000, 220,  9),
    "center_left":   (80,   960,  4),
    "center":        (540,  960,  5),
    "center_right":  (1000, 960,  6),
    # Raised from y=1720 (only ~200px above the bottom edge — too close to
    # platform UI chrome / safe-area on most players) to y=1580.
    "bottom_left":   (80,   1580, 1),
    "bottom_center": (540,  1580, 2),
    "bottom_right":  (1000, 1580, 3),
}


def _resolve_pos(h_align: str, v_align: str) -> tuple[int, int, int]:
    h = (h_align or "center").lower().strip()
    v = (v_align or "bottom").lower().strip()
    key = "center" if (v == "center" and h == "center") else f"{v}_{h}"
    return _POS.get(key, _POS["bottom_center"])


# ══════════════════════════════════════════════════════════════
#  FONT OPTIONS — bundled in backend/app/assets/fonts/, registered
#  with fontconfig in the Dockerfile (fc-cache). Family names below
#  must match each .ttf's internal name-table family name exactly.
# ══════════════════════════════════════════════════════════════

FONT_OPTIONS: dict[str, str] = {
    "default":       "Liberation Sans",
    "montserrat":    "Montserrat ExtraBold",   # most-used 2026 caption font
    "archivo_black": "Archivo Black",          # heavy geometric — Hormozi/MrBeast feel
    "anton":         "Anton",                  # ultra-condensed bold display
    "bebas_neue":    "Bebas Neue",             # tall condensed — word_pop/karaoke punch
    "poppins":       "Poppins ExtraBold",      # rounder, friendlier bold
    "jakarta":       "Plus Jakarta Sans ExtraBold",  # modern, clean SaaS-y bold
}
DEFAULT_FONT = "default"
VALID_FONTS  = list(FONT_OPTIONS.keys())


# ══════════════════════════════════════════════════════════════
#  ASS STYLE DEFINITIONS
#  Format: Name,Font,Size,Primary,Secondary,Outline,Back,
#           Bold,Italic,Underline,Strike,ScaleX,ScaleY,
#           Spacing,Angle,BorderStyle,Outline,Shadow,
#           Alignment,MarginL,MarginR,MarginV,Encoding
# ══════════════════════════════════════════════════════════════

# Colours are placeholders — overridden per-combo in _style_line()
_BASE_STYLES: dict[str, dict] = {
    "minimal": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=4, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "fade": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=4, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "word_pop": dict(
        font="Liberation Sans", size=84, bold=1,
        border_style=1, outline=5, shadow=0,
        scale_x=100, scale_y=100, spacing=1,
    ),
    "typewriter": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=4, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "slide": dict(
        font="Liberation Sans", size=80, bold=1,
        border_style=1, outline=4, shadow=0,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "zoom": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=3, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "shake": dict(
        font="Liberation Sans", size=80, bold=1,
        border_style=1, outline=4, shadow=0,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "karaoke": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=4, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "hormozi": dict(
        font="Liberation Sans", size=88, bold=1,
        border_style=3, outline=10, shadow=0,   # BorderStyle 3 = opaque box
        scale_x=100, scale_y=100, spacing=2,
    ),
    "mrbeast": dict(
        font="Liberation Sans", size=96, bold=1,
        border_style=1, outline=5, shadow=2,
        scale_x=100, scale_y=100, spacing=0,
    ),
    "neon": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=5, shadow=0,
        scale_x=100, scale_y=100, spacing=1,
    ),
    # "None" — user explicitly wants no burned-in subtitles at all.
    # Style row is harmless boilerplate; _lines_none() emits zero events.
    "none": dict(
        font="Liberation Sans", size=76, bold=1,
        border_style=1, outline=4, shadow=1,
        scale_x=100, scale_y=100, spacing=0,
    ),
}


def _style_line(style: str, color: str, alignment: int, font: str = DEFAULT_FONT) -> str:
    """Build one ASS [V4+ Styles] Style: line for the given style+colour+font."""
    cfg = _BASE_STYLES.get(style, _BASE_STYLES["minimal"])
    clr = COLOR_COMBOS.get(color, COLOR_COMBOS[DEFAULT_COLOR])
    font_name = FONT_OPTIONS.get(font, FONT_OPTIONS[DEFAULT_FONT])

    primary   = clr["primary"]
    secondary = clr["secondary"]
    outline_c = clr["outline"]
    back_c    = clr["back"]

    # For hormozi the box BG is the "back" colour (used as shadow/fill colour)
    # BorderStyle 3: BackColour fills the box, OutlineColour is the box border
    if style == "hormozi":
        back_c = clr.get("highlight", "&H0000FFFF")

    return (
        f"Style: Default,"
        f"{font_name},"
        f"{cfg['size']},"
        f"{primary},{secondary},{outline_c},{back_c},"
        f"{cfg['bold']},0,0,0,"
        f"{cfg['scale_x']},{cfg['scale_y']},"
        f"{cfg['spacing']},0,"
        f"{cfg['border_style']},"
        f"{cfg['outline']},"
        f"{cfg['shadow']},"
        f"{alignment},"
        f"40,40,40,1"
    )


def _with_alpha(ass_color: str, alpha_hex: str) -> str:
    """Swap the alpha byte of an &HAABBGGRR colour string (00 = opaque, FF = transparent)."""
    body = ass_color[2:]
    if len(body) == 8:
        body = body[2:]
    return f"&H{alpha_hex}{body}"


def compute_hook_duration(title_permanent: bool, clip_duration: float) -> float:
    """Shared by build_ass_content() and the title-box overlay (extractor.py)
    so both agree on exactly how long the hook title stays on screen."""
    return clip_duration if (title_permanent and clip_duration > 0) else HOOK_TITLE_DURATION


def _hook_position(template: str) -> tuple[int, int, int]:
    """
    (x, y, alignment) for the hook-title card, depending on whether
    `template` renders its own bars/blur around the video.

    Bar templates: straddle the bar/video boundary — alignment 5
    (middle-center anchor) centred exactly on the boundary line, so the
    box sits half on the bar, half on the clip.

    Fill templates (crop_fill, etc.): no boundary to straddle — pinned
    near the top of the frame instead, alignment 8 (top-center anchor).
    """
    if template in TEMPLATE_HAS_BARS:
        return 540, _BAR_BOUNDARY_Y, 5
    return 540, 230, 8


def _hex_to_ass_color(hex_color: str) -> str:
    """'#RRGGBB' -> ASS '&H00BBGGRR' (00 = fully opaque)."""
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def _auto_contrast_outline(hex_color: str) -> str:
    """Pick a black or white ASS outline colour based on text luminance,
    so the outline always reads against any background — the box (if any)
    is a separate rounded PNG overlay now, not an ASS BackColour box."""
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return "&H00FFFFFF" if luminance < 140 else "&H00000000"


def _hook_style_line(title_color: str, template: str, font: str = DEFAULT_FONT) -> str:
    """
    ASS style for the hook-title card — bold ALL CAPS text, `title_color`
    independent of the caption colour combo. BorderStyle is always 1
    (outline only, no ASS box) — a rounded-rect background (if the user
    picked one) is rendered as a separate PNG and composited via ffmpeg
    `overlay` BEHIND this text layer (see title_box.py / extractor.py),
    since libass's BorderStyle 3 box can't do rounded corners.
    """
    font_name = FONT_OPTIONS.get(font, FONT_OPTIONS[DEFAULT_FONT])
    primary = _hex_to_ass_color(title_color)
    outline_c = _auto_contrast_outline(title_color)
    _, _, alignment = _hook_position(template)

    return (
        f"Style: Hook,"
        f"{font_name},60,"
        f"{primary},{primary},{outline_c},&H00000000,"
        f"1,0,0,0,"
        f"100,100,"
        f"1,0,"
        f"1,"     # BorderStyle 1 — outline only, no ASS box
        f"6,"     # Outline width
        f"2,"     # Shadow
        f"{alignment},"
        f"60,60,90,1"
    )


# ══════════════════════════════════════════════════════════════
#  WORD / PHRASE SPLITTING
# ══════════════════════════════════════════════════════════════

def _split_words(cap: Caption, wpl: int = 1) -> list[Caption]:
    """
    Split one Caption into chunks of `wpl` words with character-weighted timing.

    The last chunk's end is always snapped to cap.end to prevent float drift.
    Enforces MIN_CHUNK_DUR so animations have enough time to complete visually.
    """
    MIN_CHUNK_DUR = 0.12          # 120 ms — minimum visible window per chunk
    words = cap.text.split()
    if not words:
        return []

    chunks = [words[i:i + wpl] for i in range(0, len(words), wpl)]
    if len(chunks) == 1:
        return [Caption(start=cap.start, end=cap.end, text=" ".join(chunks[0]))]

    total_chars = sum(len(w) for w in words) or 1
    total_dur   = max(cap.end - cap.start, MIN_CHUNK_DUR * len(chunks))

    # Character-weighted raw durations
    raw = [(sum(len(w) for w in c) / total_chars) * total_dur for c in chunks]

    # Enforce minimum display time — scale down proportionally if needed
    if any(d < MIN_CHUNK_DUR for d in raw):
        raw = [max(d, MIN_CHUNK_DUR) for d in raw]
        total_raw = sum(raw)
        if total_raw > total_dur:
            scale = total_dur / total_raw
            raw = [d * scale for d in raw]

    result, t = [], cap.start
    for i, (chunk, dur) in enumerate(zip(chunks, raw)):
        # Snap the last chunk's end to cap.end — eliminates float accumulation error
        end = cap.end if i == len(chunks) - 1 else t + dur
        result.append(Caption(start=t, end=end, text=" ".join(chunk)))
        t = end
    return result


def _split_phrases(cap: Caption, wpl: int = 3) -> list[Caption]:
    """
    Split one Caption into chunks of `wpl` words with equal timing.
    The last phrase's end is always snapped to cap.end.
    """
    words = cap.text.split()
    if not words:
        return []
    groups   = [words[i:i + wpl] for i in range(0, len(words), wpl)]
    dur_each = max(cap.end - cap.start, 0.05) / len(groups)
    result   = []
    for i, grp in enumerate(groups):
        t   = cap.start + i * dur_each
        # Snap last phrase to cap.end to eliminate float drift
        end = cap.end if i == len(groups) - 1 else t + dur_each
        result.append(Caption(start=t, end=end, text=" ".join(grp)))
    return result


# ══════════════════════════════════════════════════════════════
#  DIALOGUE LINE BUILDERS
#  Each returns a list of raw ASS "Dialogue: ..." lines.
# ══════════════════════════════════════════════════════════════

def _t(secs: float) -> str:
    """
    Seconds → ASS timestamp  H:MM:SS.cc

    Works in integer centiseconds to avoid floating-point overflow
    (e.g. 59.9999 rounding to "60.00" which is an invalid ASS timestamp).
    """
    secs = max(0.0, secs)
    total_cs = round(secs * 100)          # centiseconds, integer — no float error
    cs  = total_cs % 100
    total_s = total_cs // 100
    s   = total_s % 60
    total_m = total_s // 60
    m   = total_m % 60
    h   = total_m // 60
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _dlg(start: float, end: float, text: str, style: str = "Default", layer: int = 0) -> str:
    """Bare dialogue line (no tags)."""
    return f"Dialogue: {layer},{_t(start)},{_t(end)},{style},,0,0,0,,{text}"


def _pos_tag(x: int, y: int) -> str:
    return f"{{\\pos({x},{y})}}"


# ── minimal ────────────────────────────────────────────────────
def _lines_minimal(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            lines.append(_dlg(p.start, p.end, f"{pos}{_esc(p.text)}"))
    return lines


# ── fade ───────────────────────────────────────────────────────
def _lines_fade(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            dur_ms  = max(1, int((p.end - p.start) * 1000))
            # Cap fade at 20 % of phrase duration each side so text is
            # visible for at least 60 % of the time it's on screen.
            fade_ms = min(300, dur_ms // 5)
            tag     = f"{pos}{{\\fad({fade_ms},{fade_ms})}}"
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(p.text)}"))
    return lines


# ── word_pop ───────────────────────────────────────────────────
def _lines_word_pop(captions: list[Caption], x: int, y: int, wpl: int = 1) -> list[str]:
    """
    Chunks bounce in: 80 % → 115 % → 100 %.

    BUG FIX: animation keyframe times are clamped to the chunk's actual
    display duration so that on very fast speech the animation doesn't
    overshoot the end of the visible window.
    """
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for chunk in _split_words(c, wpl):
            dur_ms = max(1, int((chunk.end - chunk.start) * 1000))
            # Scale 150/280 proportionally if chunk is shorter than 280 ms
            t1 = min(150, int(dur_ms * 0.55))
            t2 = min(280, dur_ms)
            tag = (
                f"{pos}"
                f"{{\\fscx80\\fscy80"
                f"\\t(0,{t1},1,\\fscx115\\fscy115)"
                f"\\t({t1},{t2},1,\\fscx100\\fscy100)}}"
            )
            lines.append(_dlg(chunk.start, chunk.end, f"{tag}{_esc(_safe_upper(chunk.text))}"))
    return lines


# ── typewriter ─────────────────────────────────────────────────
def _lines_typewriter(captions: list[Caption], x: int, y: int, wpl: int = 1) -> list[str]:
    """
    True typewriter: words accumulate left-to-right, bounded to `wpl` words
    on screen at once — once a phrase group of `wpl` words is fully typed,
    the NEXT group clears and starts accumulating from scratch (it does not
    keep growing across the whole caption entry, which would overflow into
    multi-line paragraphs on longer transcript cues).

    e.g. wpl=3 for "Hello world how are you today":
      group 1 (t=0.00–1.00): "Hello" → "Hello world" → "Hello world how"
      group 2 (t=1.00–2.00): "are" → "are you" → "are you today"
    """
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for grp in _split_phrases(c, wpl):
            grp_words = grp.text.split()
            if not grp_words:
                continue
            word_caps = _split_words(grp, 1)   # one entry per word, timed within this group

            for i, word_cap in enumerate(word_caps):
                accumulated = " ".join(grp_words[:i + 1])
                # Show until the NEXT word starts (or the group ends)
                display_end = word_caps[i + 1].start if i + 1 < len(word_caps) else grp.end
                tag = f"{pos}{{\\alpha&HFF&\\t(0,100,1,\\alpha&H00&)}}"
                lines.append(_dlg(word_cap.start, display_end, f"{tag}{_esc(accumulated)}"))
    return lines


# ── slide ──────────────────────────────────────────────────────
def _lines_slide(captions: list[Caption], x: int, y: int, wpl: int = 1) -> list[str]:
    """Each chunk slides in from the left edge.
    Slide duration clamped to chunk display time."""
    lines   = []
    start_x = -300
    for c in captions:
        for chunk in _split_words(c, wpl):
            dur_ms   = max(1, int((chunk.end - chunk.start) * 1000))
            slide_ms = min(350, int(dur_ms * 0.7))   # max 70 % of display time
            move = f"{{\\move({start_x},{y},{x},{y},0,{slide_ms})}}"
            lines.append(_dlg(chunk.start, chunk.end, f"{move}{_esc(_safe_upper(chunk.text))}"))
    return lines


# ── zoom ───────────────────────────────────────────────────────
def _lines_zoom(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """Chunks scale from 50 % → 100 % over 300 ms."""
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            tag = (
                f"{pos}"
                f"{{\\fscx50\\fscy50"
                f"\\t(0,300,1,\\fscx100\\fscy100)}}"
            )
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(p.text)}"))
    return lines


# ── shake ──────────────────────────────────────────────────────
def _lines_shake(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """Chunks appear with rapid ±2° rotation wiggle."""
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            tag = (
                f"{pos}"
                f"{{\\t(0,60,\\frz-2)"
                f"\\t(60,120,\\frz2)"
                f"\\t(120,180,\\frz-2)"
                f"\\t(180,240,\\frz2)"
                f"\\t(240,300,\\frz0)}}"
            )
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(p.text)}"))
    return lines


# ── karaoke ────────────────────────────────────────────────────
def _lines_karaoke(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """
    Groups of `wpl` words on one line with \\kf sweep (secondary → primary colour).
    Timing unit: centiseconds (1/100 s).

    BUG FIX: distribute remainder centiseconds evenly across words so that
    sum(kf_values) == total_cs exactly — no drift.
    e.g. 70 cs / 3 words → [24, 23, 23] not [23, 23, 23] (missing 1 cs).
    """
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for group in _split_phrases(c, wpl):
            words    = group.text.split()
            n        = len(words)
            total_cs = max(round((group.end - group.start) * 100), n)
            base_cs  = total_cs // n
            remainder = total_cs - base_cs * n   # distribute remainder to first R words
            kf_vals  = [base_cs + (1 if i < remainder else 0) for i in range(n)]
            tagged   = " ".join(f"{{\\kf{kf_vals[i]}}}{_esc(w)}" for i, w in enumerate(words))
            lines.append(_dlg(group.start, group.end, f"{pos}{tagged}"))
    return lines


# ── hormozi ────────────────────────────────────────────────────
def _lines_hormozi(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """
    ALL CAPS with opaque box background (BorderStyle 3) — Hormozi style.
    """
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            tag = f"{pos}{{\\fad(80,80)}}"
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(_safe_upper(p.text))}"))
    return lines


# ── mrbeast ────────────────────────────────────────────────────
def _lines_mrbeast(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """Giant text, quick pop on appear, ALL CAPS."""
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            tag = (
                f"{pos}"
                f"{{\\fscx90\\fscy90"
                f"\\t(0,180,1,\\fscx105\\fscy105)"
                f"\\t(180,320,1,\\fscx100\\fscy100)"
                f"\\fad(0,200)}}"
            )
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(_safe_upper(p.text))}"))
    return lines


# ── neon ───────────────────────────────────────────────────────
def _lines_neon(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """Chunks with 4 px blur glow outline."""
    pos   = _pos_tag(x, y)
    lines = []
    for c in captions:
        for p in _split_phrases(c, wpl):
            tag = f"{pos}{{\\blur4\\fad(300,300)}}"
            lines.append(_dlg(p.start, p.end, f"{tag}{_esc(p.text)}"))
    return lines


# ── none (subtitles explicitly disabled) ────────────────────────
def _lines_none(captions: list[Caption], x: int, y: int, wpl: int = 3) -> list[str]:
    """User chose no subtitles — emit zero dialogue events. The hook
    title (if any) is unaffected since it's added separately."""
    return []


# ── hook title card ────────────────────────────────────────────

def _lines_hook_title(
    title: str,
    x: int,
    y: int,
    duration: float = HOOK_TITLE_DURATION,
) -> list[str]:
    """
    One boxed, ALL-CAPS title card at (x, y) — anchor point matches the
    "Hook" style's Alignment (see `_hook_position`/`_hook_style_line`) — for
    the first `duration` seconds. Pops in (90% -> 104% -> 100% scale) with a
    fade, then fades out at the end of its window via \\fad's built-in tail
    fade. Rendered on Layer 1 so it never z-fights with phrase/word captions.
    """
    text = _esc(_safe_upper(title.strip()))
    if not text:
        return []
    tag = (
        f"{_pos_tag(x, y)}"
        "{\\fscx90\\fscy90\\fad(200,250)"
        "\\t(0,200,\\fscx104\\fscy104)"
        "\\t(200,350,\\fscx100\\fscy100)}"
    )
    return [_dlg(0, duration, f"{tag}{text}", style="Hook", layer=1)]


# ── dispatcher ────────────────────────────────────────────────

_BUILDERS = {
    "minimal":    _lines_minimal,
    "fade":       _lines_fade,
    "word_pop":   _lines_word_pop,
    "typewriter": _lines_typewriter,
    "slide":      _lines_slide,
    "zoom":       _lines_zoom,
    "shake":      _lines_shake,
    "karaoke":    _lines_karaoke,
    "hormozi":    _lines_hormozi,
    "mrbeast":    _lines_mrbeast,
    "neon":       _lines_neon,
    "none":       _lines_none,
}


# ── ASS escape ────────────────────────────────────────────────

def _esc(text: str) -> str:
    """Escape ASS special chars in caption text."""
    return text.replace("{", "\\{").replace("}", "\\}")


def _safe_upper(text: str) -> str:
    """
    Uppercase only when the text is Latin-script.
    Arabic, CJK, Devanagari, Hebrew etc. have no case — calling .upper()
    returns them unchanged but can corrupt surrogate pairs in some builds.
    Guard: if ALL characters are ASCII (ord < 128) or Extended-Latin (ord < 592),
    uppercase is safe. Otherwise return the text as-is.
    """
    if all(ord(c) < 592 or not c.isalpha() for c in text):
        return text.upper()
    return text


# ══════════════════════════════════════════════════════════════
#  ASS FILE BUILDER
# ══════════════════════════════════════════════════════════════

_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_lines}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{events}
"""


def build_ass_content(
    captions:      list[Caption],
    style:         str = "minimal",
    color:         str = DEFAULT_COLOR,
    h_align:       str = "center",
    v_align:       str = "bottom",
    words_per_line: int = 3,
    hook_title:    str | None = None,
    template:      str = "",
    title_permanent: bool = False,
    clip_duration: float = 0.0,
    font:          str = DEFAULT_FONT,
    title_color:   str = "#FFFFFF",
) -> str:
    """
    Build a complete .ass subtitle file string.

    Args:
        captions:       list of Caption (times relative to clip start)
        style:          one of the 11 style names
        color:          one of the colour combo names
        h_align:        left | center | right
        v_align:        top  | center | bottom
        words_per_line: 1 | 2 | 3  — words shown per screen at once
        hook_title:     AI-generated curiosity-gap hook (ClipTimestamp.title)
                         burned as a title card for the first
                         HOOK_TITLE_DURATION seconds. None/empty skips it.
        template:       reframe template name (e.g. "crop_fill", "blur_bg")
                         — drives the hook title's position, see
                         TEMPLATE_HAS_BARS / _hook_position.
        title_permanent: keep the hook title on screen for `clip_duration`
                         seconds instead of just HOOK_TITLE_DURATION.
        clip_duration:  total clip length in seconds — only used when
                         `title_permanent` is True.
        font:           one of FONT_OPTIONS keys — applies to both captions
                         and the hook title card.
        title_color:    hex colour for the title TEXT — independent of the
                         caption `color` combo (see title_box.TITLE_TEXT_COLORS).
                         The title's background box (if any) is rendered
                         separately as a PNG overlay — see title_box.py.
    """
    x, y, alignment = _resolve_pos(h_align, v_align)
    style_key = style if style in _BASE_STYLES else "minimal"
    color_key = color if color in COLOR_COMBOS else DEFAULT_COLOR
    font_key  = font if font in FONT_OPTIONS else DEFAULT_FONT
    wpl       = max(1, min(int(words_per_line), 4))   # clamp 1-4

    style_lines = [_style_line(style_key, color_key, alignment, font_key)]
    build  = _BUILDERS.get(style_key, _lines_minimal)
    events = build(captions, x, y, wpl)

    if hook_title and hook_title.strip():
        style_lines.append(_hook_style_line(title_color, template, font_key))
        hook_x, hook_y, _ = _hook_position(template)
        hook_duration = compute_hook_duration(title_permanent, clip_duration)
        events = _lines_hook_title(hook_title, hook_x, hook_y, duration=hook_duration) + events

    return _ASS_HEADER.format(
        style_lines="\n".join(style_lines),
        events="\n".join(events),
    )


# ══════════════════════════════════════════════════════════════
#  TRANSCRIPT → CAPTION FILTERING
# ══════════════════════════════════════════════════════════════

def get_clip_captions(
    transcript: list[TranscriptEntry],
    clip_start: float,
    clip_end:   float,
) -> list[Caption]:
    """
    Filter transcript entries overlapping [clip_start, clip_end] and
    return Captions with timestamps relative to clip start (0 = clip begins).

    BUG FIX (Bug 8): cap each entry's end at the NEXT entry's start to prevent
    overlapping captions when the stored `duration` field overshoots reality.
    Also removes entries that have effectively zero display time after clamping.
    """
    MIN_DISPLAY = 0.05      # drop entries shorter than 50 ms after clamping
    clip_dur    = clip_end - clip_start

    # Pre-compute natural end times capped at next entry start
    timed: list[tuple[float, float, str]] = []    # (e_start, e_end, text)
    for i, entry in enumerate(transcript):
        e_start = entry["start"]
        raw_dur = entry.get("duration") or 2.0
        # Natural end is raw_dur, but must not reach next entry's start
        if i + 1 < len(transcript):
            next_start = transcript[i + 1]["start"]
            e_end = min(e_start + raw_dur, next_start - 0.001)
        else:
            e_end = e_start + raw_dur
        e_end = max(e_end, e_start + MIN_DISPLAY)
        timed.append((e_start, e_end, (entry.get("text") or "").strip()))

    captions = []
    for e_start, e_end, text in timed:
        if not text:
            continue
        if e_end <= clip_start or e_start >= clip_end:
            continue                              # fully outside clip window

        adj_start = max(e_start - clip_start, 0.0)
        adj_end   = min(e_end   - clip_start, clip_dur)

        if adj_end - adj_start < MIN_DISPLAY:
            continue                              # too short to show

        captions.append(Caption(start=adj_start, end=adj_end, text=text))

    return captions


def captions_to_dict(captions: list[Caption]) -> list[dict]:
    """Serialize a list of Caption to plain dicts for JSON/JSONB storage."""
    return [{"start": c.start, "end": c.end, "text": c.text} for c in captions]


def clamp_captions_to_silence(
    captions: list[Caption],
    silences: list[tuple[float, float]],
) -> list[Caption]:
    """
    Trim each caption's `end` back to the start of any long silence window
    (from detect_silences) it overlaps, so the on-screen text disappears the
    instant speech actually stops instead of lingering through dead air.

    Pure caption-timing adjustment — no video cuts. Captions that collapse
    to < MIN_DISPLAY after trimming are dropped.
    """
    if not silences:
        return captions

    MIN_DISPLAY = 0.05
    result: list[Caption] = []
    for c in captions:
        clamp_to = min(
            (s_start for s_start, _ in silences if c.start < s_start < c.end),
            default=None,
        )
        end = min(c.end, clamp_to) if clamp_to is not None else c.end
        if end - c.start >= MIN_DISPLAY:
            result.append(Caption(start=c.start, end=end, text=c.text))
    return result


# ══════════════════════════════════════════════════════════════
#  CAPTION BURNING
# ══════════════════════════════════════════════════════════════

async def burn_captions(
    clip_path:      Path,
    captions:       list[Caption],
    output_path:    Path,
    style:          str = "minimal",
    color:          str = DEFAULT_COLOR,
    h_align:        str = "center",
    v_align:        str = "bottom",
    words_per_line: int = 3,
    hook_title:     str | None = None,
    title_permanent: bool = False,
    clip_duration:  float = 0.0,
    template:       str = "",
    font:           str = DEFAULT_FONT,
    title_color:    str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg:       str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
) -> Path:
    """
    Burn captions into a clip via FFmpeg ASS filter — and, if `hook_title`
    is set with a non-"none" `title_bg`, composite a rounded-rect PNG box
    (see title_box.py) behind the title text via `overlay` first.
    Writes a temp .ass file (+ temp PNG box, if any), burns in one pass,
    cleans up both.
    """
    if not captions and not (hook_title and hook_title.strip()):
        logger.warning(f"No captions/title for {clip_path.name} — copying without subtitles")
        output_path.write_bytes(clip_path.read_bytes())
        return output_path

    title_color_hex = TITLE_TEXT_COLORS.get(title_color, TITLE_TEXT_COLORS[DEFAULT_TITLE_TEXT_COLOR])
    ass_content = build_ass_content(
        captions, style, color, h_align, v_align, words_per_line,
        hook_title=hook_title, template=template,
        title_permanent=title_permanent, clip_duration=clip_duration, font=font,
        title_color=title_color_hex,
    )

    with tempfile.NamedTemporaryFile(
        suffix=".ass", mode="w", encoding="utf-8", delete=False
    ) as f:
        f.write(ass_content)
        ass_path = f.name

    box_path: Path | None = None
    try:
        # Escape Windows backslashes / colons for FFmpeg filter string
        safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")

        extra_inputs: list[str] = []
        if hook_title and hook_title.strip() and title_bg != "none":
            hook_duration = compute_hook_duration(title_permanent, clip_duration)
            hook_x, hook_y, alignment = _hook_position(template)
            box = render_title_box_png(
                _safe_upper(hook_title.strip()), font, 60, title_bg, title_bg_opacity,
            )
            if box:
                box_path, box_w, box_h = box
                ox, oy = overlay_xy(hook_x, hook_y, alignment, box_w, box_h)
                extra_inputs = ["-i", str(box_path)]
                vf = (
                    f"[0:v][1:v]overlay={ox}:{oy}:enable='between(t,0,{hook_duration:.3f})'[boxed];"
                    f"[boxed]ass={safe_ass}"
                )
            else:
                vf = f"ass={safe_ass}"
        else:
            vf = f"ass={safe_ass}"

        filter_flag = "-filter_complex" if extra_inputs else "-vf"
        cmd = [
            "ffmpeg", "-y",
            "-i", str(clip_path),
            *extra_inputs,
            filter_flag, vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "22",
            "-threads", "2",
            "-c:a", "copy",
            "-movflags", "+faststart",
            str(output_path),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"Caption burn timed out [{style}] {clip_path.name}")

        if proc.returncode != 0:
            raise RuntimeError(
                f"Caption burn failed [{style}] {clip_path.name}: "
                f"{stderr.decode(errors='ignore')[-400:]}"
            )

    finally:
        Path(ass_path).unlink(missing_ok=True)
        if box_path:
            box_path.unlink(missing_ok=True)

    logger.info(f"Burned [{style}/{color}] captions → {output_path.name}")
    return output_path


# ══════════════════════════════════════════════════════════════
#  SILENCE DETECTION
# ══════════════════════════════════════════════════════════════

async def detect_silences(
    clip_path:          Path,
    min_silence_dur:    float = 3.0,
    noise_threshold_db: float = -30.0,
) -> list[tuple[float, float]]:
    """
    Run FFmpeg's silencedetect over the clip's audio track and return every
    silence window >= min_silence_dur as (start, end) seconds.

    Audio-only (-vn, -f null) — decodes no video, so this is a cheap pass
    even on long clips. Used to clamp caption display time to where speech
    actually stops (see clamp_captions_to_silence), without cutting video.
    """
    cmd = [
        "ffmpeg", "-i", str(clip_path),
        "-threads", "1",   # audio-only decode — single thread is plenty
        "-af", f"silencedetect=noise={noise_threshold_db}dB:d={min_silence_dur}",
        "-vn", "-f", "null", "-",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        logger.warning(f"Silence detection timed out for {clip_path.name} — skipping")
        return []

    silences: list[tuple[float, float]] = []
    pending_start: float | None = None
    for line in stderr.decode(errors="ignore").splitlines():
        if "silence_start" in line:
            m = re.search(r"silence_start:\s*(-?[\d.]+)", line)
            if m:
                pending_start = float(m.group(1))
        elif "silence_end" in line and pending_start is not None:
            m = re.search(r"silence_end:\s*(-?[\d.]+)", line)
            if m:
                silences.append((pending_start, float(m.group(1))))
                pending_start = None

    # Trailing silence that runs to EOF has no silence_end line — still
    # useful as a clamp point, so record it with an open-ended end.
    if pending_start is not None:
        silences.append((pending_start, float("inf")))

    return silences


# ══════════════════════════════════════════════════════════════
#  PUBLIC CONSTANTS  (for API schema validation)
# ══════════════════════════════════════════════════════════════

VALID_STYLES         = list(_BASE_STYLES.keys())
VALID_COLORS         = list(COLOR_COMBOS.keys())
VALID_HALIGNS        = ["left", "center", "right"]
VALID_VALIGNS        = ["top", "center", "bottom"]
VALID_WORDS_PER_LINE = [1, 2, 3]          # user choices exposed to frontend
