"""
extractor.py — Steps 5 & 6 of the ShortClipr pipeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Clip extraction
  FFmpeg HTTP range requests on CDN URL.
  Never downloads the full video — only exact bytes per clip.
  All clips extracted in parallel via asyncio.gather().

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — Vertical reframe  (16:9 → 9:16 / 1080×1920)

11 TEMPLATE TYPES:
  smart_crop   TikTok / Reels default
               Face-tracked MediaPipe crop, Ken Burns zoom.

  blur_bg      Blur background  ★ most popular
               Main video centered, blurred copy fills top+bottom.

  zoom_blur    Zoom + blur
               Main video 120 % zoomed, extreme blur background.

  glass        Glassmorphism
               Blurred + brightness-reduced bg, main video crisp center.

  color_bars   Solid color bars
               Custom-color bars top & bottom (brand / aesthetic).

  gradient     Gradient bars
               Top bar dark → bright, bottom bar bright → dark.

  cinema       Cinematic black bars
               Classic letterbox feel in portrait format.

  neon_frame   Neon frame
               Thin colored border all around the video.

  split_screen Dual split
               Video in top half, vertically flipped copy in bottom.

  screenshare  Screenshare / Tutorial
               Full-width video fills top 50 %, portrait crop in bottom 50 %.

  gameplay     Gameplay / Podcast
               Portrait crop fills top 30 %, full-width video in bottom 70 %.

All non-smart_crop templates are pure FFmpeg-filter-complex —
no MediaPipe or frame sampling needed → faster processing.

COLOUR PARAMETER  (bar_color):
  Hex string  "#RRGGBB"  e.g.  "#0d0d0d"  "#39ff14"  "#1a1a2e"
  Used for bars, frame colour, gradient base.
"""

import asyncio
import json
import logging
import math
from pathlib import Path
import numpy as np

from app.core.config import get_settings
from app.core.proxy import get_proxy_url, url_is_ip_bound
from app.pipeline.ai_clipper import ClipTimestamp

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Public constants ───────────────────────────────────────────

VALID_TEMPLATES = [
    "smart_crop",    # TikTok / Reels — face-tracked crop
    "blur_bg",       # Blur background
    "zoom_blur",     # Heavy zoom + blur
    "glass",         # Glassmorphism
    "color_bars",    # Solid coloured bars
    "gradient",      # Gradient bars
    "cinema",        # Cinematic black bars
    "neon_frame",    # Coloured neon border
    "split_screen",  # Dual split (top + bottom)
    "screenshare",   # Full top / portrait bottom
    "gameplay",      # Portrait top 30 % / full bottom 70 %
]

# ── Semaphore ─────────────────────────────────────────────────

_EXTRACTION_SEMAPHORE: asyncio.Semaphore | None = None

def _get_semaphore() -> asyncio.Semaphore:
    global _EXTRACTION_SEMAPHORE
    if _EXTRACTION_SEMAPHORE is None:
        _EXTRACTION_SEMAPHORE = asyncio.Semaphore(settings.MAX_CONCURRENT_CLIPS)
    return _EXTRACTION_SEMAPHORE


# ══════════════════════════════════════════════════════════════
#  STEP 5 — Clip extraction
# ══════════════════════════════════════════════════════════════


async def extract_clip(
    stream_url: str,
    start: float,
    end: float,
    output_path: Path,
    proxy_url: str | None = None,
) -> Path:
    """
    Extract [start, end] seconds from a remote CDN URL using FFmpeg.

    -ss before -i   = fast keyframe seek (minimal data pre-read)
    -c copy         = zero re-encode (stream copy only)
    proxy_url       = if set, routes FFmpeg's HTTP traffic through that proxy.
                      Only passed when the stream URL is IP-bound to the proxy IP.
                      For non-IP-bound URLs this is None → direct Cloud Run download.
    """
    duration = end - start
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = ["ffmpeg", "-y"]

    # ── Proxy injection (only for IP-bound CDN URLs) ───────────
    # FFmpeg -http_proxy applies to all subsequent -i inputs.
    # We only add it when the stream URL's signature covers the proxy IP,
    # i.e. a direct download from Cloud Run would return HTTP 403.
    if proxy_url:
        cmd += ["-http_proxy", proxy_url]

    cmd += [
        "-ss", str(start),
        "-t",  str(duration),
        "-i",  stream_url,
        "-c",  "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        str(output_path),
    ]

    async with _get_semaphore():
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(
            f"FFmpeg extraction failed [{start:.0f}-{end:.0f}s]: "
            f"{stderr.decode(errors='ignore')[-400:]}"
        )
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"Clip output missing or too small: {output_path}")

    via = f"proxy={proxy_url.split('@')[-1]}" if proxy_url else "direct (Cloud Run)"
    logger.info(
        f"Extracted {start:.0f}-{end:.0f}s → {output_path.name} "
        f"({output_path.stat().st_size // 1024} KB) [{via}]"
    )
    return output_path


