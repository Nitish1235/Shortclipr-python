"""
brainrot_composite.py — renders one Brainrot Clips Maker output video.

Reuses the same techniques already proven out in extractor.py rather than
inventing new ffmpeg approaches:
  - full-screen crop-to-fill: same scale+crop math as extractor.py's
    _fc_full_screen() (that function isn't imported directly — it takes a
    face_track argument that has no meaning here — but the underlying
    "scale to cover, then center-crop" logic is identical).
  - piecewise timeline expressions: the entry/exit slide animation uses the
    same nested if(between(t,...)) chain technique as extractor.py's
    _zoom_expr() (extractor.py:484-503), just driving an overlay x-position
    instead of a zoompan scale factor.

Two character motion modes (per user spec):
  turn_based — whichever side is about to speak slides on screen from its
               exit edge; the other side slides off. Matches "character
               enters when it's their turn, exits when the other's turn
               comes" — the classic two-character brainrot format.
  always_on  — both characters stay on screen for the whole clip at their
               stored positions (no slide), for users who don't want the
               enter/exit motion.
"""
import asyncio
import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.pipeline.captions import Caption, build_ass_content

logger = logging.getLogger(__name__)

CANVAS_W, CANVAS_H = 1080, 1920
SLIDE_RAMP_SECONDS = 0.28   # default travel time to move fully on/off screen
POP_RAMP_SECONDS = 0.14     # faster ramp for the "pop" motion
CUT_RAMP_SECONDS = 0.001    # effectively instant (no visible travel)

# canon.png assets are 896x1152 → height/width. Used to estimate the overlay's
# pixel height (the scale filter uses -1, so exact height isn't known at build
# time) for pushing the character fully above/below the canvas on drop/rise.
_CHAR_ASPECT = 1152 / 896


@dataclass
class TimedLine:
    speaker: str        # "left" | "right" | "narrator"
    text: str
    start: float        # seconds, relative to clip start
    end: float
    audio_path: Path    # local TTS audio file for this line


@dataclass
class CharacterPlacement:
    side: str            # "left" | "right"
    image_path: Path     # local canon.png (or variant) for this character
    x: float             # normalized 0-1, canvas-relative, same convention as Editor.jsx
    y: float
    scale: float          # 1.0 = character rendered at its natural overlay size (see _CHAR_BASE_WIDTH_FRAC)
    rotation: float = 0.0  # degrees
    entry: str = "slide"   # entry motion id (see animation_catalog.py)
    exit: str = "slide"    # exit motion id


_CHAR_BASE_WIDTH_FRAC = 0.42  # a scale=1.0 character is ~42% of canvas width


def _even(n: float) -> int:
    """Round to nearest even int — libx264 requires even filter dimensions."""
    n = round(n)
    return n if n % 2 == 0 else n + 1


def _base_crop_filter(input_label: str, out_label: str) -> str:
    """Scale-to-cover + center-crop to the fixed 9:16 canvas. Same technique
    as extractor.py's _fc_full_screen(), without the face-tracking pan since
    gameplay backgrounds have no face to track."""
    return (
        f"[{input_label}]scale={CANVAS_W}:{CANVAS_H}:force_original_aspect_ratio=increase:flags=bicubic,"
        f"crop={CANVAS_W}:{CANVAS_H}[{out_label}]"
    )


def _motion_offset(
    motion_id: str, side: str, on_x: float, on_y: float, char_w: float, char_h: float,
) -> tuple[float, float, float]:
    """Resolve a motion id to (dx, dy, ramp_seconds): the offset added to the
    character's on-screen (x, y) that parks it just off-canvas for that motion,
    plus how long the travel ramp lasts. dx/dy are large enough to hide the
    character fully; the exact magnitude only needs to clear the frame."""
    if motion_id == "rise":
        # Start/end below the bottom edge.
        return 0.0, (CANVAS_H + 40) - on_y, SLIDE_RAMP_SECONDS
    if motion_id == "drop":
        # Start/end above the top edge.
        return 0.0, -(char_h + 40) - on_y, SLIDE_RAMP_SECONDS
    if motion_id == "pop":
        # Small quick nudge up into place — reads as a pop, not a full slide.
        return 0.0, 90.0, POP_RAMP_SECONDS
    if motion_id == "cut":
        # No travel — appears/disappears in place.
        return 0.0, 0.0, CUT_RAMP_SECONDS
    # "slide" (default): off the character's own side edge, horizontally.
    off_x = (-char_w - 40) if side == "left" else (CANVAS_W + 40)
    return off_x - on_x, 0.0, SLIDE_RAMP_SECONDS


