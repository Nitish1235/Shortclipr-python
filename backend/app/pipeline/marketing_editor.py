"""
marketing_editor.py — Admin-only timeline video assembly engine for
ShortClipr's own marketing clips (images + video segments + audio +
manually-timed multi-colour subtitles + hook title + logo + end card).

This is a SEPARATE pipeline from the YouTube-clip extractor — there is no
transcript/AI-clipper involved. The admin supplies every asset and timing
directly; this module just assembles them with ffmpeg.

──────────────────────────────────────────────────────────────────────
TIMELINE MODEL
──────────────────────────────────────────────────────────────────────
segments:  ordered list of {type: "image"|"video", path, duration
           (images only — videos use their own length unless trimmed),
           transition: "cut"|"fade"|"slideleft"|"slideright"|"wiperight",
           transition_duration}
audio:     ordered list of {path, mode: "sequence"|"background"}
           — "sequence" tracks are concatenated back-to-back (e.g. a
           voiceover read in two takes); "background" tracks loop under
           the whole sequenced timeline with optional auto-ducking.
subtitles: list of {start, end, groups: [{text, color}]} — every group
           in a line is visible simultaneously, each in its own colour
           (e.g. "first 2 words red, next 3 white").
hook_title, title_color, title_bg, title_bg_opacity, font: same as the
           main clip pipeline (reuses captions.py / title_box.py).
logo:      optional {path, position} persistent watermark.
end_card:  optional {text, sub_text} auto-generated CTA card appended
           as the final segment.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.pipeline.captions import (
    DEFAULT_FONT, FONT_OPTIONS, _dlg, _esc, _hook_position, _hook_style_line,
    _lines_hook_title, _safe_upper, compute_hook_duration,
)
from app.pipeline.extractor import ASPECT_DIMENSIONS
from app.pipeline.title_box import (
    DEFAULT_TITLE_BG, DEFAULT_TITLE_BG_OPACITY, DEFAULT_TITLE_TEXT_COLOR,
    TITLE_TEXT_COLORS, overlay_xy, render_title_box_png,
)

logger = logging.getLogger(__name__)

VALID_TRANSITIONS = ["cut", "fade", "slideleft", "slideright", "wiperight", "circleopen"]
DEFAULT_TRANSITION = "fade"
DEFAULT_TRANSITION_DURATION = 0.5
FPS = 30

_ASS_HEADER = """\
[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{style_lines}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{events}
"""


def _hex_to_ass(hex_color: str) -> str:
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


# ══════════════════════════════════════════════════════════════
#  MULTI-COLOUR SUBTITLES — each line can mix several colours
# ══════════════════════════════════════════════════════════════

def build_marketing_ass(
    subtitles: list[dict],
    width: int,
    height: int,
    font: str = DEFAULT_FONT,
    font_size: int = 78,
    h_align: str = "center",
    v_align: str = "bottom",
    hook_title: str | None = None,
    title_color: str = "#FFFFFF",   # raw hex — caller resolves the swatch key first
    title_permanent: bool = False,
    total_duration: float = 0.0,
) -> str:
    """
    Build the .ass file for the marketing timeline.

    subtitles: [{"start": float, "end": float, "groups": [{"text": str, "color": "#RRGGBB"}, ...]}]
    Each group in a line renders in its own colour, all visible together
    for that line's [start, end] window — e.g. groups=[{"text":"BUY","color":"#FF0000"},
    {"text":"NOW","color":"#FFFFFF"}] shows "BUY NOW" with BUY in red, NOW in white.
    """
    font_name = FONT_OPTIONS.get(font, FONT_OPTIONS[DEFAULT_FONT])
    pos_map = {
        ("center", "bottom"): (width // 2, round(height * 0.88), 2),
        ("center", "center"): (width // 2, height // 2, 5),
        ("center", "top"):    (width // 2, round(height * 0.12), 8),
        ("left",   "bottom"): (round(width * 0.06), round(height * 0.88), 1),
        ("right",  "bottom"): (round(width * 0.94), round(height * 0.88), 3),
    }
    x, y, alignment = pos_map.get((h_align, v_align), pos_map[("center", "bottom")])

    style_lines = [
        f"Style: Default,{font_name},{font_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
        f"1,0,0,0,100,100,0,0,1,5,2,{alignment},40,40,40,1"
    ]

    events = []
    pos = f"{{\\pos({x},{y})}}"
    for line in subtitles:
        start, end = float(line["start"]), float(line["end"])
        groups = line.get("groups") or []
        if not groups:
            continue
        text_parts = []
        for g in groups:
            color = _hex_to_ass(g.get("color", "#FFFFFF"))
            text_parts.append(f"{{\\c{color}&}}{_esc(_safe_upper(g.get('text', '').strip()))}")
        full_text = " ".join(text_parts)
        events.append(_dlg(start, end, f"{pos}{full_text}"))

    if hook_title and hook_title.strip():
        style_lines.append(_hook_style_line(title_color, "crop_fill", font))
        hook_x, hook_y, _ = _hook_position("crop_fill")
        hook_duration = compute_hook_duration(title_permanent, total_duration)
        events = _lines_hook_title(hook_title, hook_x, hook_y, duration=hook_duration) + events

    return _ASS_HEADER.format(
        width=width, height=height,
        style_lines="\n".join(style_lines),
        events="\n".join(events),
    )


# ══════════════════════════════════════════════════════════════
#  END CARD — auto-generated CTA frame, appended as a final "image" segment
# ══════════════════════════════════════════════════════════════

def generate_end_card(
    width: int,
    height: int,
    headline: str = "Try ShortClipr Free",
    sub_text: str = "shortclipr.com",
    bg_hex: str = "#0D0D0D",
    logo_path: str | None = None,
) -> Path:
    """Render a solid-colour CTA end card (headline + sub-text + optional
    logo, centred) as a PNG — used as the timeline's final image segment."""
    from app.pipeline.title_box import _hex_to_rgb

    img = Image.new("RGB", (width, height), _hex_to_rgb(bg_hex))
    draw = ImageDraw.Draw(img)

    headline_font = _load_pil_font("montserrat", round(height * 0.05))
    sub_font = _load_pil_font("default", round(height * 0.025))

    if logo_path and Path(logo_path).exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo_w = round(width * 0.22)
        logo_h = round(logo_w * logo.height / logo.width)
        logo = logo.resize((logo_w, logo_h))
        img.paste(logo, (round((width - logo_w) / 2), round(height * 0.32)), logo)
        headline_y = round(height * 0.32) + logo_h + round(height * 0.05)
    else:
        headline_y = round(height * 0.42)

    hl_bbox = draw.textbbox((0, 0), headline, font=headline_font)
    draw.text(((width - (hl_bbox[2] - hl_bbox[0])) / 2, headline_y), headline, font=headline_font, fill=(255, 255, 255))

    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sub_y = headline_y + (hl_bbox[3] - hl_bbox[1]) + round(height * 0.03)
    draw.text(((width - (sub_bbox[2] - sub_bbox[0])) / 2, sub_y), sub_text, font=sub_font, fill=(207, 19, 34))

    out_path = Path(tempfile.mktemp(suffix=".png", prefix="end_card_"))
    img.save(out_path)
    return out_path


