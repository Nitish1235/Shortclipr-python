"""
extractor.py — Steps 5 & 6 of the ShortClipr pipeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Clip extraction
  -c copy extraction from a local source file (see _get_source /
  download_source / download_source_ytdlp). Each clip is then run
  through reframe_and_caption() independently — the orchestrator
  pipelines all clip stages per-clip rather than batching by stage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — Reframe + caption burn (16:9 source → 9:16 / 16:9 / 1:1, default 9:16)

OUTPUT ASPECT RATIOS  (ASPECT_DIMENSIONS):
  9:16  1080×1920  Portrait — TikTok / Reels / Shorts (default)
  16:9  1920×1080  Landscape — YouTube / X
  1:1   1080×1080  Square — Instagram / LinkedIn / Facebook

10 TEMPLATE TYPES:
  blur_bg      Blur background  ★ most popular / default
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

All templates are pure FFmpeg-filter-complex — no frame sampling
or extra models needed. reframe_and_caption() runs ONE ffmpeg
subprocess per clip, producing both the raw reframed output and
(if captions are present) a captioned copy via filter-graph split.

COLOUR PARAMETER  (bar_color):
  Hex string  "#RRGGBB"  e.g.  "#0d0d0d"  "#39ff14"  "#1a1a2e"
  Used for bars, frame colour, gradient base.
"""

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.core.proxy import get_proxy_url
from app.pipeline.captions import Caption, build_ass_content
from app.pipeline.downloader import download_source_parallel

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Public constants ───────────────────────────────────────────

VALID_TEMPLATES = [
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

# Output canvas size per aspect ratio (width, height)
ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "9:16": (1080, 1920),   # Portrait — TikTok / Reels / Shorts (default)
    "16:9": (1920, 1080),   # Landscape — YouTube / X
    "1:1":  (1080, 1080),   # Square — Instagram / LinkedIn / Facebook
}

VALID_ASPECTS = list(ASPECT_DIMENSIONS.keys())

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


