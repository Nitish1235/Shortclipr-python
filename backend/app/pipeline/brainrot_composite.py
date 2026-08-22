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

from app.pipeline.captions import (
    _ASS_HEADER, _BASE_STYLES, _BUILDERS, _resolve_slider_pos, _style_line,
    Caption, COLOR_COMBOS, DEFAULT_COLOR as _CAPTIONS_DEFAULT_COLOR,
)  # noqa: F401 — Caption's dataclass is used below; the rest are captions.py's
   # internal building blocks, reused (not modified) for _dual_speaker_ass_content

logger = logging.getLogger(__name__)

CANVAS_W, CANVAS_H = 1080, 1920
SLIDE_RAMP_SECONDS = 0.28   # default travel time to move fully on/off screen
POP_RAMP_SECONDS = 0.14     # faster ramp for the "pop" motion
CUT_RAMP_SECONDS = 0.001    # effectively instant (no visible travel)
BOUNCE_RAMP_SECONDS = 0.45  # slower — needs room for the overshoot to read
FLOAT_RAMP_SECONDS = 0.65   # slower still — a "float", not a "rise"
SNAP_RAMP_SECONDS = 0.09    # faster than pop, slower than cut — a spring release

# "none" motion: no travel at all (same dx/dy=0 as "cut"), so it needs its
# own cue that it's now this character's turn — a small grow-in-place
# instead of a move. NONE_SCALE_BOOST is a multiplier on top of whatever
# base scale the character is already set to (char.scale), so it layers
# correctly regardless of how big/small the user has sized them.
NONE_SCALE_BOOST = 1.08
NONE_SCALE_RAMP_SECONDS = 0.18

# Idle sway (present but not currently speaking) vs talk-bob (actively
# speaking this line) — both are small continuous Y-axis oscillations
# layered on top of the character's held position, driven by `t` the same
# way the entry/exit ramps are. Idle is a slow gentle "breathing" sway;
# talk is snappier and always-positive (a nod, not a float) so a speaking
# character visibly reads as animated rather than a frozen PNG.
IDLE_SWAY_AMPLITUDE_PX = 6.0
IDLE_SWAY_HZ = 0.6
TALK_BOB_AMPLITUDE_PX = 10.0
TALK_BOB_HZ = 1.7

# Background music ducks to this fraction of its set volume while any
# character is speaking, with a short fade at each edge so it's a duck,
# not a click.
MUSIC_DUCK_FACTOR = 0.35
MUSIC_DUCK_RAMP_SECONDS = 0.15

# Caption font — brainrot never exposes a font picker, so this is the one
# fixed choice for every clip. "anton" (ultra-condensed bold display) reads
# as a proper punchy brainrot/meme caption instead of captions.py's generic
# "default" (Liberation Sans), which is what every brainrot clip was
# silently rendering with before this.
CAPTION_FONT = "anton"

# Right-speaker caption colour, keyed by the user's chosen caption_color —
# gives each side of a two-character argument its own caption colour so
# they're visually distinguishable at a glance, without adding a second
# "caption color" picker to the UI. Reuses captions.py's existing combo
# catalog (see COLOR_COMBOS) rather than inventing new colours, and each
# pairing was picked to read as intentionally different, not clashing.
_RIGHT_CAPTION_COLOR: dict[str, str] = {
    "yellow_black":        "electric_blue_white",
    "white_black":         "hot_pink_black",
    "black_white":         "red_white",
    "butter_yellow":       "ice_blue",
    "hot_pink_black":      "cyan_dark",
    "electric_blue_white": "yellow_black",
    "pure_white":          "gold_premium",
    "gold_premium":        "pure_white",
    "ice_blue":            "orange_dark",
    "green_dark":          "hot_pink_black",
    "orange_dark":         "electric_blue_white",
    "cyan_dark":           "orange_dark",
    "red_white":           "electric_blue_white",
}

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
    # local filesystem Path when used for composite.render() (the actual
    # ffmpeg -i input); a GCS URL string when used transiently in the API
    # stage to hand the line off to db.set_brainrot_scene_plan().
    audio_path: Path | str


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