def _axis_expr(
    windows: list[tuple[float, float]],
    on_val: float,
    enter_start_val: float,
    exit_end_val: float,
    ramp_in: float,
    ramp_out: float,
) -> str:
    """Piecewise position expression for ONE axis (x or y).

    Per window: ramp enter_start_val -> on_val over ramp_in, hold at on_val,
    then ramp on_val -> exit_end_val over ramp_out. Outside a window the
    character sits at enter_start_val (ready to re-enter) before/between
    windows, and at exit_end_val after the final window — both off-canvas, so
    the discontinuity between them is never visible. Built outside-in in the
    same nested-if style as extractor.py's _zoom_expr()."""
    expr = f"{exit_end_val:.1f}"  # resting place after the last window
    for start, end in reversed(windows):
        ramp_in_end = start + ramp_in
        ramp_out_start = end - ramp_out
        entry = (
            f"({enter_start_val:.1f}+({on_val:.1f}-({enter_start_val:.1f}))"
            f"*(t-{start:.3f})/{ramp_in})"
        )
        exit_ = (
            f"({on_val:.1f}+({exit_end_val:.1f}-({on_val:.1f}))"
            f"*(t-{ramp_out_start:.3f})/{ramp_out})"
        )
        window_expr = (
            f"if(lt(t,{ramp_in_end:.3f}),{entry},"
            f"if(lt(t,{ramp_out_start:.3f}),{on_val:.1f},{exit_}))"
        )
        expr = (
            f"if(lt(t,{start:.3f}),{enter_start_val:.1f},"
            f"if(between(t,{start:.3f},{end:.3f}),{window_expr},{expr}))"
        )
    return expr


def _active_windows(lines: list[TimedLine], side: str, motion_mode: str, clip_duration: float) -> list[tuple[float, float]]:
    """Windows (start, end) during which `side` should be visible on screen.

    turn_based: one window per contiguous run of lines spoken by `side` —
    the character is on screen only while it's actually their turn.
    always_on: a single window covering the whole clip.
    """
    if motion_mode == "always_on":
        return [(0.0, clip_duration)]

    windows: list[tuple[float, float]] = []
    run_start: float | None = None
    run_end: float | None = None
    for line in lines:
        if line.speaker == side:
            if run_start is None:
                run_start = line.start
            run_end = line.end
        else:
            if run_start is not None:
                windows.append((run_start, run_end))
                run_start = run_end = None
    if run_start is not None:
        windows.append((run_start, run_end))
    return windows


def _character_overlay_filter(
    char: CharacterPlacement,
    input_label: str,
    bg_label: str,
    out_label: str,
    windows: list[tuple[float, float]],
) -> str:
    """One [scale][overlay] pair for a single character, with independent
    entry and exit motions (see animation_catalog.py / _motion_offset) driven
    on both axes by _axis_expr."""
    char_w = _even(CANVAS_W * _CHAR_BASE_WIDTH_FRAC * char.scale)
    char_h = char_w * _CHAR_ASPECT
    on_x = float(_even(char.x * CANVAS_W - char_w / 2))
    on_y = float(_even(char.y * CANVAS_H))

    rotate = f"rotate={char.rotation}*PI/180:c=none[{input_label}_rot];[{input_label}_rot]" if char.rotation else f"[{input_label}]"

    if not windows:
        # Character never speaks — park it fully off-canvas on its own side.
        off_x = (-char_w - 40) if char.side == "left" else (CANVAS_W + 40)
        return (
            f"{rotate}scale={char_w}:-1[{input_label}_s];"
            f"[{bg_label}][{input_label}_s]overlay=x={int(off_x)}:y={int(on_y)}[{out_label}]"
        )

    entry_dx, entry_dy, entry_ramp = _motion_offset(char.entry, char.side, on_x, on_y, char_w, char_h)
    exit_dx, exit_dy, exit_ramp = _motion_offset(char.exit, char.side, on_x, on_y, char_w, char_h)

    x_expr = _axis_expr(windows, on_x, on_x + entry_dx, on_x + exit_dx, entry_ramp, exit_ramp)
    y_expr = _axis_expr(windows, on_y, on_y + entry_dy, on_y + exit_dy, entry_ramp, exit_ramp)

    return (
        f"{rotate}scale={char_w}:-1[{input_label}_s];"
        f"[{bg_label}][{input_label}_s]overlay=x='{x_expr}':y='{y_expr}'[{out_label}]"
    )


def _audio_mix_filter(lines: list[TimedLine], music_path: Path | None, music_volume: float,
                       intro_sfx: Path | None, outro_sfx: Path | None,
                       input_index_map: dict[str, int]) -> tuple[str, str]:
    """Builds the audio filter_complex fragment: delays each TTS line to its
    timeline position, mixes in ducked background music and optional
    intro/outro stingers. Returns (filter_string, output_label)."""
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
        vol = max(0.2, min(0.4, music_volume))
        parts.append(f"[{idx}:a]volume={vol}[a_music]")
        mix_inputs.append("[a_music]")

    if intro_sfx is not None:
        idx = input_index_map["intro_sfx"]
        mix_inputs.append(f"[{idx}:a]")

    if outro_sfx is not None:
        idx = input_index_map["outro_sfx"]
        last_end = max((l.end for l in lines), default=0.0)
        delay_ms = int(last_end * 1000)
        parts.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms}[a_outro]")
        mix_inputs.append("[a_outro]")

    parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=longest:normalize=0[aout]")
    return ";".join(parts), "aout"


async def render(
    gameplay_clip_path: Path,
    lines: list[TimedLine],
    characters: list[CharacterPlacement],
    motion_mode: str,          # "turn_based" | "always_on"
    clip_duration: float,
    caption_style: str,
    caption_color: str,
    output_path: Path,
    music_path: Path | None = None,
    music_volume: float = 0.3,
    intro_sfx: Path | None = None,
    outro_sfx: Path | None = None,
) -> Path:
    """Composite gameplay background + character overlays + mixed audio +
    burned-in captions into one MP4. Single ffmpeg invocation."""

    inputs: list[str] = ["-stream_loop", "-1", "-i", str(gameplay_clip_path)]
    input_index_map: dict[str, int] = {}
    next_idx = 1  # 0 is the gameplay clip

    for char in characters:
        input_index_map[f"char_{char.side}"] = next_idx
        inputs += ["-i", str(char.image_path)]
        next_idx += 1

    for i, line in enumerate(lines):
        input_index_map[f"line_{i}"] = next_idx
        inputs += ["-i", str(line.audio_path)]
        next_idx += 1

    if music_path is not None:
        input_index_map["music"] = next_idx
        inputs += ["-stream_loop", "-1", "-i", str(music_path)]
        next_idx += 1
    if intro_sfx is not None:
        input_index_map["intro_sfx"] = next_idx
        inputs += ["-i", str(intro_sfx)]
        next_idx += 1
    if outro_sfx is not None:
        input_index_map["outro_sfx"] = next_idx
        inputs += ["-i", str(outro_sfx)]
        next_idx += 1

    filter_parts = [_base_crop_filter("0:v", "bg0")]
    bg_label = "bg0"
    for i, char in enumerate(characters):
        idx = input_index_map[f"char_{char.side}"]
        windows = _active_windows(lines, char.side, motion_mode, clip_duration)
        out_label = f"bg{i + 1}"
        filter_parts.append(_character_overlay_filter(char, f"{idx}:v", bg_label, out_label, windows))
        bg_label = out_label

    audio_filter, audio_label = _audio_mix_filter(
        lines, music_path, music_volume, intro_sfx, outro_sfx, input_index_map,
    )
    filter_parts.append(audio_filter)

    captions = [Caption(start=l.start, end=l.end, text=l.text) for l in lines]
    ass_content = build_ass_content(captions, style=caption_style, color=caption_color)
    with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
        f.write(ass_content)
        ass_path = f.name
    safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
    filter_parts.append(f"[{bg_label}]ass={safe_ass}[vout]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", f"[{audio_label}]",
        "-t", f"{clip_duration:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-threads", "1", "-filter_complex_threads", "1",
        str(output_path),
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"brainrot_composite ffmpeg failed: {stderr.decode()[-1500:]}")
    finally:
        Path(ass_path).unlink(missing_ok=True)

    return output_path
