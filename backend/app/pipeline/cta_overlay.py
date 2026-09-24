"""
cta_overlay.py — Generates ASS subtitle content for the animated end-CTA.

The CTA plays in the LAST 10 seconds of every marketer-plan clip.
Each "page" gets time proportional to its word count.

Animation styles:
  staggered_stack  — Words appear one-by-one top→bottom, stay, then vanish together
  massive_pop      — Single word scales in massive, dominates, fades out
  slide_fade       — Text slides up from below while fading in, then fades out
  typewriter       — Text reveals character by character (simulated via fade-in per word)
"""

from __future__ import annotations

import math

# ASS video resolution (matches the 9:16 output)
_W = 1080
_H = 1920

_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CTA,{font_name},{fontsize},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,0,5,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _ts(seconds: float) -> str:
    """Seconds → ASS timestamp h:mm:ss.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _hex_to_ass(hex_color: str) -> str:
    """#RRGGBB → &H00BBGGRR (ASS colour order is BGR)"""
    c = hex_color.lstrip("#")
    if len(c) != 6:
        return "&H00FFFFFF"
    r, g, b = c[0:2], c[2:4], c[4:6]
    return f"&H00{b}{g}{r}"


def _page_durations(pages: list[dict], total_secs: float = 10.0) -> list[float]:
    """Proportional duration per page, based on word count."""
    counts = [max(1, len(p.get("words", [""]))) for p in pages]
    total  = sum(counts)
    return [(c / total) * total_secs for c in counts]


def _pos(x_pct: float, y_pct: float) -> str:
    """Percentage 0-100 → ASS \\pos(px, py)"""
    return f"\\pos({int(_W * x_pct / 100)},{int(_H * y_pct / 100)})"


def _build_staggered_stack(
    words: list[str],
    t_start: float,
    t_end: float,
    x_pct: float,
    y_pct: float,
    font_size: int,
    color_ass: str,
) -> list[str]:
    """
    Words appear one at a time staggered from top down,
    then ALL disappear together at t_end.
    """
    lines = []
    n = len(words)
    # Each word gets equal reveal share of the first 75% of the page duration
    appear_window = (t_end - t_start) * 0.75
    word_interval = appear_window / max(n, 1)

    # Stack offset: distribute words vertically around y_pct
    line_gap = font_size * 1.3  # pixels between word baselines
    total_h  = (n - 1) * line_gap
    y_base_px = int(_H * y_pct / 100) - int(total_h / 2)
    x_px = int(_W * x_pct / 100)

    for i, word in enumerate(words):
        word_start = t_start + i * word_interval
        word_y_px  = y_base_px + int(i * line_gap)
        pos_tag    = f"\\pos({x_px},{word_y_px})"
        fs_tag     = f"\\fs{font_size}"
        color_tag  = f"\\1c{color_ass}"
        # Fade in over 200ms, disappear (cut) at t_end
        fad_tag    = f"\\fad(200,0)"
        text = f"{{\\an5{pos_tag}{fs_tag}{color_tag}\\b1{fad_tag}}}{word.upper()}"
        lines.append(f"Dialogue: 0,{_ts(word_start)},{_ts(t_end)},CTA,,0,0,0,,{text}")

    return lines


def _build_massive_pop(
    words: list[str],
    t_start: float,
    t_end: float,
    x_pct: float,
    y_pct: float,
    font_size: int,
    color_ass: str,
) -> list[str]:
    """
    Word(s) appear large with a fast scale-up pop, hold, then fade out.
    Best for single impactful words.
    """
    lines = []
    duration = t_end - t_start
    fade_in  = min(0.25, duration * 0.15)
    fade_out = min(0.4, duration * 0.25)
    text_content = "\\N".join(w.upper() for w in words)

    pos_tag   = _pos(x_pct, y_pct)
    fs_tag    = f"\\fs{font_size}"
    color_tag = f"\\1c{color_ass}"
    fad_tag   = f"\\fad({int(fade_in*1000)},{int(fade_out*1000)})"
    # Scale from 60% to 100% quickly
    scale_tag = f"\\t(0,{int(fade_in*1000)},\\fscx100\\fscy100)\\fscx60\\fscy60"

    text = f"{{\\an5{pos_tag}{fs_tag}{color_tag}\\b1{fad_tag}{scale_tag}}}{text_content}"
    lines.append(f"Dialogue: 0,{_ts(t_start)},{_ts(t_end)},CTA,,0,0,0,,{text}")
    return lines