_CHAR_BASE_WIDTH_FRAC = 0.47  # a scale=1.0 character is ~47% of canvas width


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
) -> tuple[float, float, float, str]:
    """Resolve a motion id to (dx, dy, ramp_seconds, ease): the offset added
    to the character's on-screen (x, y) that parks it just off-canvas for
    that motion, how long the travel ramp lasts, and which easing curve
    _axis_expr should drive it with. dx/dy are large enough to hide the
    character fully; the exact magnitude only needs to clear the frame.

    `side` here is the NEAREST edge (caller passes the near_side computed
    from char.x in _character_overlay_filter), not char.side's dialogue-slot
    label — a side-anchored motion always travels to/from whichever edge the
    character is actually closest to on screen."""
    if motion_id == "rise":
        # Start/end below the bottom edge.
        return 0.0, (CANVAS_H + 40) - on_y, SLIDE_RAMP_SECONDS, "ease"
    if motion_id == "drop":
        # Start/end above the top edge.
        return 0.0, -(char_h + 40) - on_y, SLIDE_RAMP_SECONDS, "ease"
    if motion_id == "pop":
        # Small quick nudge up into place — reads as a pop, not a full slide.
        return 0.0, 90.0, POP_RAMP_SECONDS, "ease"
    if motion_id in ("cut", "none"):
        # No travel — appears/disappears in place. "none" is the same
        # underlying treatment as "cut", just a more discoverable label for
        # anyone specifically looking for "no animation" (see
        # animation_catalog.py). Easing is moot at this ramp length but
        # "ease" is still numerically safe (see _ease()).
        return 0.0, 0.0, CUT_RAMP_SECONDS, "ease"
    if motion_id == "bounce":
        # Off the character's own side edge, like slide, but flies past the
        # landing point and settles back — a damped-spring overshoot rather
        # than a straight glide. Needs a slower ramp for the overshoot to
        # actually read on screen instead of looking like a glitch.
        off_x = (-char_w - 40) if side == "left" else (CANVAS_W + 40)
        return off_x - on_x, 0.0, BOUNCE_RAMP_SECONDS, "bounce"
    if motion_id == "float":
        # Same start point as "rise" (below the bottom edge) but a much
        # slower ramp with the standard decelerate-into-place ease — reads
        # as drifting up, not popping up.
        return 0.0, (CANVAS_H + 40) - on_y, FLOAT_RAMP_SECONDS, "ease"
    if motion_id == "swoop":
        # Diagonal: off the character's own side edge (like slide) AND
        # starting partway above its resting height, so the travel path is
        # an arc rather than a straight horizontal glide. The Y component
        # only needs to be visible-ish since the character is off-canvas on
        # X for the whole ramp anyway.
        off_x = (-char_w - 40) if side == "left" else (CANVAS_W + 40)
        return off_x - on_x, -(char_h * 0.6), SLIDE_RAMP_SECONDS, "ease"
    if motion_id == "snap":
        # Off the character's own side edge, like slide, but with an
        # accelerate-FROM-rest ease (see _ease_ramp "in") and a very short
        # ramp — the character barely moves at first, then whips into place
        # right at the end, like a released spring rather than a glide.
        off_x = (-char_w - 40) if side == "left" else (CANVAS_W + 40)
        return off_x - on_x, 0.0, SNAP_RAMP_SECONDS, "snap"
    # "slide" (default): off the character's own side edge, horizontally.
    off_x = (-char_w - 40) if side == "left" else (CANVAS_W + 40)
    return off_x - on_x, 0.0, SLIDE_RAMP_SECONDS, "ease"


def _ease_ramp(kind: str, t_expr: str, duration: float, start_val: float, end_val: float) -> str:
    """One eased ramp from start_val to end_val over `duration`, as a
    function of `t_expr` (an ffmpeg time expression, e.g. "t-1.200" —
    always evaluates in [0, duration] because the caller only ever
    substitutes this inside an if(between(...)) branch bounding that range).

    "out"    — decelerates into place (1-(1-p)^3). Used for entries: the
               character lands gently instead of snapping to a stop.
    "in"     — accelerates away (p^3). Used for exits: picks up speed as it
               leaves instead of drifting off at a constant rate.
    "bounce" — damped spring overshoot (entry only, see _motion_offset)."""
    p = f"(({t_expr})/{duration:.4f})"
    diff = f"({end_val:.1f}-({start_val:.1f}))"
    if kind == "bounce":
        # Damped harmonic: overshoots past 1.0 once around p≈0.35 then
        # settles to ~1.0 by p=1. exp()/cos() are standard ffmpeg eval funcs.
        progress = f"(1-exp(-5*{p})*cos(2*PI*1.5*{p}))"
    elif kind == "in":
        progress = f"pow({p},3)"
    else:  # "out" (default) — also correct (if slightly generous) for cut/pop
        progress = f"(1-pow(1-{p},3))"
    return f"({start_val:.1f}+{diff}*{progress})"


