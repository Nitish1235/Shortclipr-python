"""
factloop_composite.py — renders one Factloop output video.

Replaces brainrot_composite.py's character-overlay system entirely. Layers,
bottom to top:
  1. Gameplay background clip (unchanged from Brainrot — already pre-
     reframed to 1080x1920 at ingestion time, looped via -stream_loop -1).
  2. One AI-generated (or real stock-photo) image PER FACT (factloop_image.py),
     anchored UP-CENTRIC — center around 30% down the canvas, not the old
     character system's 75-95% ("standing near the bottom"). Images swap in
     sync with the narration: each fact's image is visible from that fact's
     stat line start until the next fact's line starts (the very first image
     also covers the hook, before any fact starts), rather than one static
     image for the whole video — see _resolve_image_segments. Each segment
     gets its own local Ken Burns zoom (resets per image, not accumulated
     across the whole clip), done entirely with ffmpeg's own eval=frame
     scale expression + the overlay filter's built-in enable=between(...)
     gate, so it needs none of the old windowed piecewise-position
     machinery that character entry/exit motion required.
  3. Animated per-stat callouts — one per narration line whose `kind` is
     "stat", timed to that line's real TTS start/end window, each drawing a
     different screen position/font/color combo (deterministic per job so
     re-renders are stable) from captions.py's existing FONT_OPTIONS/
     COLOR_COMBOS catalogs. Numeric fact values get a genuine count-up
     animation (several fast consecutive ASS lines stepping the shown value
     up to the real one) rather than just popping in already-final.
  4. Burned narration captions — every line (hook/stat/context/outro) gets
     captioned at the bottom, same ASS/libass mechanism as before, just
     single-speaker now (no dual-color split — there's only one narrator).

Audio: TTS narration line(s) + ducked background music. No more motion-
linked entry/exit stingers (there's no character motion to key off of).
"""
import asyncio
import logging
import random
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.pipeline.captions import (
    _ASS_HEADER, _BASE_STYLES, _BUILDERS, _dlg, _esc, _resolve_slider_pos,
    _safe_upper, _style_line, Caption, COLOR_COMBOS, DEFAULT_COLOR as _CAPTIONS_DEFAULT_COLOR,
    FONT_OPTIONS,
)

logger = logging.getLogger(__name__)

CANVAS_W, CANVAS_H = 1080, 1920

# Where each fact's image sits — UP-CENTRIC per spec (not the character
# system's near-bottom placement). Center point, canvas-relative.
IMAGE_CENTER_Y_FRAC = 0.30
IMAGE_WIDTH_FRAC = 0.25          # 1/4 of canvas width — smaller frame so the
                                 # per-fact image reads as one element among
                                 # several (stat callouts, captions) rather
                                 # than dominating the screen
IMAGE_KEN_BURNS_GAIN = 0.06      # slow zoom-in: grows 6% over the whole clip

# Caption font for burned narration — same fixed choice Brainrot used
# (Anton reads as a punchy vertical-video caption, bundled + fontconfig-
# registered per the Dockerfile).
CAPTION_FONT = "anton"

# ── Stat callout layout ──────────────────────────────────────────
# A handful of anchor points in the band between the image's bottom edge
# and the narration caption area, so callouts never collide with either.
# (x_frac, y_frac), canvas-relative, alignment=5 (middle-center anchor).
_STAT_POSITIONS: list[tuple[float, float]] = [
    (0.28, 0.60), (0.72, 0.60), (0.50, 0.67),
    (0.25, 0.74), (0.75, 0.74), (0.50, 0.56),
]
_STAT_FONT_KEYS = list(FONT_OPTIONS.keys())
_STAT_COLOR_KEYS = list(COLOR_COMBOS.keys())
_STAT_BIG_SIZES = [92, 100, 108]
_STAT_SMALL_SIZE = 50

_STAT_COUNT_STEPS = 7
_STAT_COUNT_UP_FRACTION = 0.4
_STAT_MIN_COUNT_DURATION = 0.5
_STAT_MAX_COUNT_DURATION = 1.1
_STAT_MIN_WINDOW_FOR_COUNTUP = 0.6

