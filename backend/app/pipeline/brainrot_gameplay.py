"""
brainrot_gameplay.py — admin gameplay-source processing (Phase 3).

Takes one admin-uploaded raw gameplay recording and turns it into the
selectable ≤120s background clips the creator picks from:

  1. Reject the first 30s (recording start / unstable footage) when the
     source is long enough to spare it.
  2. Split the rest into ≤120s chunks (the creator's max clip length).
  3. Reframe each chunk to the 1080x1920 canvas with the SAME scale-cover +
     center-crop math as brainrot_composite._base_crop_filter (one look
     everywhere), drop audio (brainrot uses TTS + music, never the gameplay's
     own audio), and grab a poster thumbnail.
  4. Upload each clip + thumbnail to the brainrot bucket and insert a
     brainrot_gameplay_clips row.

Runs in-process as a background task (admin-only, infrequent — same
create_task pattern as the single-service brainrot stage). In-memory progress
is exposed via get_status() for the admin UI to poll. If this ever needs to
move off the API instance, dispatch it to the ffmpeg worker like the Test Lab
does — the processing function is already self-contained.
"""
import asyncio
import logging
import math
import tempfile
import uuid
from pathlib import Path

from app.db import supabase as db
from app.pipeline.uploader import upload_gameplay_clip, upload_gameplay_thumbnail

logger = logging.getLogger(__name__)

CANVAS_W, CANVAS_H = 1080, 1920
SKIP_HEAD_SECONDS = 30.0      # reject unstable intro footage when we can spare it
CHUNK_SECONDS = 120.0         # creator's max clip length
MIN_TRAILING_SECONDS = 5.0    # drop a final sliver shorter than this
MAX_CLIPS_PER_SOURCE = 30     # runaway guard
# 9:16 canvas for TikTok/Reels — lanczos for sharp downscale, unsharp to recover
# edge detail after the crop, especially important when source is 1080p → 1080x1920
_REFRAME = (
    f"scale={CANVAS_W}:{CANVAS_H}:force_original_aspect_ratio=increase:flags=lanczos,"
    f"crop={CANVAS_W}:{CANVAS_H},"
    f"unsharp=lx=3:ly=3:la=0.4:cx=3:cy=3:ca=0.0"
)

# source_id -> {status, total, done, error}
_status: dict[str, dict] = {}


def get_status(source_id: str) -> dict | None:
    return _status.get(source_id)


async def _ffprobe_duration(path: Path) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {err.decode()[-200:]}")
    return float(out.decode().strip())


def _plan_chunks(duration: float) -> list[tuple[float, float]]:
    """Return [(start, chunk_duration), ...] after skipping the head and
    splitting into ≤CHUNK_SECONDS pieces, dropping a tiny trailing sliver."""
    start0 = SKIP_HEAD_SECONDS if duration > (SKIP_HEAD_SECONDS + 10) else 0.0
    usable = duration - start0
    if usable < MIN_TRAILING_SECONDS:
        return [(0.0, min(duration, CHUNK_SECONDS))]  # too short to trim — use as-is
    n = min(MAX_CLIPS_PER_SOURCE, math.ceil(usable / CHUNK_SECONDS))
    chunks: list[tuple[float, float]] = []
    for i in range(n):
        s = start0 + i * CHUNK_SECONDS
        d = min(CHUNK_SECONDS, duration - s)
        if d >= MIN_TRAILING_SECONDS:
            chunks.append((s, d))
    return chunks


async def _run(cmd: list[str], what: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"{what} failed: {err.decode()[-400:]}")