def _scale_expr(windows: list[tuple[float, float]], ramp_in: float, ramp_out: float, boost: float) -> str:
    """Piecewise scale-PERCENT expression (100 = 1.0x — _ease_ramp formats
    values at .1f precision, and 1.08 would round to 1.1, turning an 8%
    boost into 10%; working in percent keeps 108.0 exact). Divide the
    result by 100 at the call site.

    100 outside any window. Inside a window: ramps up to boost*100 over
    ramp_in at the start (jumps straight there if ramp_in is 0 — that side
    isn't "none", so its own position motion already handles the entry and
    scale should just already be at rest, not mid-ramp), holds at
    boost*100 through the window, ramps back to 100 over ramp_out at the
    end (same skip rule). Reuses _ease_ramp's "out"/"in" curves so the
    grow/shrink reads consistently with the position ramps elsewhere.

    This is the stand-in visual cue for the "none" motion (see
    animation_catalog.py) — since it has zero travel (same as "cut"), a
    small grow-in-place is what signals "it's this character's turn now"
    instead of a move."""
    boost_pct = boost * 100.0
    expr = "100.0"
    for start, end in reversed(windows):
        ramp_in_end = start + ramp_in
        ramp_out_start = end - ramp_out
        entry = (
            _ease_ramp("out", f"t-{start:.3f}", ramp_in, 100.0, boost_pct)
            if ramp_in > 0 else f"{boost_pct:.1f}"
        )
        exit_ = (
            _ease_ramp("in", f"t-{ramp_out_start:.3f}", ramp_out, boost_pct, 100.0)
            if ramp_out > 0 else f"{boost_pct:.1f}"
        )
        hold = f"{boost_pct:.1f}"
        window_expr = (
            f"if(lt(t,{ramp_in_end:.3f}),{entry},"
            f"if(lt(t,{ramp_out_start:.3f}),{hold},{exit_}))"
        )
        expr = (
            f"if(lt(t,{start:.3f}),100.0,"
            f"if(between(t,{start:.3f},{end:.3f}),{window_expr},{expr}))"
        )
    return expr


def _presence_sway_expr(base_val: float, speak_windows: list[tuple[float, float]]) -> str:
    """Y-axis micro-motion applied during the HELD portion of a presence
    window (never during the entry/exit ramps themselves, which have their
    own dedicated easing) — this is what turns a character from a frozen
    PNG into something that reads as alive while it waits or talks.

    Outside any speak_window: a slow, smooth breathing sway (plain sin).
    Inside one (this character is the one actually talking right now): a
    faster, always-downward-biased nod (abs(sin)) so a speaking character
    visibly reads as more animated than one just standing there."""
    idle = f"({base_val:.1f}+{IDLE_SWAY_AMPLITUDE_PX}*sin(2*PI*{IDLE_SWAY_HZ}*t))"
    expr = idle
    for start, end in reversed(speak_windows):
        talk = (
            f"({base_val:.1f}+{TALK_BOB_AMPLITUDE_PX}"
            f"*abs(sin(2*PI*{TALK_BOB_HZ}*(t-{start:.3f}))))"
        )
        expr = f"if(between(t,{start:.3f},{end:.3f}),{talk},{expr})"
    return expr


