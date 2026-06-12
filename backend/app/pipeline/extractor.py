"""
extractor.py — Steps 5 & 6 of the ShortClipr pipeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — Clip extraction
  FFmpeg HTTP range requests on CDN URL.
  Never downloads the full video — only exact bytes per clip.
  All clips extracted in parallel via asyncio.gather().

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — Reframe  (16:9 source → 9:16 / 16:9 / 1:1, default 9:16)

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
or extra models needed, just one ffmpeg subprocess per clip.

COLOUR PARAMETER  (bar_color):
  Hex string  "#RRGGBB"  e.g.  "#0d0d0d"  "#39ff14"  "#1a1a2e"
  Used for bars, frame colour, gradient base.
"""

import asyncio
import logging
from pathlib import Path

from app.core.config import get_settings
from app.core.proxy import get_proxy_url
from app.pipeline.ai_clipper import ClipTimestamp

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


async def extract_all_clips_parallel(
    stream_url: str,
    timestamps: list[ClipTimestamp],
    job_dir: Path,
    session_id: str | None = None,
    audio_url: str | None = None,
    user_agent: str | None = None,
    video_id: str | None = None,
) -> list[tuple[ClipTimestamp, Path]]:
    """
    Download the full source video once (direct from Cloud Run's own IP,
    falling back to proxy if the CDN URL is IP-bound and direct download
    gets HTTP 403, then to a yt-dlp end-to-end download), then extract all
    clips in parallel from that local file.

    audio_url: optional separate audio-only CDN URL, merged into the
    downloaded source when the video stream has no embedded audio
    (see get_stream_urls).
    video_id: enables the yt-dlp last-resort download when both ffmpeg
    attempts fail (the pre-minted CDN URL may be bound to an exit IP the
    proxy gateway no longer routes us through).
    """
    source_path = job_dir / "source.mp4"
    proxy_url = get_proxy_url(session_id)
    try:
        await download_source(stream_url, source_path, proxy_url=None, audio_url=audio_url, user_agent=user_agent)
    except Exception as exc:
        logger.warning(f"Direct source download failed ({exc}); retrying via proxy")
        try:
            await download_source(stream_url, source_path, proxy_url=proxy_url, audio_url=audio_url, user_agent=user_agent)
        except Exception as exc2:
            if not video_id:
                raise
            logger.warning(f"Proxied source download failed ({exc2}); falling back to yt-dlp download")
            await download_source_ytdlp(video_id, source_path, proxy_url=proxy_url)

    async def _one(i: int, ts: ClipTimestamp):
        out = job_dir / f"clip_{i:02d}_{int(ts.start)}s_raw.mp4"
        path = await extract_clip(source_path, ts.start, ts.end, out)
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

def _hex_to_ffmpeg(color: str) -> str:
    """'#RRGGBB' → '0xRRGGBB' for FFmpeg color parameters."""
    return "0x" + color.lstrip("#").upper()


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _darken(color: str, factor: float = 0.3) -> str:
    r, g, b = _hex_to_rgb(color)
    return f"0x{int(r*factor):02X}{int(g*factor):02X}{int(b*factor):02X}"


def _ken_burns_filter(input_label: str, out_label: str, width: int, height: int) -> str:
    """FFmpeg zoompan for subtle 1.0× → 1.08× push-in."""
    return (
        f"[{input_label}]zoompan="
        f"z='min(zoom+0.0010,1.08)':"
        f"x='iw/2-(iw/zoom/2)':"
        f"y='ih/2-(ih/zoom/2)':"
        f"d=1:s={width}x{height}:fps=30"
        f"[{out_label}]"
    )


def _even_round(x: float) -> int:
    """Round to the nearest even integer (libx264 requires even dimensions)."""
    n = int(round(x))
    return n if n % 2 == 0 else n + 1


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

# ── Template 1: blur_bg ────────────────────────────────────────