def _build_slide_fade(
    words: list[str],
    t_start: float,
    t_end: float,
    x_pct: float,
    y_pct: float,
    font_size: int,
    color_ass: str,
) -> list[str]:
    """Text slides up from 10% below its target while fading in, then fades out."""
    lines = []
    duration = t_end - t_start
    fade_in  = min(0.4, duration * 0.25)
    fade_out = min(0.4, duration * 0.25)
    text_content = "\\N".join(w.upper() for w in words)

    x_px = int(_W * x_pct / 100)
    y_px = int(_H * y_pct / 100)
    y_start_px = y_px + int(_H * 0.1)  # start 10% lower

    move_tag  = f"\\move({x_px},{y_start_px},{x_px},{y_px},0,{int(fade_in*1000)})"
    fs_tag    = f"\\fs{font_size}"
    color_tag = f"\\1c{color_ass}"
    fad_tag   = f"\\fad({int(fade_in*1000)},{int(fade_out*1000)})"

    text = f"{{\\an5{move_tag}{fs_tag}{color_tag}\\b1{fad_tag}}}{text_content}"
    lines.append(f"Dialogue: 0,{_ts(t_start)},{_ts(t_end)},CTA,,0,0,0,,{text}")
    return lines


def _build_typewriter(
    words: list[str],
    t_start: float,
    t_end: float,
    x_pct: float,
    y_pct: float,
    font_size: int,
    color_ass: str,
) -> list[str]:
    """
    Words appear one at a time with a fast fade-in (simulating typewriter).
    All stay on screen, then fade out together.
    """
    # Reuse staggered_stack with very short fade-ins for a typewriter feel
    return _build_staggered_stack(words, t_start, t_end, x_pct, y_pct, font_size, color_ass)


_BUILDERS = {
    "staggered_stack": _build_staggered_stack,
    "massive_pop":     _build_massive_pop,
    "slide_fade":      _build_slide_fade,
    "typewriter":      _build_typewriter,
}


def build_cta_ass(
    pages: list[dict],
    clip_duration: float,
    color_hex: str = "#FFFFFF",
    cta_window: float = 10.0,
    font_name: str = "Liberation Sans",
) -> str:
    """
    Generate a complete ASS file string with the CTA animation.

    Args:
        pages:         List of page dicts, each with:
                         - words:      list[str]  (one word per row)
                         - animation:  str        (staggered_stack | massive_pop | slide_fade | typewriter)
                         - x:          float      (0-100, horizontal center %)
                         - y:          float      (0-100, vertical center %)
                         - font_size:  int        (pixel size)
        clip_duration: Total clip length in seconds.
        color_hex:     Text colour as #RRGGBB.
        cta_window:    Duration of the CTA section (default 10s).
        font_name:     The font to use for subtitles (e.g. "Liberation Sans").

    Returns:
        ASS file content as a string.
    """
    if not pages or clip_duration <= 0:
        return ""

    color_ass = _hex_to_ass(color_hex)
    cta_start = max(0.0, clip_duration - cta_window)
    durations  = _page_durations(pages, cta_window)

    # Default font size for header (first page's size)
    header_fs = pages[0].get("font_size", 120)

    lines: list[str] = []
    t = cta_start
    for page, dur in zip(pages, durations):
        words      = page.get("words") or [""]
        animation  = page.get("animation", "staggered_stack")
        x_pct      = float(page.get("x", 50))
        y_pct      = float(page.get("y", 50))
        font_size  = int(page.get("font_size", 120))
        builder    = _BUILDERS.get(animation, _build_staggered_stack)
        lines.extend(builder(words, t, t + dur, x_pct, y_pct, font_size, color_ass))
        t += dur

    header = _ASS_HEADER.format(W=_W, H=_H, font_name=font_name, fontsize=header_fs, primary_color=color_ass)
    return header + "\n".join(lines) + "\n"