def _axis_expr(
    windows: list[tuple[float, float]],
    on_val: float,
    enter_start_val: float,
    exit_end_val: float,
    ramp_in: float,
    ramp_out: float,
    entry_ease: str = "ease",
    exit_ease: str = "ease",
    speak_windows: list[tuple[float, float]] | None = None,
) -> str:
    """Piecewise position expression for ONE axis (x or y).

    Per window: ease enter_start_val -> on_val over ramp_in, hold at on_val
    (with idle/talk sway layered in if speak_windows is given — Y-axis calls
    only, see _character_overlay_filter), then ease on_val -> exit_end_val
    over ramp_out. Outside a window the character sits at enter_start_val
    (ready to re-enter) before/between windows, and at exit_end_val after the
    final window — both off-canvas, so the discontinuity between them is
    never visible. Built outside-in in the same nested-if style as
    extractor.py's _zoom_expr().

    entry_ease also accepts "snap" (see _motion_offset) — an accelerate-
    FROM-rest curve (_ease_ramp's "in" kind) that makes the character barely
    move at first then whip into place, instead of "out"'s decelerate-INTO-
    place glide."""
    hold_expr = (
        _presence_sway_expr(on_val, speak_windows) if speak_windows is not None
        else f"{on_val:.1f}"
    )
    entry_kind = "bounce" if entry_ease == "bounce" else ("in" if entry_ease == "snap" else "out")
    expr = f"{exit_end_val:.1f}"  # resting place after the last window
    for start, end in reversed(windows):
        ramp_in_end = start + ramp_in
        ramp_out_start = end - ramp_out
        entry = _ease_ramp(
            entry_kind,
            f"t-{start:.3f}", ramp_in, enter_start_val, on_val,
        )
        # "bounce" applied to an exit overshoots PAST exit_end_val before
        # settling — harmless (and gives a nice anticipation wobble) since
        # exit_end_val is always off-canvas, so the overshoot/settle both
        # happen out of frame.
        exit_ = _ease_ramp(
            "bounce" if exit_ease == "bounce" else "in",
            f"t-{ramp_out_start:.3f}", ramp_out, on_val, exit_end_val,
        )
        window_expr = (
            f"if(lt(t,{ramp_in_end:.3f}),{entry},"
            f"if(lt(t,{ramp_out_start:.3f}),{hold_expr},{exit_}))"
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


def _speaking_windows(lines: list[TimedLine], side: str) -> list[tuple[float, float]]:
    """(start, end) of every line `side` actually speaks — distinct from
    _active_windows' presence windows. In turn_based mode these are nearly
    the same thing (a presence window IS a run of this character's lines),
    but in always_on mode presence spans the whole clip while speaking is
    sparse inside it — this is what lets the idle-vs-talk sway in
    _presence_sway_expr tell "on screen" apart from "talking right now"."""
    return [(l.start, l.end) for l in lines if l.speaker == side]


def _character_overlay_filter(
    char: CharacterPlacement,
    input_label: str,
    bg_label: str,
    out_label: str,
    windows: list[tuple[float, float]],
    speak_windows: list[tuple[float, float]],
) -> str:
    """One [scale][overlay] pair for a single character, with independent
    entry and exit motions (see animation_catalog.py / _motion_offset) driven
    on both axes by _axis_expr, plus idle/talk sway (Y-axis only — see
    _presence_sway_expr) layered into the held portion of each window.
    "cut"/"none" (zero-travel motions) additionally get an explicit
    overlay `enable=` hide/show toggle, and "none" gets a time-varying
    `scale=` expression that grows it slightly while active — see the
    comments where those are built, below."""
    char_w = _even(CANVAS_W * _CHAR_BASE_WIDTH_FRAC * char.scale)
    char_h = char_w * _CHAR_ASPECT
    # x AND y are both center-point coordinates on the frontend (PreviewStage.jsx
    # positions with CSS left/top at x*100%,y*100% then translate(-50%,-50%) to
    # center on that point) — both need the same center-to-top-left conversion
    # ffmpeg's overlay filter expects. Only x used to do this; y was placing the
    # character's TOP edge at y*CANVAS_H instead of its center, pushing anyone
    # positioned in the normal 0.75-0.95 "standing near the bottom" range mostly
    # or entirely below the visible frame.
    on_x = float(_even(char.x * CANVAS_W - char_w / 2))
    on_y = float(_even(char.y * CANVAS_H - char_h / 2))

    # Which edge a side-anchored motion (slide/bounce/swoop/snap, and the
    # off-canvas park below) travels to/from is driven by where the
    # character actually SITS on screen (char.x vs canvas center) — not by
    # its "left"/"right" speaker-slot label. char.side is a dialogue/casting
    # concept (who's assigned that side of the argument); a user can freely
    # drag a "left" character anywhere via the preview stage, and once
    # they're closer to the right edge, their motion should travel to/from
    # the right edge too, or the entry/exit reads as backwards.
    near_side = "left" if char.x < 0.5 else "right"

    rotate = f"rotate={char.rotation}*PI/180:c=none[{input_label}_rot];[{input_label}_rot]" if char.rotation else f"[{input_label}]"

    if not windows:
        # Character never speaks — park it fully off-canvas on its own side.
        off_x = (-char_w - 40) if near_side == "left" else (CANVAS_W + 40)
        return (
            f"{rotate}scale={char_w}:-1[{input_label}_s];"
            f"[{bg_label}][{input_label}_s]overlay=x={int(off_x)}:y={int(on_y)}[{out_label}]"
        )

    entry_dx, entry_dy, entry_ramp, entry_ease = _motion_offset(char.entry, near_side, on_x, on_y, char_w, char_h)
    exit_dx, exit_dy, exit_ramp, exit_ease = _motion_offset(char.exit, near_side, on_x, on_y, char_w, char_h)

    x_expr = _axis_expr(
        windows, on_x, on_x + entry_dx, on_x + exit_dx, entry_ramp, exit_ramp,
        entry_ease, exit_ease,  # no sway on X — idle/talk motion is vertical only
    )
    y_expr = _axis_expr(
        windows, on_y, on_y + entry_dy, on_y + exit_dy, entry_ramp, exit_ramp,
        entry_ease, exit_ease, speak_windows,
    )

    # "cut" and "none" both resolve to dx=dy=0 (see _motion_offset) — the
    # character never travels off-canvas, so unlike every other motion it
    # needs an explicit hide/show toggle instead of relying on position to
    # clear the frame. Scoped to when BOTH entry and exit lack travel (the
    # normal way to pick either) so it never fights a real position ramp on
    # the other side of a mixed pairing.
    enable_clause = ""
    if char.entry in ("cut", "none") and char.exit in ("cut", "none"):
        windows_bool = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in windows)
        enable_clause = f":enable='{windows_bool}'"

    # "none" additionally grows the character slightly while it's their
    # turn — the size cue standing in for the travel "none"/"cut" skip.
    scale_filter = f"scale={char_w}:-1"
    if char.entry == "none" or char.exit == "none":
        ramp_in = NONE_SCALE_RAMP_SECONDS if char.entry == "none" else 0.0
        ramp_out = NONE_SCALE_RAMP_SECONDS if char.exit == "none" else 0.0
        scale_pct_expr = _scale_expr(windows, ramp_in, ramp_out, NONE_SCALE_BOOST)
        scale_filter = f"scale=w='{char_w}*({scale_pct_expr})/100':h=-1:eval=frame"

    return (
        f"{rotate}{scale_filter}[{input_label}_s];"
        f"[{bg_label}][{input_label}_s]overlay=x='{x_expr}':y='{y_expr}'{enable_clause}[{out_label}]"
    )