async def download_source(
    video_url: str,
    output_path: Path,
    proxy_url: str | None = None,
    audio_url: str | None = None,
    user_agent: str | None = None,
) -> Path:
    """
    Sequentially download the full video (+ optional separate audio track,
    merged) from a remote CDN URL to a local file with -c copy.

    No -ss/-t — straight sequential read from byte 0, which is fast
    (~20x realtime observed) since it doesn't require any HTTP seeking.
    Per-clip extraction then runs on this LOCAL file (see extract_clip),
    where -ss before -i (input seeking) is instant and reliable —
    unlike on YouTube's remote fragmented/DASH MP4 CDN URLs, where
    input seeking reliably hangs regardless of seek position (confirmed
    via debug scripts at multiple positions).

    proxy_url = if set, routes FFmpeg's HTTP traffic through that proxy.
    audio_url = optional separate audio-only CDN URL, merged in when the
                video stream has no embedded audio (see get_stream_urls).
    user_agent = UA the CDN URL was issued to (see get_stream_urls) — must
                  be sent on download or the CDN returns an empty response.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # -http_proxy / -user_agent are per-input HTTP-protocol options — each
    # must be repeated immediately before its own -i, otherwise the second
    # input (audio_url) is fetched unauthenticated and the CDN returns an
    # empty response ("End of file").
    cmd = ["ffmpeg", "-y"]

    def _input_opts() -> list[str]:
        opts = []
        if proxy_url:
            opts += ["-http_proxy", proxy_url]
        if user_agent:
            opts += ["-user_agent", user_agent]
        return opts

    cmd += _input_opts()
    cmd += ["-i", video_url]
    if audio_url:
        cmd += _input_opts()
        cmd += ["-i", audio_url]
        cmd += ["-map", "0:v:0", "-map", "1:a:0"]

    cmd += [
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("FFmpeg source download timed out")

    if proc.returncode != 0:
        err = stderr.decode(errors="ignore")
        # The last 400 chars are usually just the URL tail — log a longer
        # window so the actual HTTP error (403/404/EOF) is visible.
        logger.warning(f"FFmpeg source download stderr (tail): {err[-1500:]}")
        raise RuntimeError(
            f"FFmpeg source download failed: {err[-400:]}"
        )
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"Source download missing or too small: {output_path}")

    via = f"proxy={proxy_url.split('@')[-1]}" if proxy_url else "direct (Cloud Run)"
    logger.info(
        f"Downloaded source → {output_path.name} "
        f"({output_path.stat().st_size / 1e6:.1f} MB) [{via}]"
    )
    return output_path


def _ytdlp_download_sync(video_id: str, output_path: Path, proxy_url: str | None) -> None:
    """Blocking yt-dlp download — runs inside a thread pool executor."""
    import yt_dlp

    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "outtmpl": str(output_path),
        "format": (
            "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]"
            "/best[height<=1080][ext=mp4]/best"
        ),
        "merge_output_format": "mp4",
        "extractor_args": {"youtube": {"player_client": ["android"]}},
        "concurrent_fragment_downloads": 4,
    }
    if proxy_url:
        opts["proxy"] = proxy_url

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={video_id}"])


async def download_source_ytdlp(
    video_id: str,
    output_path: Path,
    proxy_url: str | None = None,
) -> Path:
    """
    Last-resort source download: let yt-dlp resolve AND download in one
    session through the same proxy connection.

    The ffmpeg path (download_source) mints the CDN URL with one connection
    (InnerTube via proxy) and downloads with another (ffmpeg) — when the
    rotating-residential gateway hands the second connection a different
    exit IP, the IP-bound URL 403s / returns an empty body. yt-dlp avoids
    the split entirely by minting and downloading itself, and natively
    handles UA matching and fragmented/DASH formats.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    loop = asyncio.get_running_loop()
    await asyncio.wait_for(
        loop.run_in_executor(None, _ytdlp_download_sync, video_id, output_path, proxy_url),
        timeout=900,
    )
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"yt-dlp source download missing or too small: {output_path}")
    logger.info(
        f"Downloaded source via yt-dlp → {output_path.name} "
        f"({output_path.stat().st_size / 1e6:.1f} MB) [proxy={bool(proxy_url)}]"
    )
    return output_path


async def extract_clip(
    source_path: Path,
    start: float,
    end: float,
    output_path: Path,
) -> Path:
    """
    Extract [start, end] seconds from a LOCAL source file using FFmpeg.

    -ss BEFORE -i = input seeking. On a local file this is instant and
                     reliable (unlike on remote CDN URLs, where it hangs).
    -c copy       = zero re-encode (stream copy only)
    """
    duration = end - start
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start), "-i", str(source_path),
        "-t", str(duration),
        "-c", "copy",
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
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"FFmpeg extraction timed out [{start:.0f}-{end:.0f}s]")

    if proc.returncode != 0:
        raise RuntimeError(
            f"FFmpeg extraction failed [{start:.0f}-{end:.0f}s]: "
            f"{stderr.decode(errors='ignore')[-400:]}"
        )
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"Clip output missing or too small: {output_path}")

    logger.info(
        f"Extracted {start:.0f}-{end:.0f}s → {output_path.name} "
        f"({output_path.stat().st_size // 1024} KB)"
    )
    return output_path


async def _get_source(
    stream_url: str,
    audio_url: str | None,
    user_agent: str | None,
    video_id: str | None,
    job_dir: Path,
    session_id: str | None = None,
) -> Path:
    """
    Resolve a local copy of the full source video — always routed through
    the proxy (same IP that resolved the stream URL, for IP-bound CDN URLs).

    Tries a parallel ranged HTTP download first (fast). If the CDN URL
    doesn't support Range requests or otherwise fails, falls back to the
    existing sequential chain: proxied ffmpeg download -> yt-dlp.
    """
    source_path = job_dir / "source.mp4"
    proxy_url = get_proxy_url(session_id)

    try:
        return await download_source_parallel(
            stream_url, source_path, audio_url=audio_url, user_agent=user_agent,
            num_chunks=settings.SOURCE_DOWNLOAD_CHUNKS, proxy_url=proxy_url,
        )
    except Exception as exc:
        logger.warning(f"Parallel ranged download failed ({exc}); falling back to sequential")

    try:
        await download_source(stream_url, source_path, proxy_url=proxy_url, audio_url=audio_url, user_agent=user_agent)
    except Exception as exc:
        if not video_id:
            raise
        logger.warning(f"Proxied source download failed ({exc}); falling back to yt-dlp download")
        await download_source_ytdlp(video_id, source_path, proxy_url=proxy_url)
    return source_path