def _load_pil_font(font_key: str, size: int) -> ImageFont.FreeTypeFont:
    from app.pipeline.title_box import FONT_FILES
    path = FONT_FILES.get(font_key, "")
    if path and Path(path).exists():
        return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


# ══════════════════════════════════════════════════════════════
#  SEGMENT NORMALISATION — image/video -> uniform video stream
# ══════════════════════════════════════════════════════════════

def _segment_filter(idx: int, seg: dict, width: int, height: int) -> tuple[str, float]:
    """
    Returns (filter_chain_str, duration) for one input index `idx`, scaled/
    cropped to width x height, 30fps, yuv420p, normalised SAR — required
    before xfade/concat will accept it.
    """
    duration = float(seg.get("duration", 4.0)) if seg["type"] == "image" else float(seg["duration"])
    label = f"seg{idx}"
    chain = (
        f"[{idx}:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1,fps={FPS},format=yuv420p[{label}]"
    )
    return chain, duration


def _build_video_chain(segments: list[dict], width: int, height: int) -> tuple[str, list[str], float]:
    """
    Builds the full xfade chain across all segments. Returns
    (filter_complex_str, ffmpeg_input_args_for_segments, total_duration).
    """
    filters: list[str] = []
    input_args: list[str] = []
    durations: list[float] = []

    for i, seg in enumerate(segments):
        if seg["type"] == "image":
            input_args += ["-loop", "1", "-t", str(seg.get("duration", 4.0)), "-i", str(seg["path"])]
        else:
            input_args += ["-i", str(seg["path"])]
        chain, dur = _segment_filter(i, seg, width, height)
        filters.append(chain)
        durations.append(dur)

    if len(segments) == 1:
        filters.append("[seg0]copy[vout]")
        return ";".join(filters), input_args, durations[0]

    # Pairwise xfade chain: seg0 x seg1 -> x0, x0 x seg2 -> x1, ...
    cumulative = durations[0]
    prev_label = "seg0"
    for i in range(1, len(segments)):
        seg = segments[i]
        trans = seg.get("transition", DEFAULT_TRANSITION)
        trans = trans if trans in VALID_TRANSITIONS else DEFAULT_TRANSITION
        trans_dur = float(seg.get("transition_duration", DEFAULT_TRANSITION_DURATION))
        trans_dur = min(trans_dur, durations[i - 1] * 0.9, durations[i] * 0.9)  # never exceed either clip

        out_label = f"x{i}" if i < len(segments) - 1 else "vout"
        offset = max(0.0, cumulative - trans_dur)

        if trans == "cut":
            filters.append(f"[{prev_label}][seg{i}]concat=n=2:v=1:a=0[{out_label}]")
            cumulative = cumulative + durations[i]
        else:
            xfade_type = {"fade": "fade", "slideleft": "slideleft", "slideright": "slideright",
                           "wiperight": "wiperight", "circleopen": "circleopen"}[trans]
            filters.append(
                f"[{prev_label}][seg{i}]xfade=transition={xfade_type}:duration={trans_dur:.3f}:offset={offset:.3f}[{out_label}]"
            )
            cumulative = offset + trans_dur + (durations[i] - trans_dur)

        prev_label = out_label

    return ";".join(filters), input_args, cumulative