def _music_duck_expr(base_vol: float, lines: list[TimedLine]) -> str:
    """Volume envelope for the music bed: holds at base_vol, dips to
    MUSIC_DUCK_FACTOR*base_vol (with a short fade, not a hard cut) for the
    duration of every dialogue line, then recovers. Same piecewise
    ramp-hold-ramp technique as _axis_expr, applied to a scalar instead of
    a position. Used with the `volume` filter's eval=frame so ffmpeg
    re-evaluates it against the current `t` on every audio frame."""
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
        # Genuinely ducked now (see _music_duck_expr) — dips under whichever
        # character is talking instead of sitting at one flat level for the
        # whole clip, which is what the old code (and its docstring, which
        # overstated this) actually did.
        duck_expr = _music_duck_expr(vol, lines)
        parts.append(f"[{idx}:a]volume='{duck_expr}':eval=frame[a_music]")
        mix_inputs.append("[a_music]")

    if intro_sfx is not None:
        idx = input_index_map["intro_sfx"]
        # Light headroom — stinger assets are often mastered hotter than
        # dialogue/TTS output and would otherwise overpower it at t=0.
        parts.append(f"[{idx}:a]volume=0.8[a_intro]")
        mix_inputs.append("[a_intro]")

    if outro_sfx is not None:
        idx = input_index_map["outro_sfx"]
        last_end = max((l.end for l in lines), default=0.0)
        delay_ms = int(last_end * 1000)
        parts.append(f"[{idx}:a]volume=0.8,adelay={delay_ms}|{delay_ms}[a_outro]")
        mix_inputs.append("[a_outro]")

    parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=longest:normalize=0[aout]")
    return ";".join(parts), "aout"


def _dual_speaker_ass_content(
    lines: list[TimedLine], style: str, color: str, caption_y: float,
) -> str:
    """Builds one .ass document with the LEFT/narrator speaker's lines in
    `color` and the RIGHT speaker's lines in that color's paired alternate
    (see _RIGHT_CAPTION_COLOR) — two characters' captions read as visually
    distinct instead of one flat colour for the whole argument.

    captions.py's public build_ass_content() only takes one flat caption
    list + one colour, with no speaker concept, and touching it to add one
    would ripple through all 16 style builders in a file the main YouTube
    Shorts pipeline also depends on. Instead this calls captions.py's own
    internal building blocks (_style_line/_BUILDERS/_ASS_HEADER — the exact
    same code every style already renders through) once per speaker, at two
    different colours, and merges the results into one .ass — same visual
    system, captions.py itself untouched. Coupled to those internals by
    name, so a captions.py refactor that renames them would need this
    function updated too."""
    x, y, alignment = _resolve_slider_pos(caption_y)
    style_key = style if style in _BASE_STYLES else "minimal"
    color_key = color if color in COLOR_COMBOS else _CAPTIONS_DEFAULT_COLOR
    right_color_key = _RIGHT_CAPTION_COLOR.get(color_key, color_key)
    build = _BUILDERS.get(style_key, _BUILDERS["minimal"])

    left_caps  = [Caption(start=l.start, end=l.end, text=l.text) for l in lines if l.speaker != "right"]
    right_caps = [Caption(start=l.start, end=l.end, text=l.text) for l in lines if l.speaker == "right"]

    style_lines = [_style_line(style_key, color_key, alignment, CAPTION_FONT)]
    events = build(left_caps, x, y, 3)

    if right_caps:
        style_lines.append(
            _style_line(style_key, right_color_key, alignment, CAPTION_FONT)
            .replace("Style: Default,", "Style: Right,", 1)
        )
        events += [e.replace(",Default,,", ",Right,,", 1) for e in build(right_caps, x, y, 3)]

    return _ASS_HEADER.format(style_lines="\n".join(style_lines), events="\n".join(events))


async def render(
    gameplay_clip_path: Path,
    lines: list[TimedLine],
    characters: list[CharacterPlacement],
    motion_mode: str,          # "turn_based" | "always_on"
    clip_duration: float,
    caption_style: str,
    caption_color: str,
    output_path: Path,
    caption_y: float = 0.82,   # 0=top, 1=bottom, canvas-relative — see captions.py's _resolve_slider_pos
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

    # A single character never cycles — turn_based only makes sense when
    # there's someone to swap in. With one character, any lead-in or
    # trailing silence outside the dialogue window would flicker them
    # off screen, so force always_on here instead.
    effective_motion_mode = "always_on" if len(characters) <= 1 else motion_mode

    filter_parts = [_base_crop_filter("0:v", "bg0")]
    bg_label = "bg0"
    for i, char in enumerate(characters):
        idx = input_index_map[f"char_{char.side}"]
        windows = _active_windows(lines, char.side, effective_motion_mode, clip_duration)
        speak_windows = _speaking_windows(lines, char.side)
        out_label = f"bg{i + 1}"
        filter_parts.append(_character_overlay_filter(char, f"{idx}:v", bg_label, out_label, windows, speak_windows))
        bg_label = out_label

    audio_filter, audio_label = _audio_mix_filter(
        lines, music_path, music_volume, intro_sfx, outro_sfx, input_index_map,
    )
    filter_parts.append(audio_filter)

    ass_content = _dual_speaker_ass_content(lines, caption_style, caption_color, caption_y)
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

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"brainrot_composite ffmpeg failed: {stderr.decode()[-1500:]}")
    except asyncio.CancelledError:
        # Outer stage timeout (BRAINROT_STAGE_TIMEOUT_SECONDS) cancels this
        # await — cancelling proc.communicate() does NOT kill the child
        # process, so without this it keeps running/consuming CPU in the
        # background until it exits on its own.
        proc.kill()
        await proc.communicate()
        raise
    finally:
        Path(ass_path).unlink(missing_ok=True)

    return output_path