_NUMERIC_RE = re.compile(r"-?\d+(?:\.\d+)?")

# Background music ducks to this fraction of its set volume while the
# narrator is speaking, same technique/values Brainrot used.
MUSIC_DUCK_FACTOR = 0.35
MUSIC_DUCK_RAMP_SECONDS = 0.15


@dataclass
class TimedLine:
    kind: str             # "hook" | "stat" | "context" | "outro"
    text: str
    stat_key: str | None  # set only when kind == "stat"
    start: float           # seconds, relative to clip start
    end: float
    # local filesystem Path when used for composite.render() (the actual
    # ffmpeg -i input); a GCS URL string when used transiently in the API
    # stage to hand the line off to db.set_brainrot_scene_plan().
    audio_path: Path | str


def _even(n: float) -> int:
    """Round to nearest even int — libx264 requires even filter dimensions."""
    n = round(n)
    return n if n % 2 == 0 else n + 1


def _resolve_image_segments(
    lines: list[TimedLine], images: dict[str, Path], clip_duration: float,
) -> list[tuple[Path, float, float]]:
    """Returns [(image_path, seg_start, seg_end), ...] covering [0,
    clip_duration] contiguously — each fact's image is shown from that
    fact's own narration start until the NEXT fact's narration starts (or
    clip end, for the last fact). The very first segment starts at t=0
    (covering the hook, before any fact is mentioned) rather than leaving
    a blank gap before the first stat line begins."""
    stat_lines = sorted(
        (l for l in lines if l.kind == "stat" and l.stat_key in images),
        key=lambda l: l.start,
    )
    segments: list[tuple[Path, float, float]] = []
    for i, line in enumerate(stat_lines):
        seg_start = 0.0 if i == 0 else line.start
        seg_end = stat_lines[i + 1].start if i + 1 < len(stat_lines) else clip_duration
        if seg_end <= seg_start:
            continue
        segments.append((images[line.stat_key], seg_start, seg_end))
    return segments


# ══════════════════════════════════════════════════════════════
#  Numeric parsing / formatting for the count-up animation
# ══════════════════════════════════════════════════════════════

def _parse_numeric(value: str) -> tuple[float, int] | None:
    """Extracts the first number in `value` (commas stripped first, so
    "1,240" parses as 1240). Returns (numeric_value, decimal_places), or
    None if no number is found — non-numeric facts (e.g. "Champion") skip
    the count-up animation entirely and just pop in as static text."""
    m = _NUMERIC_RE.search(value.replace(",", ""))
    if not m:
        return None
    raw = m.group(0)
    decimals = len(raw.split(".")[1]) if "." in raw else 0
    try:
        return float(raw), decimals
    except ValueError:
        return None


def _format_number(n: float, decimals: int, use_commas: bool) -> str:
    s = f"{n:.{decimals}f}" if decimals else f"{int(round(n))}"
    if use_commas:
        whole, _, frac = s.partition(".")
        whole = f"{int(whole):,}"
        s = f"{whole}.{frac}" if frac else whole
    return s


# ══════════════════════════════════════════════════════════════
#  Stat callout ASS events
# ══════════════════════════════════════════════════════════════

def _stat_style_line() -> str:
    """One lightweight baseline Style row — every real font/color/size
    choice is applied per-event via inline ASS override tags (\\fn, \\c,
    \\3c, \\fs) instead of one Style row per stat, since ASS override tags
    can change those properties mid-document freely. Alignment=5
    (middle-center) so \\pos anchors each callout's block center."""
    return "Style: Stat,Liberation Sans,90,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,6,0,5,20,20,20,1"


def _pick_stat_look(rng: random.Random, index: int) -> dict:
    pos = _STAT_POSITIONS[index % len(_STAT_POSITIONS)]
    return {
        "x": round(pos[0] * CANVAS_W),
        "y": round(pos[1] * CANVAS_H),
        "font": rng.choice(_STAT_FONT_KEYS),
        "color": rng.choice(_STAT_COLOR_KEYS),
        "big_size": rng.choice(_STAT_BIG_SIZES),
    }