# ══════════════════════════════════════════════════════════════
#  AUDIO CHAIN — sequenced voice tracks + optional ducked music bed
# ══════════════════════════════════════════════════════════════

def _build_audio_chain(
    audio_tracks: list[dict],
    audio_input_offset: int,
    total_video_duration: float,
) -> tuple[str, list[str], int]:
    """
    Returns (filter_complex_str, ffmpeg_input_args, num_audio_inputs).
    Sequenced tracks concat into one voice timeline; at most one
    "background" track loops under it with sidechain ducking.
    """
    seq = [t for t in audio_tracks if t.get("mode", "sequence") == "sequence"]
    bg = next((t for t in audio_tracks if t.get("mode") == "background"), None)

    input_args: list[str] = []
    filters: list[str] = []
    n = 0

    if not seq and not bg:
        return "", [], 0

    seq_labels = []
    for t in seq:
        input_args += ["-i", str(t["path"])]
        seq_labels.append(f"{audio_input_offset + n}:a")
        n += 1

    if seq_labels:
        if len(seq_labels) == 1:
            filters.append(f"[{seq_labels[0]}]anull[voice]")
        else:
            joined = "".join(f"[{lbl}]" for lbl in seq_labels)
            filters.append(f"{joined}concat=n={len(seq_labels)}:v=0:a=1[voice]")
    else:
        filters.append(f"anullsrc=channel_layout=stereo:sample_rate=44100:d={total_video_duration:.3f}[voice]")

    if bg:
        input_args += ["-stream_loop", "-1", "-i", str(bg["path"])]
        bg_idx = audio_input_offset + n
        n += 1
        filters.append(f"[{bg_idx}:a]atrim=0:{total_video_duration:.3f},volume=0.9[bgraw]")
        if seq_labels:
            # Duck the music under the voice, then mix both back together.
            filters.append("[bgraw][voice]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[bgducked]")
            filters.append("[bgducked][voice]amix=inputs=2:duration=longest:dropout_transition=0[aout]")
        else:
            filters.append("[bgraw]anull[aout]")
    else:
        filters.append("[voice]anull[aout]")

    return ";".join(filters), input_args, n


# ══════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT
# ══════════════════════════════════════════════════════════════

async def render_marketing_video(
    segments: list[dict],
    audio_tracks: list[dict],
    subtitles: list[dict],
    output_path: Path,
    aspect: str = "9:16",
    hook_title: str | None = None,
    title_color: str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg: str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
    title_permanent: bool = False,
    font: str = DEFAULT_FONT,
    h_align: str = "center",
    v_align: str = "bottom",
    font_size: int = 78,
    logo_path: str | None = None,
    logo_position: str = "bottom_right",
    end_card: dict | None = None,
) -> Path:
    """
    Assemble the full marketing timeline into one MP4 at `output_path`.
    `segments`/`audio_tracks`/`subtitles` — see module docstring for shape.

    end_card: optional {headline, sub_text, duration, transition,
              transition_duration, bg_hex} — auto-generated CTA frame
              appended as the timeline's final segment.
    """
    if not segments:
        raise ValueError("render_marketing_video: at least one segment is required")

    width, height = ASPECT_DIMENSIONS.get(aspect, ASPECT_DIMENSIONS["9:16"])

    end_card_png: Path | None = None
    if end_card:
        end_card_png = generate_end_card(
            width, height,
            headline=end_card.get("headline", "Try ShortClipr Free"),
            sub_text=end_card.get("sub_text", "shortclipr.com"),
            bg_hex=end_card.get("bg_hex", "#0D0D0D"),
            logo_path=logo_path,
        )
        segments = [*segments, {
            "type": "image",
            "path": str(end_card_png),
            "duration": end_card.get("duration", 3.0),
            "transition": end_card.get("transition", DEFAULT_TRANSITION),
            "transition_duration": end_card.get("transition_duration", DEFAULT_TRANSITION_DURATION),
        }]

    video_fc, video_inputs, total_duration = _build_video_chain(segments, width, height)
    audio_fc, audio_inputs, n_audio = _build_audio_chain(audio_tracks, len(segments), total_duration)

    fc_parts = [video_fc]
    last_video_label = "vout"

    # Logo overlay (persistent watermark)
    box_paths: list[Path] = []
    ass_path: str | None = None
    try:
        if logo_path:
            logo_idx = len(segments) + n_audio
            video_inputs_extra = ["-i", str(logo_path)]
            logo_w = round(width * 0.16)
            margin = round(width * 0.03)
            pos_map = {
                "bottom_right": f"W-w-{margin}:H-h-{margin}",
                "bottom_left":  f"{margin}:H-h-{margin}",
                "top_right":    f"W-w-{margin}:{margin}",
                "top_left":     f"{margin}:{margin}",
            }
            ov_pos = pos_map.get(logo_position, pos_map["bottom_right"])
            fc_parts.append(f"[{logo_idx}:v]scale={logo_w}:-1[logo]")
            fc_parts.append(f"[{last_video_label}][logo]overlay={ov_pos}[withlogo]")
            last_video_label = "withlogo"
        else:
            video_inputs_extra = []

        # Subtitles / hook title via ASS
        ass_content = build_marketing_ass(
            subtitles, width, height, font=font, font_size=font_size,
            h_align=h_align, v_align=v_align, hook_title=hook_title,
            title_color=TITLE_TEXT_COLORS.get(title_color, TITLE_TEXT_COLORS[DEFAULT_TITLE_TEXT_COLOR]),
            title_permanent=title_permanent, total_duration=total_duration,
        )
        with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
            f.write(ass_content)
            ass_path = f.name
        safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")

        if hook_title and hook_title.strip() and title_bg != "none":
            hook_duration = compute_hook_duration(title_permanent, total_duration)
            hook_x, hook_y, alignment = _hook_position("crop_fill")
            box = render_title_box_png(_safe_upper(hook_title.strip()), font, 60, title_bg, title_bg_opacity)
            if box:
                box_path, box_w, box_h = box
                box_paths.append(box_path)
                box_idx = len(segments) + n_audio + (1 if logo_path else 0)
                video_inputs_extra += ["-i", str(box_path)]
                ox, oy = overlay_xy(hook_x, hook_y, alignment, box_w, box_h)
                fc_parts.append(
                    f"[{last_video_label}][{box_idx}:v]overlay={ox}:{oy}:"
                    f"enable='between(t,0,{hook_duration:.3f})'[boxed]"
                )
                last_video_label = "boxed"

        fc_parts.append(f"[{last_video_label}]ass={safe_ass}[vfinal]")
        if audio_fc:
            fc_parts.append(audio_fc)

        filter_complex = ";".join(fc_parts)

        cmd = ["ffmpeg", "-y", *video_inputs, *audio_inputs, *video_inputs_extra,
               "-filter_complex", filter_complex, "-map", "[vfinal]"]
        if audio_fc:
            cmd += ["-map", "[aout]"]
        cmd += [
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            "-t", f"{total_duration:.3f}",
            str(output_path),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
        if proc.returncode != 0:
            raise RuntimeError(f"Marketing render failed: {stderr.decode(errors='ignore')[-1500:]}")
        if not output_path.exists() or output_path.stat().st_size < 1024:
            raise RuntimeError("Marketing render produced no/empty output")

        logger.info(f"Marketing video rendered → {output_path} ({total_duration:.1f}s, {aspect})")
        return output_path
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)
        for bp in box_paths:
            bp.unlink(missing_ok=True)
        if end_card_png:
            end_card_png.unlink(missing_ok=True)