# ══════════════════════════════════════════════════════════════
#  STEP 6 — Vertical reframe
# ══════════════════════════════════════════════════════════════

# ── Helpers ───────────────────────────────────────────────────

def _hex_to_ffmpeg(color: str) -> str:
    """'#RRGGBB' → '0xRRGGBB' for FFmpeg color parameters."""
    return "0x" + color.lstrip("#").upper()


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _darken(color: str, factor: float = 0.3) -> str:
    r, g, b = _hex_to_rgb(color)
    return f"0x{int(r*factor):02X}{int(g*factor):02X}{int(b*factor):02X}"


# Beat-synced punch-zoom tuning constants
_ZOOM_FPS       = 30
_ZOOM_ATTACK    = 0.12   # seconds to punch in
_ZOOM_DECAY     = 0.35   # seconds to ease back to baseline
_ZOOM_PEAK      = 1.08   # zoom level at the peak of a punch
_ZOOM_BASE_MAX  = 1.05   # ambient drift ceiling when no punch is active
_ZOOM_BASE_RATE = 0.0006


def _zoom_expr(beats: list[float]) -> str:
    """
    Build a zoompan `z=` expression that is a pure function of the output
    frame number (`on`) — no cumulative drift across frames.

    Baseline is a slow ambient drift up to _ZOOM_BASE_MAX. At each beat time
    `b` (seconds, typically a caption's start time), the zoom punches in to
    _ZOOM_PEAK over _ZOOM_ATTACK seconds then eases back to baseline over
    _ZOOM_DECAY seconds — the "camera reacts to each new line" effect.
    """
    t = f"(on/{_ZOOM_FPS})"
    expr = f"min({_ZOOM_BASE_MAX},1+{_ZOOM_BASE_RATE}*{t})"
    window = _ZOOM_ATTACK + _ZOOM_DECAY
    peak_delta = _ZOOM_PEAK - 1
    for b in sorted(beats, reverse=True):
        rise = f"(1+{peak_delta:.3f}*({t}-{b:.3f})/{_ZOOM_ATTACK})"
        fall = f"(1+{peak_delta:.3f}*(1-(({t}-{b:.3f}-{_ZOOM_ATTACK})/{_ZOOM_DECAY})))"
        pulse = f"if(lt({t}-{b:.3f},{_ZOOM_ATTACK}),{rise},{fall})"
        expr = f"if(between({t},{b:.3f},{b + window:.3f}),{pulse},{expr})"
    return expr


def _dynamic_zoom_filter(
    input_label: str,
    out_label: str,
    width: int,
    height: int,
    zoom_beats: list[float] | None,
    pan_x: str = "0.5",
    pan_y: str = "0.5",
) -> str:
    """
    FFmpeg zoompan that drifts gently and punches in on each `zoom_beats`
    timestamp — the camera-reacts-to-each-line look used by trending
    TikTok/Reels edits. Falls back to a slow ambient drift if `zoom_beats`
    is empty/None.

    `pan_x`/`pan_y` are ffmpeg expressions (in terms of `on`/`t`) for the
    canvas-normalized (0-1) pan target — i.e. where the crop window centres.
    Defaults to "0.5" (frame centre), reproducing the previous fixed
    `iw/2-(iw/zoom/2)` / `ih/2-(ih/zoom/2)` formulas exactly.
    """
    return (
        f"[{input_label}]zoompan="
        f"z='{_zoom_expr(zoom_beats or [])}':"
        f"x='clip(({pan_x})*iw-iw/(2*zoom),0,iw-iw/zoom)':"
        f"y='clip(({pan_y})*ih-ih/(2*zoom),0,ih-ih/zoom)':"
        f"d=1:s={width}x{height}:fps={_ZOOM_FPS}"
        f"[{out_label}]"
    )


def _pan_expr(face_track_canvas: list[tuple[float, float, float]], axis: str, t_var: str | None = None) -> str:
    """
    Build a piecewise-linear pan-target expression (normalized 0-1) from
    `face_track_canvas` keyframes — (t, cx, cy) triples (see
    `_face_track_to_canvas` for the zoompan/Mechanism-A case, or raw
    source-normalized face_track for the crop/Mechanism-B case).

    Linearly interpolates between consecutive keyframes; holds the nearest
    edge value outside the track's time range. Returns the constant "0.5"
    if the track is empty.

    `t_var`: the ffmpeg time expression to compare keyframe times against —
    defaults to zoompan's output-frame-derived `(on/_ZOOM_FPS)`; pass `"t"`
    for filters (e.g. `crop`) that expose a `t` (seconds) variable directly.
    """
    if not face_track_canvas:
        return "0.5"

    val_idx = 2 if axis == "y" else 1
    times = [p[0] for p in face_track_canvas]
    vals = [p[val_idx] for p in face_track_canvas]
    t = t_var or f"(on/{_ZOOM_FPS})"

    expr = f"{vals[-1]:.4f}"
    for i in range(len(times) - 2, -1, -1):
        t0, t1 = times[i], times[i + 1]
        v0, v1 = vals[i], vals[i + 1]
        if t1 - t0 > 1e-6:
            interp = f"({v0:.4f}+({v1 - v0:.4f})*(({t}-{t0:.3f})/{(t1 - t0):.4f}))"
        else:
            interp = f"{v1:.4f}"
        expr = f"if(lt({t},{t1:.3f}),{interp},{expr})"

    return f"if(lt({t},{times[0]:.3f}),{vals[0]:.4f},{expr})"


def _fg_geometry(template: str, width: int, height: int, src_w: int, src_h: int) -> tuple[float, float, float, float]:
    """
    Returns (fg_w, fg_h, fg_x, fg_y) — the size and top-left offset of the
    foreground video box within the `width x height` `[pre]` canvas for
    `template`. Used to map a source-frame-normalized face position into
    canvas-normalized pan coordinates.

    Only covers templates whose `[pre]` canvas places the source video in a
    single rectangular box (the `_dynamic_zoom_filter` pan templates) —
    `gameplay`/`screenshare` use face-driven crop offsets instead (Mechanism
    B) and keep the zoompan pan centred.
    """
    if template in ("blur_bg", "glass"):
        # scale={width}:-2:force_original_aspect_ratio=decrease, overlay centred
        fg_w = float(width)
        fg_h = fg_w * src_h / src_w
        return fg_w, fg_h, 0.0, (height - fg_h) / 2
    if template == "zoom_blur":
        # scale={width*1.2}:-2:force_original_aspect_ratio=decrease, overlay centred
        fg_w = float(_even_round(width * 1.2))
        fg_h = fg_w * src_h / src_w
        return fg_w, fg_h, (width - fg_w) / 2, (height - fg_h) / 2
    if template == "neon_frame":
        # scale to inner_w x inner_h (decrease), padded centred, overlay at (20,20)
        inner_w, inner_h = width - 40, height - 40
        scale = min(inner_w / src_w, inner_h / src_h)
        fg_w, fg_h = src_w * scale, src_h * scale
        return fg_w, fg_h, 20 + (inner_w - fg_w) / 2, 20 + (inner_h - fg_h) / 2
    if template == "split_screen":
        # top half: scale to width x half_h (decrease), padded centred
        half_h = height // 2
        scale = min(width / src_w, half_h / src_h)
        fg_w, fg_h = src_w * scale, src_h * scale
        return fg_w, fg_h, (width - fg_w) / 2, (half_h - fg_h) / 2
    # color_bars / gradient / cinema: scale to width x vid_h (decrease), padded
    # centred horizontally, top-aligned (y=0) within the vid box at y=bar_h
    bar_h = _even_round(height * 656 / 1920)
    vid_h = height - 2 * bar_h
    scale = min(width / src_w, vid_h / src_h)
    fg_w, fg_h = src_w * scale, src_h * scale
    return fg_w, fg_h, (width - fg_w) / 2, bar_h


def _face_track_to_canvas(
    face_track: list[tuple[float, float, float]] | None,
    template: str,
    width: int,
    height: int,
    src_w: int,
    src_h: int,
) -> list[tuple[float, float, float]]:
    """Map a source-frame-normalized face track into `[pre]`-canvas-normalized
    (t, cx, cy) keyframes for `template`, clamped to [0,1]. Returns [] if
    `face_track`/`src_w`/`src_h` are unavailable."""
    if not face_track or src_w <= 0 or src_h <= 0:
        return []
    fg_w, fg_h, fg_x, fg_y = _fg_geometry(template, width, height, src_w, src_h)
    canvas: list[tuple[float, float, float]] = []
    for t, nx, ny in face_track:
        cx = (nx * fg_w + fg_x) / width
        cy = (ny * fg_h + fg_y) / height
        canvas.append((t, min(1.0, max(0.0, cx)), min(1.0, max(0.0, cy))))
    return canvas


def _fc_crop_offset(
    face_track: list[tuple[float, float, float]] | None,
    axis: str,
    in_dim: str,
    box_dim: str,
    fallback: str,
) -> str:
    """
    Build a `crop` x/y offset expression that follows the face, in terms of
    `in_dim` (the `crop` filter's `in_w`/`in_h`) and `box_dim` (the crop
    box's width/height). `face_track` is source-frame-normalized — under
    `force_original_aspect_ratio=increase`, normalized coordinates map
    directly onto `in_w`/`in_h`, so no source-resolution lookup is needed.

    Returns `fallback` verbatim if `face_track` is empty (reproduces the
    previous static crop offset exactly).
    """
    if not face_track:
        return fallback
    pos_expr = _pan_expr(face_track, axis, t_var="t")
    return f"clip(({pos_expr})*{in_dim}-({box_dim})/2,0,{in_dim}-({box_dim}))"


def _compute_zoom_beats(
    captions: list[Caption],
    clip_duration: float,
    max_beats: int = 10,
    min_gap: float = 2.5,
) -> list[float]:
    """
    Derive "zoom beat" timestamps from caption start times — one punch-in
    per new line/phrase, thinned so beats are >= min_gap seconds apart
    (avoids a seizure-inducing zoom on every word) and capped at max_beats.
    Skips beats too close to the very start or end of the clip.
    """
    beats: list[float] = []
    for c in captions:
        if c.start < 0.5 or c.start > clip_duration - 0.5:
            continue
        if beats and c.start - beats[-1] < min_gap:
            continue
        beats.append(c.start)
        if len(beats) >= max_beats:
            break
    return beats


def _even_round(x: float) -> int:
    """Round to the nearest even integer (libx264 requires even dimensions)."""
    n = int(round(x))
    return n if n % 2 == 0 else n + 1


# ══════════════════════════════════════════════════════════════
#  TEMPLATE FILTER BUILDERS — pure string construction, no I/O
# ══════════════════════════════════════════════════════════════

# ── Template 1: blur_bg ────────────────────────────────────────

def _fc_blur_bg(
    width: int,
    height: int,
    zoom_beats: list[float] | None,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    blur_radius: int = 25,
    out_label: str = "out",
) -> str:
    """
    Main video centred, blurred copy fills top+bottom.
    blur_radius: 25 = standard, 40 = zoom_blur heavy effect.
    """
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        f"boxblur=luma_radius={blur_radius}:luma_power=1:"
        f"chroma_radius={blur_radius}:chroma_power=1[bg];"
        f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "blur_bg", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 2: zoom_blur ─────────────────────────────────────

def _fc_zoom_blur(
    width: int,
    height: int,
    zoom_beats: list[float] | None,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """120 % zoomed foreground + heavy blur background — dramatic feel."""
    zoom_w = _even_round(width * 1.2)
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        "boxblur=luma_radius=40:luma_power=2:"
        "chroma_radius=40:chroma_power=2[bg];"
        f"[0:v]scale={zoom_w}:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "zoom_blur", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 3: glass ─────────────────────────────────────────

def _fc_glass(
    width: int,
    height: int,
    zoom_beats: list[float] | None,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Glassmorphism — blurred + slightly brightened, desaturated bg;
    crisp main video centred giving a frosted-glass depth effect.
    """
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        "boxblur=luma_radius=28:luma_power=2:"
        "chroma_radius=28:chroma_power=2,"
        "eq=brightness=0.18:saturation=0.35:contrast=0.85[bg];"
        f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "glass", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 4: colour_bars ───────────────────────────────────

def _fc_colour_bars(
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Solid-colour bars fill top + bottom letterbox gaps.
    bar_color: e.g. "#0d0d0d", "#1a1a2e", "#ffffff"
    Layout: [bar][video][bar] — bar ≈ 34 % of height each, video ≈ 32 %.
    """
    c     = _hex_to_ffmpeg(bar_color)
    bar_h = _even_round(height * 656 / 1920)
    vid_h = height - 2 * bar_h
    fc    = (
        f"color=c={c}:s={width}x{bar_h}[topbar];"
        f"color=c={c}:s={width}x{bar_h}[botbar];"
        f"[0:v]scale={width}:{vid_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{vid_h}:(ow-iw)/2:0:color=black[vid];"
        "[topbar][vid][botbar]vstack=inputs=3[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "color_bars", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 5: gradient ──────────────────────────────────────

def _fc_gradient(
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Gradient bars — top bar is dark, bottom bar is the accent colour.
    Creates a visual depth / branded look.
    """
    bright = _hex_to_ffmpeg(bar_color)
    dark   = _darken(bar_color, 0.25)
    bar_h  = _even_round(height * 656 / 1920)
    vid_h  = height - 2 * bar_h

    fc = (
        f"color=c={dark}:s={width}x{bar_h}[topbar];"
        f"color=c={bright}:s={width}x{bar_h}[botbar];"
        f"[0:v]scale={width}:{vid_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{vid_h}:(ow-iw)/2:0:color=black[vid];"
        "[topbar][vid][botbar]vstack=inputs=3[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "gradient", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 6: cinema ────────────────────────────────────────

def _fc_cinema(
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """Classic cinematic black bars — letterbox portrait."""
    return _fc_colour_bars("#000000", zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)


# ── Template 7: neon_frame ────────────────────────────────────

def _fc_neon_frame(
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Solid coloured border around the video — neon / branded frame.
    20 px border on all sides → video area = (width-40) × (height-40).
    """
    c  = _hex_to_ffmpeg(bar_color)
    inner_w, inner_h = width - 40, height - 40
    fc = (
        f"color=c={c}:s={width}x{height}[frame];"
        f"[0:v]scale={inner_w}:{inner_h}:force_original_aspect_ratio=decrease,"
        f"pad={inner_w}:{inner_h}:(ow-iw)/2:(oh-ih)/2:black[vid];"
        "[frame][vid]overlay=20:20[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "neon_frame", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 8: split_screen ──────────────────────────────────

def _fc_split_screen(
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Top half  = video (letterboxed to width × height/2)
    Bottom half = same video vertically flipped — eye-catching dual layout.
    """
    half_h = height // 2
    fc = (
        f"[0:v]scale={width}:{half_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{half_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
        f"[0:v]scale={width}:{half_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{half_h}:(ow-iw)/2:(oh-ih)/2:black,vflip[bot];"
        "[top][bot]vstack[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "split_screen", width, height, src_w, src_h)
    pan_x, pan_y = _pan_expr(canvas_track, "x"), _pan_expr(canvas_track, "y")
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats, pan_x, pan_y)


# ── Template 9: screenshare ──────────────────────────────────

def _fc_screenshare(
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Tutorial / screenshare layout:
      Top half    — full-width letterboxed video (shows entire frame)
      Bottom half — crop of the source filling the bottom half (shows centre / speaker,
                     or the face-tracked speaker position when `face_track` is available)
    """
    half_h  = height // 2
    inner_h = _even_round(half_h * 9 / 16)
    crop_x = _fc_crop_offset(face_track, "x", "in_w", str(width), "0")
    crop_y = _fc_crop_offset(face_track, "y", "in_h", str(half_h), f"(in_h-{half_h})/2")
    fc = (
        f"[0:v]scale={width}:{inner_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{half_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{half_h}:'{crop_x}':'{crop_y}'[bot];"
        "[top][bot]vstack[pre]"
    )
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats)


# ── Template 10: gameplay ─────────────────────────────────────

def _fc_gameplay(
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Gaming / podcast layout:
      Top 30 %    — portrait crop  (webcam / speaker — face-tracked when
                     `face_track` is available)
      Bottom 70 % — full-width     (gameplay / slides)
    """
    top_h = _even_round(height * 0.3)
    bot_h = height - top_h
    crop_x = _fc_crop_offset(face_track, "x", "in_w", str(width), "0")
    crop_y = _fc_crop_offset(face_track, "y", "in_h", str(top_h), f"(in_h-{top_h})/2")
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{top_h}:'{crop_x}':'{crop_y}'[top];"
        f"[0:v]scale={width}:{bot_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{bot_h}:(ow-iw)/2:(oh-ih)/2:black[bot];"
        "[top][bot]vstack[pre]"
    )
    return fc + ";" + _dynamic_zoom_filter("pre", out_label, width, height, zoom_beats)


def _build_template_filter(
    template: str,
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    out_label: str = "out",
) -> str:
    """Dispatch to the filter-string builder for `template`, ending in [{out_label}].

    `face_track`/`src_w`/`src_h` come from `face_tracker.compute_face_track()`
    — empty/None reproduces the previous centre-default behaviour exactly.
    """
    if template == "blur_bg":
        return _fc_blur_bg(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "zoom_blur":
        return _fc_zoom_blur(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "glass":
        return _fc_glass(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "color_bars":
        return _fc_colour_bars(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "gradient":
        return _fc_gradient(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "cinema":
        return _fc_cinema(zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "neon_frame":
        return _fc_neon_frame(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "split_screen":
        return _fc_split_screen(zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "screenshare":
        return _fc_screenshare(zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "gameplay":
        return _fc_gameplay(zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    return _fc_blur_bg(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)


# ══════════════════════════════════════════════════════════════
#  Encode semaphore
# ══════════════════════════════════════════════════════════════

_ENCODE_SEMAPHORE: asyncio.Semaphore | None = None


def _get_encode_semaphore() -> asyncio.Semaphore:
    global _ENCODE_SEMAPHORE
    if _ENCODE_SEMAPHORE is None:
        _ENCODE_SEMAPHORE = asyncio.Semaphore(settings.MAX_CONCURRENT_ENCODES)
    return _ENCODE_SEMAPHORE


# ══════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT — reframe_and_caption
# ══════════════════════════════════════════════════════════════

async def _encode_reframed_and_captioned(
    input_path: Path,
    raw_output_path: Path,
    captioned_output_path: Path,
    template: str,
    bar_color: str,
    zoom_beats: list[float] | None,
    width: int,
    height: int,
    captions: list[Caption] | None,
    style: str,
    color: str,
    h_align: str,
    v_align: str,
    words_per_line: int,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
) -> None:
    """One ffmpeg invocation: reframe + (optionally) burn captions, producing
    both the raw reframed output and the captioned output."""
    ass_path: str | None = None
    try:
        if captions or hook_title:
            fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="reframed")
            ass_content = build_ass_content(captions or [], style, color, h_align, v_align, words_per_line, hook_title)
            with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
                f.write(ass_content)
                ass_path = f.name
            safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
            fc += f";[reframed]split=2[rawv][capv];[capv]ass={safe_ass}[capout]"

            cmd = [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-filter_complex", fc,
                "-map", "[rawv]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                str(raw_output_path),
                "-map", "[capout]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "copy", "-movflags", "+faststart",
                str(captioned_output_path),
            ]
        else:
            fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="out")
            cmd = [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-filter_complex", fc,
                "-map", "[out]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                str(raw_output_path),
            ]

        async with _get_encode_semaphore():
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
                raise RuntimeError(f"FFmpeg reframe+caption timed out [{input_path.name}]")

        if proc.returncode != 0:
            raise RuntimeError(
                f"FFmpeg reframe+caption failed [{input_path.name}]: "
                f"{stderr.decode(errors='ignore')[-400:]}"
            )

        if not (captions or hook_title):
            shutil.copy(raw_output_path, captioned_output_path)

        for out in (raw_output_path, captioned_output_path):
            if not out.exists() or out.stat().st_size < 1024:
                raise RuntimeError(f"Reframe+caption output missing or too small: {out}")
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)


async def reframe_and_caption(
    input_path: Path,
    raw_output_path: Path,
    captioned_output_path: Path,
    template: str = "blur_bg",
    bar_color: str = "#0d0d0d",
    zoom_beats: list[float] | None = None,
    aspect: str = "9:16",
    captions: list[Caption] | None = None,
    style: str = "minimal",
    color: str = "white_black",
    h_align: str = "center",
    v_align: str = "bottom",
    words_per_line: int = 3,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
) -> tuple[Path, Path]:
    """
    Reframe a 16:9 clip into the chosen aspect ratio and (if `captions` or
    `hook_title` is non-empty) burn an ASS overlay onto a second copy —
    both in ONE ffmpeg pass.

    Args:
        input_path:             raw extracted clip (any res, 16:9)
        raw_output_path:        where to write the reframed (uncaptioned) mp4
        captioned_output_path:  where to write the reframed + captioned mp4
                                 (a plain copy of raw_output_path if both
                                 `captions` and `hook_title` are empty)
        template:    one of VALID_TEMPLATES
        bar_color:   hex colour for bars / frame / gradient  (#RRGGBB)
        zoom_beats:  caption-start timestamps (seconds) to punch-zoom on —
                     see _compute_zoom_beats(). Empty/None = ambient drift only.
        aspect:      one of VALID_ASPECTS — "9:16" (default), "16:9", "1:1"
        captions, style, color, h_align, v_align, words_per_line:
                     passed to build_ass_content() when captions is non-empty
        hook_title:  AI-generated hook (ClipTimestamp.title), burned as a
                     boxed title card for the first HOOK_TITLE_DURATION
                     seconds regardless of `captions`
        face_track, src_w, src_h:
                     dominant-face position track and source resolution from
                     face_tracker.compute_face_track() — drives the zoompan
                     pan target / speaker-box crop offset. Empty/None falls
                     back to centre-default framing.

    Returns (raw_output_path, captioned_output_path) on success.
    """
    tpl = template if template in VALID_TEMPLATES else "blur_bg"
    asp = aspect if aspect in VALID_ASPECTS else "9:16"
    width, height = ASPECT_DIMENSIONS[asp]

    logger.info(
        f"{input_path.name} → template={tpl} aspect={asp} ({width}x{height}) "
        f"bar={bar_color} zoom_beats={len(zoom_beats or [])} captions={len(captions or [])} "
        f"face_track={len(face_track or [])}"
    )

    try:
        await _encode_reframed_and_captioned(
            input_path, raw_output_path, captioned_output_path,
            tpl, bar_color, zoom_beats, width, height,
            captions, style, color, h_align, v_align, words_per_line,
            hook_title, face_track, src_w, src_h,
        )
    except Exception as exc:
        logger.error(
            f"{input_path.name}: template '{tpl}' failed ({exc}); falling back to blur_bg"
        )
        try:
            await _encode_reframed_and_captioned(
                input_path, raw_output_path, captioned_output_path,
                "blur_bg", bar_color, None, width, height,
                captions, style, color, h_align, v_align, words_per_line,
                hook_title, None, 0, 0,
            )
        except Exception as exc2:
            raise RuntimeError(
                f"All reframe+caption attempts failed for {input_path.name}: {exc2}"
            ) from exc2

    return raw_output_path, captioned_output_path
