"""
title_box.py — Hook-title background box rendering.

ASS/libass BorderStyle 3 ("opaque box") only draws hard rectangles — there is
no native support for rounded corners. To get a real rounded-rect background
behind the hook title, we render it as a standalone transparent PNG (sized to
fit the actual title text, using the same font/size the .ass file uses) and
composite it via an ffmpeg `overlay` filter BEHIND the ASS text layer, visible
only for the title's on-screen time window.

When the user picks "None" for the title background (the default), none of
this runs — the title is just text + outline directly over the video, which
is the cleanest look and what most trending caption styles actually do.
"""

import logging
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Mirrors captions.FONT_OPTIONS keys -> actual bundled .ttf file (PIL needs a
# real file path; fontconfig family-name lookup is libass-only).
FONT_FILES: dict[str, str] = {
    "default":       "",   # falls back to PIL's built-in default font below
    "montserrat":    str(_ASSETS_DIR / "Montserrat-ExtraBold.ttf"),
    "archivo_black": str(_ASSETS_DIR / "ArchivoBlack-Regular.ttf"),
    "anton":         str(_ASSETS_DIR / "Anton-Regular.ttf"),
    "bebas_neue":    str(_ASSETS_DIR / "BebasNeue-Regular.ttf"),
    "poppins":       str(_ASSETS_DIR / "Poppins-ExtraBold.ttf"),
    "jakarta":       str(_ASSETS_DIR / "PlusJakartaSans-ExtraBold.ttf"),
}

# ── Title text colour swatches — independent of caption colours ────────
TITLE_TEXT_COLORS: dict[str, str] = {
    "white":    "#FFFFFF",
    "black":    "#000000",
    "yellow":   "#FFE600",
    "gold":     "#FFD700",
    "red":      "#FF3B30",
    "ice_blue": "#C8E5FF",
    "hot_pink": "#FF1493",
}
DEFAULT_TITLE_TEXT_COLOR = "white"

# ── Title background swatches — "none" = no box at all (default) ───────
TITLE_BG_COLORS: dict[str, str | None] = {
    "none":       None,
    "dark_gray":  "#1A1A1A",
    "light_gray": "#E5E5E5",
    "black":      "#000000",
    "white":      "#FFFFFF",
    "brand_red":  "#CF1322",
}
DEFAULT_TITLE_BG = "none"
DEFAULT_TITLE_BG_OPACITY = 0.55   # 0.0 (invisible) – 1.0 (fully opaque)

_CORNER_RADIUS = 26     # px, at the real 1080x1920 output resolution
_PAD_X = 30
_PAD_Y = 18


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _load_font(font_key: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_FILES.get(font_key, "")
    if path and Path(path).exists():
        return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def render_title_box_png(
    text: str,
    font_key: str,
    font_size: int,
    bg_key: str,
    bg_opacity: float,
) -> tuple[Path, int, int] | None:
    """
    Render a transparent PNG containing only a rounded-rect background box,
    sized to fit `text` at `font_size` (matching the .ass style's font/size
    so the box lines up with the burned-in text on top of it).

    Returns (png_path, width, height), or None if `bg_key` is "none"/invalid
    — callers should skip the overlay step entirely in that case.
    """
    bg_hex = TITLE_BG_COLORS.get(bg_key)
    if not bg_hex:
        return None

    font = _load_font(font_key, font_size)
    # Measure on a throwaway 1x1 canvas — textbbox doesn't need real pixels.
    probe = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(probe)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    text_w, text_h = right - left, bottom - top

    box_w = text_w + _PAD_X * 2
    box_h = text_h + _PAD_Y * 2

    alpha = max(0, min(255, round(bg_opacity * 255)))
    r, g, b = _hex_to_rgb(bg_hex)

    img = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(0, 0), (box_w - 1, box_h - 1)],
        radius=_CORNER_RADIUS,
        fill=(r, g, b, alpha),
    )

    out_path = Path(tempfile.mktemp(suffix=".png", prefix="title_box_"))
    img.save(out_path)
    return out_path, box_w, box_h


def overlay_xy(hook_x: int, hook_y: int, alignment: int, box_w: int, box_h: int) -> tuple[int, int]:
    """
    ffmpeg's `overlay` filter positions by top-left corner; ASS alignment
    anchors text at (hook_x, hook_y) relative to a DIFFERENT anchor point
    per alignment code (see captions._hook_position): 5 = middle-center,
    8 = top-center. Convert so the PNG box lines up under the ASS text.
    """
    x = hook_x - box_w // 2
    y = hook_y - box_h // 2 if alignment == 5 else hook_y
    return x, y