async def _template_blur_bg(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
    blur_radius: int = 25,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 2: zoom_blur ─────────────────────────────────────

async def _template_zoom_blur(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 3: glass ─────────────────────────────────────────

async def _template_glass(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 4: colour_bars ───────────────────────────────────

async def _template_colour_bars(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 5: gradient ──────────────────────────────────────

async def _template_gradient(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 6: cinema ────────────────────────────────────────

async def _template_cinema(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
    """Classic cinematic black bars — letterbox portrait."""
    return await _template_colour_bars(
        input_path, output_path, "#000000", ken_burns, width, height
    )


# ── Template 7: neon_frame ────────────────────────────────────

async def _template_neon_frame(
    input_path: Path,
    output_path: Path,
    bar_color: str,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 8: split_screen ──────────────────────────────────

async def _template_split_screen(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
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
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 9: screenshare ──────────────────────────────────

async def _template_screenshare(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
    """
    Tutorial / screenshare layout:
      Top half    — full-width letterboxed video (shows entire frame)
      Bottom half — crop of the source filling the bottom half (shows centre / speaker)
    """
    half_h  = height // 2
    inner_h = _even_round(half_h * 9 / 16)
    fc = (
        f"[0:v]scale={width}:{inner_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{half_h}:(ow-iw)/2:(oh-ih)/2:black[top];"
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{half_h}:0:(in_h-{half_h})/2[bot];"
        "[top][bot]vstack[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
    else:
        fc = fc.replace("[pre]", "[out]")
    await _run_ffmpeg_complex(input_path, output_path, fc)
    return output_path


# ── Template 10: gameplay ─────────────────────────────────────

async def _template_gameplay(
    input_path: Path,
    output_path: Path,
    ken_burns: bool,
    width: int,
    height: int,
) -> Path:
    """
    Gaming / podcast layout:
      Top 30 %    — portrait crop  (webcam / speaker)
      Bottom 70 % — full-width     (gameplay / slides)
    """
    top_h = _even_round(height * 0.3)
    bot_h = height - top_h
    fc = (
        f"[0:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{top_h}:0:(in_h-{top_h})/2[top];"
        f"[0:v]scale={width}:{bot_h}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{bot_h}:(ow-iw)/2:(oh-ih)/2:black[bot];"
        "[top][bot]vstack[pre]"
    )
    if ken_burns:
        fc += ";" + _ken_burns_filter("pre", "out", width, height)
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
    template:   str  = "blur_bg",
    bar_color:  str  = "#0d0d0d",
    ken_burns:  bool = True,
    aspect:     str  = "9:16",
) -> Path:
    """
    Reframe a 16:9 source clip into the chosen aspect ratio using the
    selected template.

    Args:
        input_path:  raw extracted clip (any res, 16:9)
        output_path: where to write the reframed mp4
        template:    one of VALID_TEMPLATES
        bar_color:   hex colour for bars / frame / gradient  (#RRGGBB)
        ken_burns:   add subtle 1.0× → 1.08× zoom push-in
        aspect:      one of VALID_ASPECTS — "9:16" (default), "16:9", "1:1"

    Returns output_path on success.
    """
    # Normalise / validate template + aspect
    tpl = template if template in VALID_TEMPLATES else "blur_bg"
    asp = aspect if aspect in VALID_ASPECTS else "9:16"
    width, height = ASPECT_DIMENSIONS[asp]

    logger.info(
        f"{input_path.name} → template={tpl}  aspect={asp} ({width}x{height})  "
        f"bar={bar_color}  ken_burns={ken_burns}"
    )

    try:
        if tpl == "blur_bg":
            return await _template_blur_bg(input_path, output_path, ken_burns, width, height)
        elif tpl == "zoom_blur":
            return await _template_zoom_blur(input_path, output_path, ken_burns, width, height)
        elif tpl == "glass":
            return await _template_glass(input_path, output_path, ken_burns, width, height)
        elif tpl == "color_bars":
            return await _template_colour_bars(input_path, output_path, bar_color, ken_burns, width, height)
        elif tpl == "gradient":
            return await _template_gradient(input_path, output_path, bar_color, ken_burns, width, height)
        elif tpl == "cinema":
            return await _template_cinema(input_path, output_path, ken_burns, width, height)
        elif tpl == "neon_frame":
            return await _template_neon_frame(input_path, output_path, bar_color, ken_burns, width, height)
        elif tpl == "split_screen":
            return await _template_split_screen(input_path, output_path, ken_burns, width, height)
        elif tpl == "screenshare":
            return await _template_screenshare(input_path, output_path, ken_burns, width, height)
        elif tpl == "gameplay":
            return await _template_gameplay(input_path, output_path, ken_burns, width, height)

    except Exception as exc:
        logger.error(
            f"{input_path.name}: template '{tpl}' failed ({exc}); "
            "falling back to blur_bg"
        )
        try:
            return await _template_blur_bg(input_path, output_path, False, width, height)
        except Exception as exc2:
            raise RuntimeError(
                f"All reframe attempts failed for {input_path.name}: {exc2}"
            ) from exc2

    raise RuntimeError(f"Unknown template: {tpl}")