async def extract_all_clips_parallel(
    stream_url: str,
    timestamps: list[ClipTimestamp],
    job_dir: Path,
    session_id: str | None = None,
) -> list[tuple[ClipTimestamp, Path]]:
    """
    Extract all clips in parallel.

    Checks once whether the stream URL is IP-bound. If it is, every
    FFmpeg worker uses the proxy for download. If not, all workers
    download directly from Cloud Run — saving 100% of proxy bandwidth
    on the most expensive part of the pipeline.
    """
    # ── One-time IP-binding check ──────────────────────────────
    ip_bound = url_is_ip_bound(stream_url)
    proxy_url = get_proxy_url(session_id) if ip_bound else None

    if ip_bound:
        logger.info(
            "Stream URL is IP-bound to proxy — FFmpeg will route downloads via proxy. "
            "Consider switching to a non-IP-bound client to save proxy bandwidth."
        )
    else:
        logger.info(
            "Stream URL is NOT IP-bound — FFmpeg downloads directly from Cloud Run. ✅"
        )

    async def _one(i: int, ts: ClipTimestamp):
        out = job_dir / f"clip_{i:02d}_{int(ts.start)}s_raw.mp4"
        path = await extract_clip(stream_url, ts.start, ts.end, out, proxy_url=proxy_url)
        return ts, path

    results = await asyncio.gather(
        *[_one(i, ts) for i, ts in enumerate(timestamps)],
        return_exceptions=True,
    )
    ok, failed = [], 0
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.error(f"Clip {i} extraction failed: {r}")
            failed += 1
        else:
            ok.append(r)
    logger.info(f"Extracted {len(ok)}/{len(timestamps)} clips ({failed} failed)")
    return ok


# ══════════════════════════════════════════════════════════════
#  STEP 6 — Vertical reframe
# ══════════════════════════════════════════════════════════════

# ── Helpers ───────────────────────────────────────────────────

async def _probe_resolution(path: Path) -> tuple[int, int]:
    """Return (width, height) via ffprobe. Falls back to 1920×1080."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams", str(path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    try:
        data = json.loads(stdout)
        for s in data.get("streams", []):
            w, h = s.get("width"), s.get("height")
            if w and h:
                return int(w), int(h)
    except Exception as e:
        logger.warning(f"ffprobe parse failed: {e}")
    logger.warning("ffprobe fallback → assuming 1920×1080")
    return 1920, 1080


def _hex_to_ffmpeg(color: str) -> str:
    """'#RRGGBB' → '0xRRGGBB' for FFmpeg color parameters."""
    return "0x" + color.lstrip("#").upper()


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _darken(color: str, factor: float = 0.3) -> str:
    r, g, b = _hex_to_rgb(color)
    return f"0x{int(r*factor):02X}{int(g*factor):02X}{int(b*factor):02X}"


def _ken_burns_filter(input_label: str, out_label: str) -> str:
    """FFmpeg zoompan for subtle 1.0× → 1.08× push-in."""
    return (
        f"[{input_label}]zoompan="
        f"z='min(zoom+0.0010,1.08)':"
        f"x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':"
        f"d=1:s=1080x1920:fps=30"
        f"[{out_label}]"
    )


async def _run_ffmpeg_complex(
    input_path: Path,
    output_path: Path,
    filter_complex: str,
) -> None:
    """Run FFmpeg with -filter_complex and map [out] + audio."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-map", "0:a?",          # optional audio
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"FFmpeg reframe failed [{input_path.name}]: "
            f"{stderr.decode(errors='ignore')[-400:]}"
        )