async def process_gameplay_source(source_id: str, local_path: Path, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one source. Updates _status as it goes and
    the brainrot_gameplay_sources row at the end."""
    try:
        duration = await _ffprobe_duration(local_path)
        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        logger.info(f"[gameplay {source_id}] {duration:.1f}s → {len(chunks)} clip(s)")

        made = 0
        for start, dur in chunks:
            clip_id = uuid.uuid4().hex[:12]
            clip_path = tmp_dir / f"{clip_id}.mp4"
            thumb_path = tmp_dir / f"{clip_id}.jpg"

            await _run([
                "ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(local_path), "-t", f"{dur:.2f}",
                "-vf", f"{_REFRAME},fps=30", "-an",
                "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                "-profile:v", "high", "-level", "4.0",
                "-movflags", "+faststart",
                "-threads", "1", str(clip_path),
            ], "gameplay reframe")

            await _run([
                "ffmpeg", "-y", "-ss", f"{start + dur / 2:.2f}", "-i", str(local_path),
                "-vf", _REFRAME, "-frames:v", "1", str(thumb_path),
            ], "gameplay thumbnail")

            clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
            thumb_url = None
            try:
                thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
            except Exception as e:
                logger.warning(f"[gameplay {source_id}] thumbnail upload failed: {e}")

            await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, dur)
            made += 1
            _status[source_id]["done"] = made
            clip_path.unlink(missing_ok=True)
            thumb_path.unlink(missing_ok=True)

        if made == 0:
            raise RuntimeError("No usable clips produced from source")

        await db.set_gameplay_source_status(source_id, "ready")
        _status[source_id]["status"] = "ready"
        logger.info(f"[gameplay {source_id}] ready — {made} clip(s)")
    except Exception as e:
        logger.exception(f"[gameplay {source_id}] processing failed")
        _status[source_id] = {**_status.get(source_id, {"total": 0, "done": 0}), "status": "failed", "error": str(e)[:300]}
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass


async def process_gameplay_source_youtube(source_id: str, video_id: str, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one YouTube source via DASH segment extraction.
    Uses Proxy-Cheap for metadata/resolution and Proxy-Seller for DASH downloads.
    """
    from app.pipeline.stream import get_stream_urls_high_quality
    from app.pipeline.extractor import get_clip_via_dash, _get_source
    from app.core.proxy import get_proxyseller_proxy, get_proxy_url

    try:
        import yt_dlp
        loop = asyncio.get_running_loop()

        # ── Step 1: Get video duration via Proxy-Cheap ───────────
        cheap_proxy = get_proxy_url(session_id=source_id)

        def _get_duration_sync() -> float:
            opts: dict = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "skip_download": True,
                "socket_timeout": 30,
            }
            if cheap_proxy:
                opts["proxy"] = cheap_proxy
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(
                    f"https://www.youtube.com/watch?v={video_id}", download=False
                )
                return float(info.get("duration", 0) or 0)

        duration = await loop.run_in_executor(None, _get_duration_sync)
        if duration <= 0:
            raise RuntimeError(f"Could not determine video duration for {video_id}")

        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        logger.info(f"[gameplay-yt {source_id}] {duration:.1f}s → {len(chunks)} clip(s) (video_id={video_id})")

        # ── Step 2: Resolve initial DASH stream URL via Proxy-Cheap ───
        # Cap at exactly 1080p — output canvas is 1080×1920, so going higher
        # (1440p) just wastes bandwidth and decode time for no visible gain.
        try:
            init_video_url, _audio_ignored, init_user_agent = await get_stream_urls_high_quality(
                video_id, min_height=1080, max_height=1080, session_id=source_id,
                proxy_override=cheap_proxy,
            )
        except Exception as init_exc:
            logger.warning(
                f"[gameplay-yt {source_id}] Initial Proxy-Cheap HQ stream resolve failed: {init_exc}. "
                "Will fall through to per-chunk re-resolve attempts."
            )
            init_video_url = None
            init_user_agent = None

        made = 0
        made_lock = asyncio.Lock()
        sem = asyncio.Semaphore(4)

        async def _process_chunk(idx: int, start: float, dur: float):
            nonlocal made
            async with sem:
                clip_id = uuid.uuid4().hex[:12]
                
                # Unique temp directory per clip to isolate full-source fallbacks
                clip_dir = Path(tempfile.mkdtemp(dir=tmp_dir))
                
                clip_raw = clip_dir / f"{clip_id}_raw.mp4"
                clip_path = clip_dir / f"{clip_id}.mp4"
                thumb_path = clip_dir / f"{clip_id}.jpg"

                logger.info(
                    f"[gameplay-yt {source_id}] chunk {idx+1}/{len(chunks)}: "
                    f"{start:.0f}s–{start+dur:.0f}s → clip {clip_id}"
                )

                clip_raw_done = False

                # Attempt 1: cached URL (Proxy-Cheap resolve) + Proxy-Seller download
                if init_video_url:
                    ps_proxy_0 = get_proxyseller_proxy(session_id=source_id, attempt=0)
                    if ps_proxy_0:
                        try:
                            await get_clip_via_dash(
                                init_video_url, start, start + dur, clip_raw,
                                audio_url=None,
                                user_agent=init_user_agent,
                                session_id=source_id,
                                proxy_url=ps_proxy_0,
                            )
                            clip_raw_done = True
                            logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← DASH Proxy-Seller #0")
                        except Exception as exc1:
                            logger.warning(f"[gameplay-yt {source_id}] DASH attempt 1 failed: {exc1}")
                            clip_raw.unlink(missing_ok=True)

                # Attempt 2: re-resolve (Proxy-Cheap HQ) + download (Proxy-Seller #1)
                if not clip_raw_done:
                    ps_proxy_1 = get_proxyseller_proxy(session_id=source_id, attempt=1)
                    if ps_proxy_1:
                        try:
                            v2, _, ua2 = await get_stream_urls_high_quality(
                                video_id, min_height=1080, max_height=1080, session_id=source_id,
                                proxy_override=cheap_proxy,
                            )
                            await get_clip_via_dash(
                                v2, start, start + dur, clip_raw,
                                audio_url=None,
                                user_agent=ua2,
                                session_id=source_id,
                                proxy_url=ps_proxy_1,
                            )
                            clip_raw_done = True
                            logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← DASH Proxy-Seller #1 re-resolve")
                        except Exception as exc2:
                            logger.warning(f"[gameplay-yt {source_id}] DASH attempt 2 failed: {exc2}")
                            clip_raw.unlink(missing_ok=True)

                # Attempt 3: full-source fallback — download entire video via Proxy-Seller
                if not clip_raw_done:
                    logger.warning(
                        f"[gameplay-yt {source_id}] all DASH attempts failed for chunk {idx+1}; "
                        "falling back to full-source download via Proxy-Seller"
                    )
                    fallback_proxy = get_proxyseller_proxy(session_id=source_id, attempt=2)
                    fv, _, fua = await get_stream_urls_high_quality(
                        video_id, min_height=1080, max_height=1080, session_id=source_id,
                        proxy_override=cheap_proxy,
                    )
                    source_path = await _get_source(
                        fv, None, fua, video_id, clip_dir, proxy_url=fallback_proxy
                    )
                    await _run([
                        "ffmpeg", "-y",
                        "-ss", f"{start:.2f}", "-i", str(source_path),
                        "-t", f"{dur:.2f}",
                        "-c", "copy",
                        "-avoid_negative_ts", "make_zero",
                        "-movflags", "+faststart",
                        "-threads", "4",
                        str(clip_raw),
                    ], "gameplay full-source extract")
                    source_path.unlink(missing_ok=True)
                    clip_raw_done = True
                    logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← full-source fallback (Proxy-Seller)")

                # ── Reframe ──
                await _run([
                    "ffmpeg", "-y", "-i", str(clip_raw),
                    "-vf", f"{_REFRAME},fps=30",
                    "-an",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                    "-profile:v", "high", "-level", "4.0",
                    "-movflags", "+faststart",
                    "-threads", "4",
                    str(clip_path),
                ], "gameplay reframe")

                # ── Thumbnail ──────────────
                await _run([
                    "ffmpeg", "-y",
                    "-ss", f"{dur / 2:.2f}", "-i", str(clip_raw),
                    "-vf", _REFRAME, "-frames:v", "1",
                    "-threads", "4",
                    str(thumb_path),
                ], "gameplay thumbnail")

                # ── Upload ───────────────
                clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
                thumb_url = None
                try:
                    thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
                except Exception as thumb_exc:
                    logger.warning(f"[gameplay-yt {source_id}] thumbnail upload failed for clip {clip_id}: {thumb_exc}")

                await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, dur)
                
                async with made_lock:
                    made += 1
                    _status[source_id]["done"] = made
                logger.info(f"[gameplay-yt {source_id}] clip {made}/{len(chunks)} done → {clip_url}")

                clip_raw.unlink(missing_ok=True)
                clip_path.unlink(missing_ok=True)
                thumb_path.unlink(missing_ok=True)
                try:
                    clip_dir.rmdir()
                except OSError:
                    pass

        tasks = [_process_chunk(idx, start, dur) for idx, (start, dur) in enumerate(chunks)]
        await asyncio.gather(*tasks)

        if made == 0:
            raise RuntimeError("No usable clips produced from YouTube source")

        await db.set_gameplay_source_status(source_id, "ready")
        _status[source_id]["status"] = "ready"
        logger.info(f"[gameplay-yt {source_id}] ready — {made} clip(s) uploaded to brainrot bucket")

    except Exception as e:
        logger.exception(f"[gameplay-yt {source_id}] processing failed")
        _status[source_id] = {
            **_status.get(source_id, {"total": 0, "done": 0}),
            "status": "failed",
            "error": str(e)[:300],
        }
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass


async def run_gameplay_on_worker(source_id: str, video_id: str, category: str) -> None:
    """Wrapper for running the gameplay processing on the FFmpeg worker.
    Creates a temporary directory, runs the process, and cleans it up.
    This replaces running process_gameplay_source_youtube in-process via create_task.
    """
    logger.info(f"[gameplay {source_id}] starting on worker, video_id={video_id}, category={category}")
    try:
        with tempfile.TemporaryDirectory() as td:
            tmp_dir = Path(td)
            await process_gameplay_source_youtube(source_id, video_id, category, tmp_dir)
    except Exception as e:
        logger.exception(f"[gameplay {source_id}] worker wrapper failed")
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass
