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

  color_bars   Solid color bars (merged: covers the old "gradient",
               "cinema", and "neon_frame" looks — they were all visually
               near-identical bar/frame variants, so pick any colour via
               `bar_color` — e.g. "#000000" reproduces the old cinema look)
               Custom-color bars top & bottom (brand / aesthetic).

  full_screen  Full Screen
               Face-tracked crop fills the entire 9:16 canvas — no bars,
               no blur, video covers every pixel. Like crop_fill at 100 %.

  gameplay     Gameplay / Podcast (TEMPORARILY DISABLED — registration is
               commented out below pending a rework; function kept intact)
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
import contextlib
import logging
import shutil
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.pipeline.cta_overlay import build_cta_ass

from app.core.config import get_settings
from app.core.proxy import get_proxyseller_proxy
from app.pipeline.captions import (
    Caption, build_ass_content, compute_hook_duration, _hook_position, _safe_upper,
    FONT_OPTIONS, DEFAULT_FONT,
)
from app.pipeline.downloader import download_clip_segments, download_source_parallel
from app.pipeline.title_box import (
    DEFAULT_TITLE_BG, DEFAULT_TITLE_BG_OPACITY, DEFAULT_TITLE_TEXT_COLOR,
    TITLE_TEXT_COLORS, overlay_xy, render_title_box_png,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Public constants ───────────────────────────────────────────

VALID_TEMPLATES = [
    "crop_fill",     # Full-fill crop — video fills entire frame, blurred strips
    "blur_bg",       # Blur background
    "zoom_blur",     # Heavy zoom + blur
    "glass",         # Glassmorphism
    "color_bars",    # Solid coloured bars
    "full_screen",   # True full-screen — face-tracked crop, no bars, 100% fill (default)
    "gameplay_50_50",
    "gameplay_40_60",
    "gameplay_face",
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


def _ytdlp_download_sync(video_id: str, output_path: Path, proxy_url: str | None, format_str: str | None = None) -> None:
    """Blocking yt-dlp download — runs inside a thread pool executor."""
    import yt_dlp

    default_format = (
        "bestvideo[height<=1080][ext=mp4][vcodec!=av01]+bestaudio[ext=m4a]"
        "/bestvideo[height<=1080][vcodec!=av01]+bestaudio"
        "/best[height<=1080][vcodec!=av01]/best"
    )

    # mweb — PO-token-backed (bgutil sidecar, see stream.py) rather than the
    # old "android" client, which now requires device-attestation tokens no
    # server-side provider can generate and fails every request.
    from app.pipeline.stream import _pot_extractor_args

    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "outtmpl": str(output_path),
        "format": format_str or default_format,
        "merge_output_format": "mp4",
        "extractor_args": {"youtube": {"player_client": ["mweb"]}, **_pot_extractor_args()},
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
    format_str: str | None = None,
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
        loop.run_in_executor(None, _ytdlp_download_sync, video_id, output_path, proxy_url, format_str),
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


async def probe_clip_start_offset(clip_path: Path, requested_duration: float) -> float:
    """
    Return how many seconds BEFORE the requested start the clip actually begins.

    When -ss is used before -i (input seeking), ffmpeg snaps to the nearest
    keyframe earlier than the requested start.  The output is PTS-zeroed with
    -avoid_negative_ts make_zero, so the keyframe offset equals the difference
    between the actual clip duration and the requested duration.

        keyframe_offset = actual_duration - requested_duration

    Use this to adjust caption_base for the full-source-fallback path so
    captions don't appear before the corresponding audio.
    """
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(clip_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return 0.0
    try:
        actual = float(out.strip())
        return max(0.0, actual - requested_duration)
    except (ValueError, TypeError):
        return 0.0


async def _get_source(
    stream_url: str,
    audio_url: str | None,
    user_agent: str | None,
    video_id: str | None,
    job_dir: Path,
    proxy_url: str | None = None,
) -> Path:
    """
    Resolve a local copy of the full source video — routed through
    the caller's proxy (Proxy-Seller ISP in production, same IP that
    resolved the stream URL so IP-bound CDN URLs work).

    Tries a parallel ranged HTTP download first (fast). If the CDN URL
    doesn't support Range requests or otherwise fails, falls back to the
    existing sequential chain: proxied ffmpeg download -> yt-dlp.
    """
    source_path = job_dir / "source.mp4"

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


async def get_clip_via_dash(
    stream_url: str,
    start: float,
    end: float,
    output_path: Path,
    audio_url: str | None = None,
    user_agent: str | None = None,
    session_id: str | None = None,
    proxy_url: str | None = None,
) -> Path:
    """
    Download and extract a single clip [start, end] using the DASH sidx approach —
    fetches only the MP4 segments covering the clip window (~3-5% of the full file)
    instead of downloading the entire video.

    Flow:
      1. Parse sidx box from first 8-64 KB of CDN URL → time→byte segment map
      2. Download init segment (moov/ftyp, ~5 KB) + clip segments concurrently
      3. Write as a valid fMP4, then ffmpeg -ss/-t to trim to exact timestamps

    Falls back to RuntimeError on any sidx parse or fetch failure — callers
    should catch and fall back to _get_source + extract_clip.
    """
    if not proxy_url:
        proxy_url = get_proxyseller_proxy(session_id=session_id)
    raw_path  = output_path.with_suffix(".dash_raw.mp4")

    try:
        _, actual_start_t = await download_clip_segments(
            stream_url, start, end, raw_path,
            audio_url=audio_url, user_agent=user_agent, proxy_url=proxy_url,
        )
    except Exception as exc:
        raw_path.unlink(missing_ok=True)
        raise RuntimeError(f"DASH segment download failed: {exc}") from exc

    # The fMP4 preserves original absolute PTS (e.g. starts at t=60s for a clip
    # at 60s in the video). The correct seek offset is relative to the first
    # segment's start, not the clip_start — otherwise we'd overshoot.
    duration = end - start
    ss_offset = max(0.0, start - actual_start_t)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(ss_offset), "-i", str(raw_path),
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
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise RuntimeError(f"FFmpeg DASH trim timed out [{start:.0f}-{end:.0f}s]")
        finally:
            raw_path.unlink(missing_ok=True)

    if proc.returncode != 0:
        raise RuntimeError(
            f"FFmpeg DASH trim failed [{start:.0f}-{end:.0f}s]: "
            f"{stderr.decode(errors='ignore')[-400:]}"
        )
    if not output_path.exists() or output_path.stat().st_size < 1024:
        raise RuntimeError(f"DASH clip output missing or too small: {output_path}")

    logger.info(f"DASH clip {start:.0f}-{end:.0f}s → {output_path.name} ({output_path.stat().st_size // 1024} KB)")
    return output_path


# ══════════════════════════════════════════════════════════════
#  STEP 6 — Vertical reframe
# ══════════════════════════════════════════════════════════════

# ── Helpers ───────────────────────────────────────────────────

def _hex_to_ffmpeg(color: str) -> str:
    """'#RRGGBB' → '0xRRGGBB' for FFmpeg color parameters."""
    return "0x" + color.lstrip("#").upper()


# Beat-synced punch-zoom tuning constants
_ZOOM_FPS       = 30
_ZOOM_ATTACK    = 0.12   # seconds to punch in
_ZOOM_DECAY     = 0.35   # seconds to ease back to baseline
_ZOOM_PEAK      = 1.04   # zoom level at the peak of a punch (was 1.08 — subtler)
_ZOOM_BASE_MAX  = 1.02   # ambient drift ceiling when no punch is active (was 1.05)
_ZOOM_BASE_RATE = 0.0003

# crop_fill scale: 1.0 = fully fills 9:16 (tightest crop, ~1.78x magnification
# of the source), <1.0 = shows more context with blurred strips on top/bottom
# instead of cropping/zooming it away.
# 0.65 means 35% of height becomes blur strips (~336 px each side on
# 1080x1920), bringing magnification down to ~1.15x — close to native
# source resolution, so the kept video stays sharp instead of being upscaled.
_CROP_FILL_SCALE = 0.65


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
    """Kept for reference only — replaced by _fast_crop_pan in all templates."""
    return (
        f"[{input_label}]zoompan="
        f"z='{_zoom_expr(zoom_beats or [])}':"
        f"x='clip(({pan_x})*iw-iw/(2*zoom),0,iw-iw/zoom)':"
        f"y='clip(({pan_y})*ih-ih/(2*zoom),0,ih-ih/zoom)':"
        f"d=1:s={width}x{height}:fps={_ZOOM_FPS}"
        f"[{out_label}]"
    )


def _fast_crop_pan(
    input_label: str,
    out_label: str,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None = None,
) -> str:
    """
    Fast alternative to zoompan: scale up 2 % then crop with a face-following
    offset. Produces the same mild zoom-in and face pan as zoompan but is
    ~15× faster because crop+scale require zero per-frame expression
    evaluation — the CPU just copies pixels.

    face_track: canvas-normalised (t, cx, cy) keyframes from
    _face_track_to_canvas(). When absent, the crop is centred.
    """
    scale_w = _even_round(width * 1.02)
    scale_h = _even_round(height * 1.02)
    ex = scale_w - width   # excess pixels horizontally
    ey = scale_h - height  # excess pixels vertically

    if face_track:
        px = _pan_expr(face_track, "x", t_var="t")
        py = _pan_expr(face_track, "y", t_var="t")
        cx = f"clip(({px})*{ex},0,{ex})"
        cy = f"clip(({py})*{ey},0,{ey})"
    else:
        cx = str(ex // 2)
        cy = str(ey // 2)

    return (
        f"[{input_label}]scale={scale_w}:{scale_h},"
        f"crop={width}:{height}:'{cx}':'{cy}'"
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
    `gameplay` (disabled) uses face-driven crop offsets instead (Mechanism B)
    and keeps the zoompan pan centred.
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
    # Fallback (e.g. color_bars): scale to width x vid_h (decrease), padded
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


# Background blur is applied to the FULL canvas for the entire clip, single
# threaded (-threads 1 pin), and boxblur's per-pixel cost scales with frame
# area — at 1080x1920 with luma_power=2 (blur_bg/glass/zoom_blur all double-
# pass it) this was a major share of an encode's real CPU time, pushing
# heavy-caption clips past the 360s per-attempt timeout under 4-way
# concurrency (see reframe+caption timeout investigation, prod job
# 13cafde1). Downscaling before blur then scaling back up cuts the pixel
# count (and so the blur cost) by _BG_BLUR_DOWNSCALE², with no visible
# quality loss — the background ends up blurred into unrecognizability
# either way. Radius is scaled down by the same factor so the apparent
# blur strength on the final upscaled frame matches the original full-res
# radius.
_BG_BLUR_DOWNSCALE = 4


def _fast_boxblur_bg(width: int, height: int, radius: int, power: int, extra: str = "") -> str:
    """
    Downscale -> boxblur -> upscale filter fragment for a full-canvas
    background blur, e.g. `[0:v]scale=...,crop=...,{this}[bg]`.
    `extra` is an optional filter (e.g. `eq=...`) inserted after the blur,
    still at the cheap downscaled resolution.
    """
    down_w = _even_round(width / _BG_BLUR_DOWNSCALE)
    down_h = _even_round(height / _BG_BLUR_DOWNSCALE)
    down_r = max(1, round(radius / _BG_BLUR_DOWNSCALE))
    tail = f",{extra}" if extra else ""
    return (
        f"scale={down_w}:{down_h}:flags=fast_bilinear,"
        f"boxblur=luma_radius={down_r}:luma_power={power}:chroma_radius={down_r}:chroma_power={power}"
        f"{tail},"
        f"scale={width}:{height}:flags=fast_bilinear"
    )


# ══════════════════════════════════════════════════════════════
#  TEMPLATE FILTER BUILDERS — pure string construction, no I/O
# ══════════════════════════════════════════════════════════════

# ── Template 0: crop_fill ─────────────────────────────────────

def _fc_crop_fill(
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    Face-aware crop: cuts the 9:16-shaped window directly out of the SOURCE
    at native resolution (face-tracking pans the window, no premature
    upscale), then scales that native window up to the target size in one
    pass. Leftover top/bottom (per `_CROP_FILL_SCALE`) is filled with a
    blurred background instead of being cropped/zoomed away.

    Face tracking pans the crop window to keep the speaker centred.
    Falls back to a centred crop when no face track is available.
    """
    # When _CROP_FILL_SCALE < 1.0 the kept window is shorter than the full
    # canvas height, so slightly more of the 16:9 frame survives the crop,
    # with thin blurred strips filling the leftover top/bottom.  At 1.0 the
    # window covers the canvas exactly (pure crop, no bars).
    vid_h = _even_round(height * _CROP_FILL_SCALE)
    cx = _fc_crop_offset(face_track, "x", "iw", "ow", "(iw-ow)/2")
    cy = _fc_crop_offset(face_track, "y", "ih", "oh", "(ih-oh)/2")

    if _CROP_FILL_SCALE >= 1.0 or src_w <= 0 or src_h <= 0:
        # No native source dims to compute an exact native-pixel crop window
        # (or no bars wanted) — fall back to scale-to-cover then crop.
        return (
            f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={width}:{height}:'{cx}':'{cy}'"
            f"[{out_label}]"
        )

    # Native crop window: the exact source-pixel rectangle whose aspect ratio
    # matches width:vid_h — cropped directly from the untouched source frame,
    # so the face-tracking pan moves over real native pixels, not an already
    # upscaled frame.
    # Both dimensions MUST be even (libx264/yuv420p chroma requirement) — the
    # "kept as the full native dimension" side here used to pass src_w/src_h
    # straight through with NO rounding. Most source videos have even native
    # resolutions so this went unnoticed, but a video with an odd native
    # dimension fed an odd crop size into the downstream lanczos scale,
    # which can hang ffmpeg instead of erroring cleanly (confirmed in
    # production: crop_fill timed out at 180s on a clip that blur_bg —
    # which never touches src_w/src_h directly — encoded successfully on
    # the identical input). Round DOWN here, not _even_round() (which always
    # rounds odd values UP) — rounding up would request a crop region
    # taller/wider than the actual source frame, an out-of-bounds crop.
    target_aspect = width / vid_h
    if src_w / src_h > target_aspect:
        crop_h_native = src_h if src_h % 2 == 0 else src_h - 1
        crop_w_native = _even_round(src_h * target_aspect)
    else:
        crop_w_native = src_w if src_w % 2 == 0 else src_w - 1
        crop_h_native = _even_round(src_w / target_aspect)

    # Blurred background fills the thin top/bottom strips; main video is the
    # native-cropped window, scaled up once to its final size.
    # bg scale uses fast_bilinear — boxblur destroys any high-quality-scaling
    # advantage, so the cheaper filter is free CPU savings.
    return (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
        f"crop={width}:{height},"
        f"{_fast_boxblur_bg(width, height, 25, 1)}[_cf_bg];"
        f"[0:v]crop={crop_w_native}:{crop_h_native}:'{cx}':'{cy}',"
        f"scale={width}:{vid_h}:flags=bicubic[_cf_fg];"
        f"[_cf_bg][_cf_fg]overlay=(W-w)/2:(H-h)/2[{out_label}]"
    )


# ── Template: full_screen ─────────────────────────────────────

def _fc_full_screen(
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    src_w: int,
    src_h: int,
    out_label: str = "out",
) -> str:
    """
    True full-screen: face-tracked crop that fills the ENTIRE 9:16 canvas.
    Same logic as crop_fill but with scale=1.0 — no blurred strips, no bars,
    video covers every pixel.
    """
    cx = _fc_crop_offset(face_track, "x", "iw", "ow", "(iw-ow)/2")
    cy = _fc_crop_offset(face_track, "y", "ih", "oh", "(ih-oh)/2")
    return (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=bicubic,"
        f"crop={width}:{height}:'{cx}':'{cy}'"
        f"[{out_label}]"
    )


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
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
        f"crop={width}:{height},"
        f"{_fast_boxblur_bg(width, height, blur_radius, 1)}[bg];"
        f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "blur_bg", width, height, src_w, src_h)
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height, canvas_track)


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
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
        f"crop={width}:{height},"
        f"{_fast_boxblur_bg(width, height, 40, 2)}[bg];"
        f"[0:v]scale={zoom_w}:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "zoom_blur", width, height, src_w, src_h)
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height, canvas_track)


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
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
        f"crop={width}:{height},"
        f"{_fast_boxblur_bg(width, height, 28, 2, extra='eq=brightness=0.18:saturation=0.35:contrast=0.85')}[bg];"
        f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[pre]"
    )
    canvas_track = _face_track_to_canvas(face_track, "glass", width, height, src_w, src_h)
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height, canvas_track)


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
    Solid-colour bars top + bottom, face-tracked crop-fill in the center.
    Bars are 15 % of frame height each; video section fills the remaining 70 %.
    The video section uses crop-fill (not letterbox) so the speaker fills the
    center strip — no dead black padding within the video area.
    """
    c     = _hex_to_ffmpeg(bar_color)
    bar_h = _even_round(height * 0.15)
    vid_h = height - 2 * bar_h
    cx = _fc_crop_offset(face_track, "x", "iw", "ow", "(iw-ow)/2")
    cy = _fc_crop_offset(face_track, "y", "ih", "oh", "(ih-oh)/2")
    return (
        f"color=c={c}:s={width}x{bar_h}[topbar];"
        f"color=c={c}:s={width}x{bar_h}[botbar];"
        f"[0:v]scale={width}:{vid_h}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={width}:{vid_h}:'{cx}':'{cy}',"
        f"unsharp=lx=5:ly=5:la=0.8:cx=5:cy=5:ca=0.0[vid];"
        f"[topbar][vid][botbar]vstack=inputs=3[{out_label}]"
    )


# Templates 5-7 (gradient / cinema / neon_frame) were merged into
# color_bars above — they were near-identical bar/frame variants of the
# same crop-fill-with-border look. Use `bar_color` to pick the look (e.g.
# "#000000" reproduces the old cinema black bars).


# ── Template 10: gameplay (TEMPORARILY DISABLED, see VALID_TEMPLATES) ──

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
    crop_x = _fc_crop_offset(face_track, "x", "in_w", str(width), f"(in_w-{width})/2")
    crop_y = _fc_crop_offset(face_track, "y", "in_h", str(top_h), f"(in_h-{top_h})/2")
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={width}:{top_h}:'{crop_x}':'{crop_y}',"
        f"unsharp=lx=5:ly=5:la=0.8:cx=5:cy=5:ca=0.0[top];"
        f"[0:v]scale={width}:{bot_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{bot_h}:(ow-iw)/2:(oh-ih)/2:black[bot];"
        "[top][bot]vstack[pre]"
    )
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height)



def _fc_gameplay_split(
    template: str,
    gameplay_idx: int | None,
    width: int,
    height: int,
    face_track: list[tuple[float, float, float]] | None,
    out_label: str = "out",
) -> str:
    if template == "gameplay_40_60":
        top_h = _even_round(height * 0.4)
    elif template == "gameplay_50_50":
        top_h = _even_round(height * 0.5)
    else:  # gameplay_face
        top_h = _even_round(height * 0.4)

    bot_h = height - top_h
    
    if template == "gameplay_face":
        cx = _fc_crop_offset(face_track, "x", "iw", "ow", "(iw-ow)/2")
        cy = _fc_crop_offset(face_track, "y", "ih", "oh", "(ih-oh)/2")
        top_f = (
            f"[0:v]scale={width}:{top_h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={width}:{top_h}:'{cx}':'{cy}'[top];"
        )
    else:
        top_f = (
            f"[0:v]scale={width}:{top_h}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
            f"crop={width}:{top_h},"
            f"{_fast_boxblur_bg(width, top_h, 25, 1)}[top_bg];"
            f"[0:v]scale={width}:-2:force_original_aspect_ratio=decrease[top_fg];"
            f"[top_bg][top_fg]overlay=(W-w)/2:(H-h)/2[top];"
        )
        
    if gameplay_idx is not None:
        bot_f = (
            f"[{gameplay_idx}:v]scale={width}:{bot_h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={width}:{bot_h}:(in_w-{width})/2:(in_h-{bot_h})/2[bot];"
        )
    else:
        bot_f = f"color=c=black:s={width}x{bot_h}[bot];"
        
    fc = top_f + bot_f + "[top][bot]vstack[pre]"
    return fc + ";" + _fast_crop_pan("pre", out_label, width, height)


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
    gameplay_idx: int | None = None,
) -> str:
    """Dispatch to the filter-string builder for `template`, ending in [{out_label}].
    """
    if template == "crop_fill":
        return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "blur_bg":
        return _fc_blur_bg(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "zoom_blur":
        return _fc_zoom_blur(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "glass":
        return _fc_glass(width, height, zoom_beats, face_track, src_w, src_h, out_label=out_label)
    elif template == "color_bars":
        return _fc_colour_bars(bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label=out_label)
    elif template == "full_screen":
        return _fc_full_screen(width, height, face_track, src_w, src_h, out_label=out_label)
    elif template.startswith("gameplay_"):
        return _fc_gameplay_split(template, gameplay_idx, width, height, face_track, out_label=out_label)
    return _fc_crop_fill(width, height, face_track, src_w, src_h, out_label=out_label)


# ══════════════════════════════════════════════════════════════
#  Encode semaphore
# ══════════════════════════════════════════════════════════════

_ENCODE_SEMAPHORE: asyncio.Semaphore | None = None


def _get_encode_semaphore() -> asyncio.Semaphore:
    global _ENCODE_SEMAPHORE
    if _ENCODE_SEMAPHORE is None:
        _ENCODE_SEMAPHORE = asyncio.Semaphore(settings.MAX_CONCURRENT_ENCODES)
    return _ENCODE_SEMAPHORE


@contextlib.asynccontextmanager
async def _maybe(semaphore: asyncio.Semaphore | None):
    """No-op passthrough when no per-job semaphore is supplied — callers
    that don't care about job-level fairness (e.g. the admin test pipeline)
    just get the existing global-only behavior."""
    if semaphore is None:
        yield
    else:
        async with semaphore:
            yield


# ══════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT — reframe_and_caption
# ══════════════════════════════════════════════════════════════

_WATERMARK_FONT_FILE = str(
    Path(__file__).parent.parent / "assets" / "fonts" / "PlusJakartaSans-ExtraBold.ttf"
)


def _render_marketer_watermark_png(
    logo_path: Path,
    canvas_width: int,
    opacity: float = 0.45,
) -> Path | None:
    """
    Pre-bake logo + 'ShortClipr.com' text into a single RGBA PNG with alpha
    already applied. Called once per clip (pure PIL, ~2 ms) so FFmpeg only
    needs ONE overlay filter per frame — no per-frame drawtext cost at all.

    Layout:  [LOGO]  ShortClipr.com   (logo left, text right, shared centre Y)

    Returns the temp PNG path, or None on any error (watermark silently skipped).
    """
    try:
        # ── Load + scale logo ──────────────────────────────────────────────
        logo_w_px = int(canvas_width * 0.175)   # 17.5% of canvas width
        logo_img  = Image.open(logo_path).convert("RGBA")
        aspect    = logo_img.height / logo_img.width
        logo_h_px = max(1, int(logo_w_px * aspect))
        logo_img  = logo_img.resize((logo_w_px, logo_h_px), Image.LANCZOS)

        # Apply opacity to the logo alpha channel directly
        alpha_ch = logo_img.split()[3]
        alpha_ch = alpha_ch.point(lambda a: int(a * opacity))
        logo_img.putalpha(alpha_ch)

        # ── Measure brand text ─────────────────────────────────────────────
        font_size = max(18, logo_w_px // 3)
        try:
            font = ImageFont.truetype(_WATERMARK_FONT_FILE, font_size)
        except Exception:
            font = ImageFont.load_default(size=font_size)

        probe = Image.new("RGBA", (1, 1))
        draw  = ImageDraw.Draw(probe)
        bbox  = draw.textbbox((0, 0), "ShortClipr.com", font=font)
        text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

        # ── Compose combined watermark canvas ─────────────────────────────
        gap      = 10
        total_w  = logo_w_px + gap + text_w
        total_h  = max(logo_h_px, text_h)
        wm       = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))

        # Logo — vertically centered
        logo_y = (total_h - logo_h_px) // 2
        wm.paste(logo_img, (0, logo_y), logo_img)

        # Text — vertically centered, white with same opacity
        text_alpha = int(255 * opacity)
        text_x     = logo_w_px + gap
        text_y     = (total_h - text_h) // 2
        draw_wm    = ImageDraw.Draw(wm)
        draw_wm.text(
            (text_x, text_y),
            "ShortClipr.com",
            font=font,
            fill=(255, 255, 255, text_alpha),
        )

        out = Path(tempfile.mktemp(suffix=".png", prefix="sc_wm_"))
        wm.save(out, "PNG")
        return out

    except Exception as exc:
        logger.warning(f"Watermark pre-render failed (skipping): {exc}")
        return None


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
    caption_y: float | None = None,
    caption_scale: float = 1.0,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    title_permanent: bool = False,
    clip_duration: float = 0.0,
    font: str = "default",
    title_color: str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg: str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
    job_semaphore: asyncio.Semaphore | None = None,
    is_marketer: bool = False,
    cta_settings: dict | None = None,
    gameplay_bg_path: Path | None = None,
) -> None:
    """One ffmpeg invocation: reframe + (optionally) burn captions, producing
    both the raw reframed output and the captioned output."""
    ass_path: str | None = None
    title_color_hex = TITLE_TEXT_COLORS.get(title_color, TITLE_TEXT_COLORS[DEFAULT_TITLE_TEXT_COLOR])
    box_path: Path | None = None
    try:
        extra_inputs: list[str] = []
        if gameplay_bg_path:
            extra_inputs.extend(["-stream_loop", "-1", "-i", str(gameplay_bg_path)])
            gameplay_idx = 1
        else:
            gameplay_idx = None
            
        fc = _build_template_filter(template, bar_color, zoom_beats, width, height, face_track, src_w, src_h, out_label="reframed_base", gameplay_idx=gameplay_idx)
        
        logo_path = Path(__file__).parent.parent / "assets" / "logo.png"
        wm_png_path: Path | None = None
        
        if is_marketer and logo_path.exists():
            wm_png_path = _render_marketer_watermark_png(logo_path, width, opacity=0.70)
            
            if wm_png_path:
                extra_inputs.extend(["-i", str(wm_png_path)])
                logo_idx = extra_inputs.count("-i")
                
                # Watermark visible for the entire clip, start to end.
                wm_enable = "1"
                
                wm_y_pct = 75.0
                if cta_settings and "watermark_y" in cta_settings:
                    wm_y_pct = float(cta_settings["watermark_y"])

                # Center horizontally, position vertically based on user setting (default 75%)
                fc += (
                    f";[reframed_base][{logo_idx}:v]overlay=(W-w)/2:(H*{wm_y_pct/100:.3f})-(h/2)"
                    f":enable='{wm_enable}'[reframed]"
                )
            else:
                fc += f";[reframed_base]copy[reframed]"
        else:
            fc += f";[reframed_base]copy[reframed]"

        # Determine whether we have a CTA to inject
        cta_enabled = bool(
            cta_settings
            and cta_settings.get("enabled")
            and cta_settings.get("pages")
            and clip_duration > 0
        )

        effective_captions = list(captions or [])
        if cta_enabled and effective_captions:
            cta_start = max(0.0, clip_duration - 10.0)
            filtered_caps = []
            for c in effective_captions:
                if c.start < cta_start:
                    if c.end > cta_start:
                        filtered_caps.append(Caption(start=c.start, end=cta_start, text=c.text))
                    else:
                        filtered_caps.append(c)
            effective_captions = filtered_caps

        if effective_captions or hook_title or cta_enabled:
            ass_content = build_ass_content(
                effective_captions, style, color, h_align, v_align, words_per_line, hook_title,
                template=template, title_permanent=title_permanent, clip_duration=clip_duration, font=font,
                title_color=title_color_hex, caption_y=caption_y, caption_scale=caption_scale,
            )

            # Inject CTA animation style & events into the ASS if marketer CTA is enabled
            if cta_enabled:
                mapped_font = FONT_OPTIONS.get(font, FONT_OPTIONS[DEFAULT_FONT])
                cta_ass = build_cta_ass(
                    pages=cta_settings["pages"],
                    clip_duration=clip_duration,
                    color_hex=cta_settings.get("color", "#FFFFFF"),
                    font_name=mapped_font,
                )
                if cta_ass:
                    cta_styles = [line for line in cta_ass.splitlines() if line.startswith("Style: CTA")]
                    cta_events = [line for line in cta_ass.splitlines() if line.startswith("Dialogue:")]

                    if cta_styles and "[Events]" in ass_content:
                        parts = ass_content.split("[Events]", 1)
                        style_str = "\n".join(cta_styles) + "\n\n"
                        ass_content = parts[0] + style_str + "[Events]" + parts[1]

                    ass_content = ass_content + "\n".join(cta_events) + "\n"

            with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
                f.write(ass_content)
                ass_path = f.name
            safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")

            box_added = False
            if hook_title and hook_title.strip() and title_bg != "none":
                hook_duration = compute_hook_duration(title_permanent, clip_duration)
                hook_x, hook_y, alignment = _hook_position(template)
                box = render_title_box_png(
                    _safe_upper(hook_title.strip()), font, 60, title_bg, title_bg_opacity,
                )
                if box:
                    box_path, box_w, box_h = box
                    ox, oy = overlay_xy(hook_x, hook_y, alignment, box_w, box_h)
                    extra_inputs.extend(["-i", str(box_path)])
                    box_idx = extra_inputs.count("-i")
                    fc += (
                        f";[reframed]split=2[rawv][capv0];"
                        f"[capv0][{box_idx}:v]overlay={ox}:{oy}:enable='between(t,0,{hook_duration:.3f})'[capv];"
                        f"[capv]ass={safe_ass}[capout]"
                    )
                    box_added = True
            if not box_added:
                fc += f";[reframed]split=2[rawv][capv];[capv]ass={safe_ass}[capout]"

            cmd = [
                "ffmpeg", "-y",
                # Cap decode + filtergraph threads to 1 each — without this,
                # ffmpeg auto-picks decode/filter thread counts matching the
                # host's vCPU count (4 on this worker). With MAX_CONCURRENT_ENCODES
                # clips running concurrently, that's N_clips × ~4 decode threads
                # PLUS 2 encoder threads (raw+captioned, each -threads 1 below)
                # all fighting over the same 4 physical cores — 4-5x thread
                # oversubscription that silently turned a ~30-60s encode into
                # 180-230s. Pinning every stage to 1 thread makes each ffmpeg
                # process's real CPU footprint match what MAX_CONCURRENT_ENCODES
                # actually budgeted for.
                "-threads", "1",
                "-filter_complex_threads", "1",
                "-i", str(input_path),
                *extra_inputs,
                "-filter_complex", fc,
                "-map", "[rawv]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-threads", "1",
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                str(raw_output_path),
                "-map", "[capout]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-threads", "1",
                "-c:a", "copy", "-movflags", "+faststart",
                str(captioned_output_path),
            ]
        elif cta_enabled:
            # No captions/hook_title but CTA is enabled — create an ASS file with just the CTA events
            mapped_font = FONT_OPTIONS.get(font, FONT_OPTIONS[DEFAULT_FONT])
            cta_ass = build_cta_ass(
                pages=cta_settings["pages"],
                clip_duration=clip_duration,
                color_hex=cta_settings.get("color", "#FFFFFF"),
                font_name=mapped_font,
            )
            if cta_ass:
                with tempfile.NamedTemporaryFile(suffix=".ass", mode="w", encoding="utf-8", delete=False) as f:
                    f.write(cta_ass)
                    ass_path = f.name
                safe_ass = ass_path.replace("\\", "/").replace(":", "\\:")
                fc += f";[reframed]split=2[rawv][capv];[capv]ass={safe_ass}[capout]"
                cmd = [
                    "ffmpeg", "-y",
                    "-threads", "1",
                    "-filter_complex_threads", "1",
                    "-i", str(input_path),
                    *extra_inputs,
                    "-filter_complex", fc,
                    "-map", "[rawv]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                    "-threads", "1",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                    str(raw_output_path),
                    "-map", "[capout]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                    "-threads", "1",
                    "-c:a", "copy", "-movflags", "+faststart",
                    str(captioned_output_path),
                ]
            else:
                cmd = [
                    "ffmpeg", "-y",
                    "-threads", "1",
                    "-filter_complex_threads", "1",
                    "-i", str(input_path),
                    *extra_inputs,
                    "-filter_complex", fc,
                    "-map", "[reframed]", "-map", "0:a?",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                    "-threads", "1",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                    str(raw_output_path),
                ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-threads", "1",
                "-filter_complex_threads", "1",
                "-i", str(input_path),
                *extra_inputs,
                "-filter_complex", fc,
                "-map", "[reframed]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-threads", "1",
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                str(raw_output_path),
            ]

        # job_semaphore (outer) caps how many of THIS job's own clips can be
        # inside the instance-wide pool at once — prevents one big job from
        # holding both global slots back-to-back while other users' jobs on
        # the same instance queue behind it entirely. See orchestrator.py
        # for how its size is chosen (adaptive: full speed when solo).
        async with _maybe(job_semaphore), _get_encode_semaphore():
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=360)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise RuntimeError(f"FFmpeg reframe+caption timed out [{input_path.name}]")

        if proc.returncode != 0:
            raise RuntimeError(
                f"FFmpeg reframe+caption failed [{input_path.name}]: "
                f"{stderr.decode(errors='ignore')[-400:]}"
            )

        if not (captions or hook_title or cta_enabled):
            shutil.copy(raw_output_path, captioned_output_path)

        for out in (raw_output_path, captioned_output_path):
            if not out.exists() or out.stat().st_size < 1024:
                raise RuntimeError(f"Reframe+caption output missing or too small: {out}")
    finally:
        if ass_path:
            Path(ass_path).unlink(missing_ok=True)
        if box_path:
            box_path.unlink(missing_ok=True)
        if wm_png_path:
            wm_png_path.unlink(missing_ok=True)


async def reframe_and_caption(
    input_path: Path,
    raw_output_path: Path,
    captioned_output_path: Path,
    template: str = "full_screen",
    bar_color: str = "#0d0d0d",
    zoom_beats: list[float] | None = None,
    aspect: str = "9:16",
    captions: list[Caption] | None = None,
    style: str = "minimal",
    color: str = "white_black",
    h_align: str = "center",
    v_align: str = "bottom",
    words_per_line: int = 3,
    caption_y: float | None = None,
    caption_scale: float = 1.0,
    hook_title: str | None = None,
    face_track: list[tuple[float, float, float]] | None = None,
    src_w: int = 0,
    src_h: int = 0,
    title_permanent: bool = False,
    clip_duration: float = 0.0,
    font: str = "default",
    title_color: str = DEFAULT_TITLE_TEXT_COLOR,
    title_bg: str = DEFAULT_TITLE_BG,
    title_bg_opacity: float = DEFAULT_TITLE_BG_OPACITY,
    job_semaphore: asyncio.Semaphore | None = None,
    is_marketer: bool = False,
    cta_settings: dict | None = None,
    gameplay_bg_path: Path | None = None,
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
        captions, style, color, h_align, v_align, words_per_line, caption_y:
                     passed to build_ass_content() when captions is non-empty
        hook_title:  AI-generated hook (ClipTimestamp.title), burned as a
                     boxed title card for the first HOOK_TITLE_DURATION
                     seconds (or the whole clip if `title_permanent`)
        title_permanent: keep the hook-title card on screen for the entire
                     clip duration instead of just the first few seconds.
        face_track, src_w, src_h:
                     dominant-face position track and source resolution from
                     face_tracker.compute_face_track() — drives the zoompan
                     pan target / speaker-box crop offset. Empty/None falls
                     back to centre-default framing.
        job_semaphore: optional per-job encode cap (see orchestrator.py) —
                     limits how many of THIS job's own clips can occupy the
                     instance-wide encode pool at once, so one large job
                     can't monopolize it and starve other users' jobs on
                     the same instance. None = no job-level limit (only the
                     global MAX_CONCURRENT_ENCODES semaphore applies).
        cta_settings: marketer-plan CTA settings dict (enabled, pages, color).
                     When enabled, the last 10 s of the clip shows the animated
                     CTA overlay. Pass None or omit to skip.

    Returns (raw_output_path, captioned_output_path) on success.
    """
    tpl = template if template in VALID_TEMPLATES else "full_screen"
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
            captions, style, color, h_align, v_align, words_per_line, caption_y, caption_scale,
            hook_title, face_track, src_w, src_h, title_permanent, clip_duration, font,
            title_color, title_bg, title_bg_opacity, job_semaphore, is_marketer,
            cta_settings=cta_settings,
            gameplay_bg_path=gameplay_bg_path,
        )
    except Exception as exc:
        logger.error(
            f"{input_path.name}: template '{tpl}' failed ({exc}); falling back to blur_bg"
        )
        try:
            await _encode_reframed_and_captioned(
                input_path, raw_output_path, captioned_output_path,
                "blur_bg", bar_color, None, width, height,
                captions, style, color, h_align, v_align, words_per_line, caption_y, caption_scale,
                hook_title, None, 0, 0, title_permanent, clip_duration, font,
                title_color, title_bg, title_bg_opacity, job_semaphore, False,
                cta_settings=None,
                gameplay_bg_path=None,
            )
        except Exception as exc2:
            raise RuntimeError(
                f"All reframe+caption attempts failed for {input_path.name}: {exc2}"
            ) from exc2

    return raw_output_path, captioned_output_path