def _stat_prefix(look: dict) -> str:
    combo = COLOR_COMBOS.get(look["color"], COLOR_COMBOS[_CAPTIONS_DEFAULT_COLOR])
    font_name = FONT_OPTIONS.get(look["font"], FONT_OPTIONS["default"])
    return (
        f"{{\\pos({look['x']},{look['y']})"
        f"\\fn{font_name}\\c{combo['primary']}\\3c{combo['outline']}"
        f"\\bord6\\shad0}}"
    )


def _stat_events(narration_lines: list[TimedLine], facts_by_key: dict, seed: str) -> list[str]:
    rng = random.Random(seed)
    stat_lines = [l for l in narration_lines if l.kind == "stat" and l.stat_key in facts_by_key]
    events: list[str] = []

    for i, line in enumerate(stat_lines):
        fact = facts_by_key[line.stat_key]
        label = _esc(_safe_upper(fact.get("label", "")))
        unit = fact.get("unit") or ""
        unit_suffix = f" {_esc(unit)}" if unit else ""
        value_raw = str(fact.get("value", ""))
        look = _pick_stat_look(rng, i)
        prefix = _stat_prefix(look)
        window = line.end - line.start
        parsed = _parse_numeric(value_raw)

        if parsed is None or window < _STAT_MIN_WINDOW_FOR_COUNTUP:
            # Non-numeric (or too-short window) fact: single pop-in event
            # for the whole window, big value + small label underneath.
            pop = "\\fscx55\\fscy55\\alpha&HFF&\\t(0,140,1,\\fscx100\\fscy100\\alpha&H00&)"
            text = (
                f"{prefix}{{{pop}\\fs{look['big_size']}}}{_esc(_safe_upper(value_raw))}{unit_suffix}"
                f"\\N{{\\fs{_STAT_SMALL_SIZE}}}{label}"
            )
            events.append(_dlg(line.start, line.end, text, style="Stat"))
            continue

        target, decimals = parsed
        use_commas = target >= 1000
        count_dur = max(_STAT_MIN_COUNT_DURATION, min(_STAT_MAX_COUNT_DURATION, window * _STAT_COUNT_UP_FRACTION))
        count_dur = min(count_dur, window)
        step_dur = count_dur / _STAT_COUNT_STEPS

        for step in range(_STAT_COUNT_STEPS):
            step_val = target * (step + 1) / _STAT_COUNT_STEPS
            s = line.start + step * step_dur
            e = line.start + (step + 1) * step_dur if step < _STAT_COUNT_STEPS - 1 else line.start + count_dur
            override = f"{{\\fs{look['big_size']}}}"
            if step == 0:
                override = "{\\fscx55\\fscy55\\alpha&HFF&\\t(0,140,1,\\fscx100\\fscy100\\alpha&H00&)" f"\\fs{look['big_size']}}}"
            text = f"{prefix}{override}{_esc(_format_number(step_val, decimals, use_commas))}{unit_suffix}"
            events.append(_dlg(s, e, text, style="Stat"))

        # Hold: settled final value + label for the remainder of the window,
        # with a small landing bounce as it arrives at the real number.
        hold_start = line.start + count_dur
        bounce = "\\t(0,90,1,\\fscx108\\fscy108)\\t(90,220,1,\\fscx100\\fscy100)"
        text = (
            f"{prefix}{{{bounce}\\fs{look['big_size']}}}"
            f"{_esc(_format_number(target, decimals, use_commas))}{unit_suffix}"
            f"\\N{{\\fs{_STAT_SMALL_SIZE}}}{label}"
        )
        events.append(_dlg(hold_start, line.end, text, style="Stat"))

    return events


# ══════════════════════════════════════════════════════════════
#  Combined .ass document — narration captions + stat callouts
# ══════════════════════════════════════════════════════════════

def _build_ass_content(
    narration_lines: list[TimedLine], facts_by_key: dict, seed: str,
    caption_style: str, caption_color: str, caption_y: float,
) -> str:
    x, y, alignment = _resolve_slider_pos(caption_y)
    style_key = caption_style if caption_style in _BASE_STYLES else "minimal"
    color_key = caption_color if caption_color in COLOR_COMBOS else _CAPTIONS_DEFAULT_COLOR
    build = _BUILDERS.get(style_key, _BUILDERS["minimal"])

    narration_caps = [Caption(start=l.start, end=l.end, text=l.text) for l in narration_lines]
    style_lines = [_style_line(style_key, color_key, alignment, CAPTION_FONT), _stat_style_line()]
    events = build(narration_caps, x, y, 3) + _stat_events(narration_lines, facts_by_key, seed)

    return _ASS_HEADER.format(style_lines="\n".join(style_lines), events="\n".join(events))


# ══════════════════════════════════════════════════════════════
#  Audio mix (TTS narration + ducked music)
# ══════════════════════════════════════════════════════════════

def _music_duck_expr(base_vol: float, lines: list[TimedLine]) -> str:
    duck_vol = base_vol * MUSIC_DUCK_FACTOR
    ramp = MUSIC_DUCK_RAMP_SECONDS
    expr = f"{base_vol:.3f}"
    for line in reversed(lines):
        s, e = line.start, line.end
        duck_in_end = s + ramp
        duck_out_start = max(s, e - ramp)
        fade_in = f"({base_vol:.3f}+({duck_vol:.3f}-({base_vol:.3f}))*(t-{s:.3f})/{ramp:.3f})"
        fade_out = f"({duck_vol:.3f}+({base_vol:.3f}-({duck_vol:.3f}))*(t-{duck_out_start:.3f})/{ramp:.3f})"
        held = (
            f"if(lt(t,{duck_in_end:.3f}),{fade_in},"
            f"if(lt(t,{duck_out_start:.3f}),{duck_vol:.3f},{fade_out}))"
        )
        expr = f"if(between(t,{s:.3f},{e:.3f}),{held},{expr})"
    return expr


def _audio_mix_filter(
    lines: list[TimedLine], music_path: Path | None, music_volume: float,
    input_index_map: dict[str, int],
) -> tuple[str, str]:
    parts: list[str] = []
    mix_inputs: list[str] = []

    for i, line in enumerate(lines):
        idx = input_index_map[f"line_{i}"]
        delay_ms = int(line.start * 1000)
        label = f"a_line{i}"
        parts.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms}[{label}]")
        mix_inputs.append(f"[{label}]")

    if music_path is not None:
        idx = input_index_map["music"]
        vol = max(0.2, min(0.6, music_volume))
        duck_expr = _music_duck_expr(vol, lines)
        parts.append(f"[{idx}:a]volume='{duck_expr}':eval=frame[a_music]")
        mix_inputs.append("[a_music]")

    parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=longest:normalize=0[aout]")
    return ";".join(parts), "aout"


# ══════════════════════════════════════════════════════════════
#  Render
# ══════════════════════════════════════════════════════════════

async def render(
    gameplay_clip_path: Path | str,   # local path, or a GCS URL to stream directly
    images: dict[str, Path],         # {stat_key: local image path} — one per fact, always downloaded first (see factloop_stage.py)
    lines: list[TimedLine],
    facts: list[dict],                # [{key, label, value, unit}]
    clip_duration: float,
    caption_style: str,
    caption_color: str,
    output_path: Path,
    seed: str,                        # job_id — deterministic per-stat font/color/position pick
    caption_y: float = 0.82,
    music_path: Path | None = None,
    music_volume: float = 0.3,
    threads: int = 1,
    on_progress=None,   # optional async callable(frac: float) -> None
) -> Path:
    """Composite gameplay background + up-centric per-fact images + animated
    stat callouts + mixed narration/music audio + burned captions into one
    MP4. Single ffmpeg invocation, same shape as the old
    brainrot_composite.render()."""

    facts_by_key = {f["key"]: f for f in facts}

    image_segments = _resolve_image_segments(lines, images, clip_duration)
    if not image_segments:
        raise RuntimeError("factloop_composite: no image segments resolved — at least one fact image is required")

    inputs: list[str] = ["-stream_loop", "-1", "-i", str(gameplay_clip_path)]
    input_index_map: dict[str, int] = {}
    next_idx = 1  # 0 is the gameplay clip

    for i, (img_path, _start, _end) in enumerate(image_segments):
        input_index_map[f"image_{i}"] = next_idx
        inputs += ["-loop", "1", "-i", str(img_path)]
        next_idx += 1

    for i, line in enumerate(lines):
        input_index_map[f"line_{i}"] = next_idx
        inputs += ["-i", str(line.audio_path)]
        next_idx += 1

    if music_path is not None:
        input_index_map["music"] = next_idx
        inputs += ["-stream_loop", "-1", "-i", str(music_path)]
        next_idx += 1

    filter_parts: list[str] = []

    # Per-fact images: each one is up-centric, visible only during its own
    # time segment (enable=between(...)), with a Ken Burns zoom that resets
    # locally per segment (t is offset by that segment's own start and
    # clamped to [0,1] of its own duration) rather than accumulating across
    # the whole clip. eval=frame makes ffmpeg's overlay filter resolve
    # overlay_w/overlay_h fresh every frame, so x/y auto-recenter as each
    # image grows — no windowed piecewise position math needed (unlike the
    # old character entry/exit system, which had actual on/off-screen
    # states to animate between). Chained sequentially: gameplay -> overlay
    # image 0 -> overlay image 1 -> ... -> final label always named "bg1"
    # so the ASS-burn step below can reference it without knowing how many
    # images there were.
    base_w = _even(CANVAS_W * IMAGE_WIDTH_FRAC)
    center_y = IMAGE_CENTER_Y_FRAC * CANVAS_H
    prev_label = "0:v"
    for i, (_img_path, seg_start, seg_end) in enumerate(image_segments):
        img_idx = input_index_map[f"image_{i}"]
        seg_dur = max(0.01, seg_end - seg_start)
        local_t = f"min(1,max(0,(t-{seg_start:.3f})/{seg_dur:.3f}))"
        filter_parts.append(
            f"[{img_idx}:v]scale=w='{base_w}*(1+{IMAGE_KEN_BURNS_GAIN}*({local_t}))':"
            f"h=-1:eval=frame[img_s{i}]"
        )
        is_last = i == len(image_segments) - 1
        out_label = "bg1" if is_last else f"imgbg{i}"
        filter_parts.append(
            f"[{prev_label}][img_s{i}]overlay=x='(main_w-overlay_w)/2':"
            f"y='{center_y:.1f}-overlay_h/2':enable='between(t,{seg_start:.3f},{seg_end:.3f})'[{out_label}]"
        )
        prev_label = out_label

    audio_filter, audio_label = _audio_mix_filter(lines, music_path, music_volume, input_index_map)
    filter_parts.append(audio_filter)

    ass_content = _build_ass_content(lines, facts_by_key, seed, caption_style, caption_color, caption_y)
    with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
        f.write(ass_content)
        ass_path = f.name
    # Single-quote-wrap the escaped path — robust for both a Linux absolute
    # path (/tmp/x.ass) and a Windows drive-lettered one (C\:/.../x.ass);
    # the bare unquoted `ass=C\:/...` form the old brainrot code used splits
    # on the drive colon under newer ffmpeg builds.
    safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
    filter_parts.append(f"[bg1]ass='{safe_ass}'[vout]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", f"[{audio_label}]",
        "-t", f"{clip_duration:.3f}",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-threads", str(threads), "-filter_complex_threads", str(threads),
        "-progress", "pipe:1", "-nostats",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )

    async def _drain_progress() -> None:
        async for raw in proc.stdout:
            if on_progress is None or clip_duration <= 0:
                continue
            line_out = raw.decode(errors="ignore").strip()
            if not line_out.startswith("out_time_us="):
                continue
            try:
                seconds = int(line_out.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            try:
                await on_progress(min(1.0, max(0.0, seconds / clip_duration)))
            except Exception:
                logger.warning("factloop_composite on_progress callback failed", exc_info=True)

    try:
        _, stderr = await asyncio.gather(_drain_progress(), proc.stderr.read())
        returncode = await proc.wait()
        if returncode != 0:
            raise RuntimeError(f"factloop_composite ffmpeg failed: {stderr.decode()[-1500:]}")
    except asyncio.CancelledError:
        proc.kill()
        await proc.communicate()
        raise
    finally:
        Path(ass_path).unlink(missing_ok=True)

    return output_path