# ══════════════════════════════════════════════════════════════
#  TEMPLATE IMPLEMENTATIONS
# ══════════════════════════════════════════════════════════════

# ── Template 1: smart_crop ─────────────────────────────────────
# Face-tracked MediaPipe crop (most complex; detailed helpers below)

def _crop_dims(frame_w: int, frame_h: int) -> tuple[int, int]:
    """Resolution-aware 9:16 crop dimensions. Returns (crop_w, crop_h)."""
    crop_w = int(frame_h * 9 / 16)
    crop_w += crop_w % 2   # even for libx264
    return crop_w, frame_h


def _sample_frames_sync(clip_path: str, sample_every: int = 15) -> list:
    try:
        import cv2
    except ImportError:
        return []
    frames = []
    cap = cv2.VideoCapture(clip_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    idx = 0
    while idx < total:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
        idx += sample_every
    cap.release()
    return frames


def _detect_faces_sync(frames: list, frame_w: int) -> list[float]:
    try:
        import mediapipe as mp
        import cv2
    except ImportError:
        return [-1.0] * len(frames)

    positions: list[float] = []
    detector = mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.45
    )
    with detector:
        for frame in frames:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)
            if not result.detections:
                positions.append(-1.0)
                continue
            best = max(
                result.detections,
                key=lambda d: (
                    d.location_data.relative_bounding_box.width *
                    d.location_data.relative_bounding_box.height
                ),
            )
            bb = best.location_data.relative_bounding_box
            positions.append((bb.xmin + bb.width / 2.0) * frame_w)
    return positions


def _smooth_positions(
    raw: list[float],
    frame_w: int,
    crop_w: int,
    sigma: float = 2.5,
) -> list[float]:
    arr  = np.array(raw, dtype=float)
    half = crop_w / 2.0
    max_x = frame_w - crop_w

    for i, v in enumerate(arr):
        if v >= 0:
            arr[i] = float(np.clip(v - half, 0, max_x))

    if not (arr >= 0).any():
        return [float((frame_w - crop_w) // 2)] * len(raw)

    last = None
    for i in range(len(arr)):
        if arr[i] >= 0: last = arr[i]
        elif last is not None: arr[i] = last
    last = None
    for i in range(len(arr) - 1, -1, -1):
        if arr[i] >= 0: last = arr[i]
        elif last is not None: arr[i] = last

    ks = 2 * math.ceil(2 * sigma) + 1
    kernel = np.exp(-0.5 * ((np.arange(ks) - ks // 2) / sigma) ** 2)
    kernel /= kernel.sum()
    smoothed = np.clip(np.convolve(arr, kernel, mode="same"), 0, max_x)
    return smoothed.tolist()


def _build_crop_expr(
    positions: list[float],
    sample_every: int,
    fps: float,
    crop_w: int,
    crop_h: int,
) -> str:
    if len(positions) <= 1:
        x = int(positions[0]) if positions else 0
        return f"crop={crop_w}:{crop_h}:{x}:0"
    dt   = sample_every / fps
    expr = str(int(positions[-1]))
    for i in range(len(positions) - 2, -1, -1):
        t0, t1, x = i * dt, (i + 1) * dt, int(positions[i])
        expr = f"if(between(t,{t0:.3f},{t1:.3f}),{x},{expr})"
    return f"crop={crop_w}:{crop_h}:{expr}:0"


async def _template_smart_crop(
    input_path: Path,
    output_path: Path,
    frame_w: int,
    frame_h: int,
    ken_burns: bool,
) -> Path:
    """Face-tracked crop with MediaPipe + optional Ken Burns."""
    loop      = asyncio.get_running_loop()
    crop_w, crop_h = _crop_dims(frame_w, frame_h)

    frames = await loop.run_in_executor(
        None, _sample_frames_sync, str(input_path), 15
    )

    if frames:
        raw = await loop.run_in_executor(None, _detect_faces_sync, frames, frame_w)
        smooth = _smooth_positions(raw, frame_w, crop_w)
    else:
        smooth = [float((frame_w - crop_w) // 2)]

    crop_filter  = _build_crop_expr(smooth, 15, 30.0, crop_w, crop_h)
    scale_filter = "scale=1080:1920:flags=lanczos"

    if ken_burns:
        zoom_f = (
            "zoompan=z='min(zoom+0.0010,1.08)':"
            "x='iw/2-(iw/zoom/2)':"
            "y='ih/2-(ih/zoom/2)':"
            "d=1:s=1080x1920:fps=30"
        )
        vf = f"{crop_filter},{scale_filter},{zoom_f}"
    else:
        vf = f"{crop_filter},{scale_filter}"

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning(f"smart_crop failed, falling back to centre crop: "
                       f"{stderr.decode(errors='ignore')[-200:]}")
        return await _template_colour_bars(
            input_path, output_path, "#000000", ken_burns
        )
    return output_path


# ── Template 2: blur_bg ────────────────────────────────────────

async def _template_blur_bg(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    blur_radius: int = 25,
) -> Path:
    """
    Main video centred, blurred copy fills top+bottom.
    blur_radius: 25 = standard, 40 = zoom_blur heavy effect.
    """
    fc = (
        f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        f"crop=1080:1920,"
        f"boxblur=luma_radius={blur_radius}:luma_power=1:"
        f"chroma_radius={blur_radius}:chroma_power=1[bg];"
        f"[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 3: zoom_blur ─────────────────────────────────────

async def _template_zoom_blur(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """120 % zoomed foreground + heavy blur background — dramatic feel."""
    fc = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "boxblur=luma_radius=40:luma_power=2:"
        "chroma_radius=40:chroma_power=2[bg];"
        "[0:v]scale=1296:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 4: glass ─────────────────────────────────────────

async def _template_glass(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """
    Glassmorphism — blurred + slightly brightened, desaturated bg;
    crisp main video centred giving a frosted-glass depth effect.
    """
    fc = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "boxblur=luma_radius=28:luma_power=2:"
        "chroma_radius=28:chroma_power=2,"
        "eq=brightness=0.18:saturation=0.35:contrast=0.85[bg];"
        "[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 5: colour_bars ───────────────────────────────────

async def _template_colour_bars(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
) -> Path:
    """
    Solid-colour bars fill top + bottom letterbox gaps.
    bar_color: e.g. "#0d0d0d", "#1a1a2e", "#ffffff"
    Layout: [bar 656px][video 608px][bar 656px] = 1920px
    """
    c   = _hex_to_ffmpeg(bar_color)
    fc  = (
        f"color=c={c}:s=1080x656[topbar];"
        f"color=c={c}:s=1080x656[botbar];"
        "[0:v]scale=1080:608:force_original_aspect_ratio=decrease,"
        "pad=1080:608:(ow-iw)/2:0:color=black[vid];"
        "[topbar][vid][botbar]vstack=inputs=3[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 6: gradient ──────────────────────────────────────

async def _template_gradient(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
) -> Path:
    """
    Gradient bars — top bar is dark, bottom bar is the accent colour.
    Creates a visual depth / branded look.
    """
    bright = _hex_to_ffmpeg(bar_color)
    dark   = _darken(bar_color, 0.25)

    fc = (
        f"color=c={dark}:s=1080x656[topbar];"
        f"color=c={bright}:s=1080x656[botbar];"
        "[0:v]scale=1080:608:force_original_aspect_ratio=decrease,"
        "pad=1080:608:(ow-iw)/2:0:color=black[vid];"
        "[topbar][vid][botbar]vstack=inputs=3[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 7: cinema ────────────────────────────────────────

async def _template_cinema(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """Classic cinematic black bars — letterbox portrait."""
    return await _template_colour_bars(
        input_path, output_path, "#000000", ken_burns
    )


# ── Template 8: neon_frame ────────────────────────────────────

async def _template_neon_frame(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
) -> Path:
    """
    Solid coloured border around the video — neon / branded frame.
    20 px border on all sides → video area = 1040 × 1880.
    """
    c  = _hex_to_ffmpeg(bar_color)
    fc = (
        f"color=c={c}:s=1080x1920[frame];"
        "[0:v]scale=1040:1880:force_original_aspect_ratio=decrease,"
        "pad=1040:1880:(ow-iw)/2:(oh-ih)/2:black[vid];"
        "[frame][vid]overlay=20:20[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 9: split_screen ──────────────────────────────────

async def _template_split_screen(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """
    Top half  = video (letterboxed to 1080 × 960)
    Bottom half = same video vertically flipped — eye-catching dual layout.
    """
    fc = (
        "[0:v]scale=1080:960:force_original_aspect_ratio=decrease,"
        "pad=1080:960:(ow-iw)/2:(oh-ih)/2:black[top];"
        "[0:v]scale=1080:960:force_original_aspect_ratio=decrease,"
        "pad=1080:960:(ow-iw)/2:(oh-ih)/2:black,vflip[bot];"
        "[top][bot]vstack[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 10: screenshare ──────────────────────────────────

async def _template_screenshare(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """
    Tutorial / screenshare layout:
      Top 50 %  (960 px) — full-width letterboxed video (shows entire frame)
      Bottom 50% (960 px) — portrait crop (shows centre / speaker)
    """
    fc = (
        "[0:v]scale=1080:540:force_original_aspect_ratio=decrease,"
        "pad=1080:960:(ow-iw)/2:(oh-ih)/2:black[top];"
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:960:0:(in_h-960)/2[bot];"
        "[top][bot]vstack[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 11: gameplay ─────────────────────────────────────

async def _template_gameplay(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
) -> Path:
    """
    Gaming / podcast layout:
      Top 30 %  (576 px) — portrait crop  (webcam / speaker)
      Bottom 70% (1344 px) — full-width   (gameplay / slides)
    576 + 1344 = 1920 ✓
    """
    fc = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:576:0:(in_h-576)/2[top];"
        "[0:v]scale=1080:1344:force_original_aspect_ratio=decrease,"
        "pad=1080:1344:(ow-iw)/2:(oh-ih)/2:black[bot];"
        "[top][bot]vstack[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out")
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ══════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT — reframe_to_vertical
# ══════════════════════════════════════════════════════════════

async def reframe_to_vertical(
    input_path: Path,
    output_path: Path,
    template:   str  = "smart_crop",
    bar_color:  str  = "#0d0d0d",
    ken_burns:  bool = True,
) -> Path:
    """
    Convert 16:9 clip → 9:16 vertical (1080 × 1920) using the chosen template.

    Args:
        input_path:  raw extracted clip (any res, 16:9)
        output_path: where to write the vertical mp4
        template:    one of VALID_TEMPLATES
        bar_color:   hex colour for bars / frame / gradient  (#RRGGBB)
        ken_burns:   add subtle 1.0× → 1.08× zoom push-in

    Returns output_path on success.
    """
    # Normalise / validate template
    tpl = template if template in VALID_TEMPLATES else "smart_crop"

    # Probe resolution (always needed)
    frame_w, frame_h = await _probe_resolution(input_path)

    logger.info(
        f"{input_path.name} → template={tpl}  "
        f"src={frame_w}×{frame_h}  bar={bar_color}  ken_burns={ken_burns}"
    )

    try:
        if tpl == "smart_crop":
            return await _template_smart_crop(
                input_path, output_path, frame_w, frame_h, ken_burns
            )
        elif tpl == "blur_bg":
            return await _template_blur_bg(input_path, output_path, ken_burns)
        elif tpl == "zoom_blur":
            return await _template_zoom_blur(input_path, output_path, ken_burns)
        elif tpl == "glass":
            return await _template_glass(input_path, output_path, ken_burns)
        elif tpl == "color_bars":
            return await _template_colour_bars(input_path, output_path, bar_color, ken_burns)
        elif tpl == "gradient":
            return await _template_gradient(input_path, output_path, bar_color, ken_burns)
        elif tpl == "cinema":
            return await _template_cinema(input_path, output_path, ken_burns)
        elif tpl == "neon_frame":
            return await _template_neon_frame(input_path, output_path, bar_color, ken_burns)
        elif tpl == "split_screen":
            return await _template_split_screen(input_path, output_path, ken_burns)
        elif tpl == "screenshare":
            return await _template_screenshare(input_path, output_path, ken_burns)
        elif tpl == "gameplay":
            return await _template_gameplay(input_path, output_path, ken_burns)

    except Exception as exc:
        logger.error(
            f"{input_path.name}: template '{tpl}' failed ({exc}); "
            "falling back to blur_bg"
        )
        try:
            return await _template_blur_bg(input_path, output_path, ken_burns=False)
        except Exception as exc2:
            raise RuntimeError(
                f"All reframe attempts failed for {input_path.name}: {exc2}"
            ) from exc2

    raise RuntimeError(f"Unknown template: {tpl}")
