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
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("ffprobe timed out after 60s")
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


async def _run(cmd: list[str], what: str, timeout: int = 1200) -> None:
    """
    Run a subprocess and wait for it to finish.

    timeout: seconds to wait before killing the process (default 1200 = 20 min).
    This is intentionally generous — a `slow`-preset libx264 encode of a 120s
    1080p clip on a 4-vCPU machine takes ~2–5 min; 20 min is a safe ceiling
    that will still catch truly hung processes (stalled FFmpeg, broken pipe, etc.).
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()  # drain buffers
        raise RuntimeError(f"{what} timed out after {timeout}s")
    if proc.returncode != 0:
        raise RuntimeError(f"{what} failed: {err.decode()[-400:]}")


async def process_gameplay_source(source_id: str, local_path: Path, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one source. Updates _status as it goes and
    the brainrot_gameplay_sources row at the end.

    Chunks are processed concurrently (semaphore-capped), same as the YouTube
    path in process_gameplay_source_youtube — a sequential, single-threaded
    loop here left 3 of the worker's 4 vCPUs idle for the whole job, making a
    5-6 clip source take 15-25+ minutes with no progress logs in between,
    which reads as a hang even though nothing was actually stuck.
    """
    try:
        duration = await _ffprobe_duration(local_path)
        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        logger.info(f"[gameplay {source_id}] {duration:.1f}s → {len(chunks)} clip(s)")

        made = 0
        made_lock = asyncio.Lock()
        sem = asyncio.Semaphore(4)

        async def _process_chunk(idx: int, start: float, dur: float) -> None:
            nonlocal made
            async with sem:
                clip_id = uuid.uuid4().hex[:12]
                clip_path = tmp_dir / f"{clip_id}.mp4"
                thumb_path = tmp_dir / f"{clip_id}.jpg"

                # fast preset: much quicker than slow, acceptable quality for backgrounds
                await _run([
                    "ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(local_path), "-t", f"{dur:.2f}",
                    "-vf", f"{_REFRAME},fps=30", "-an",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-profile:v", "high", "-level", "4.0",
                    "-movflags", "+faststart",
                    "-threads", "4", str(clip_path),
                ], "gameplay reframe", timeout=1200)

                await _run([
                    "ffmpeg", "-y", "-ss", f"{start + dur / 2:.2f}", "-i", str(local_path),
                    "-vf", _REFRAME, "-frames:v", "1", str(thumb_path),
                ], "gameplay thumbnail", timeout=120)

                clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
                thumb_url = None
                try:
                    thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
                except Exception as e:
                    logger.warning(f"[gameplay {source_id}] thumbnail upload failed for clip {clip_id}: {e}")

                await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, dur)
                clip_path.unlink(missing_ok=True)
                thumb_path.unlink(missing_ok=True)

                async with made_lock:
                    made += 1
                    _status[source_id]["done"] = made
                logger.info(f"[gameplay {source_id}] clip {made}/{len(chunks)} done → {clip_url}")

        tasks = [_process_chunk(idx, start, dur) for idx, (start, dur) in enumerate(chunks)]
        await asyncio.gather(*tasks)

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
                "socket_timeout": 60,   # generous — proxy round-trips can be slow
                "retries": 3,
                "fragment_retries": 3,
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
                # Last coherent (url, user_agent, proxy) triple actually attempted —
                # the full-source fallback reuses this instead of re-resolving via
                # one proxy and downloading via another, which reproduces the same
                # IP-mismatch 403 a 4th time. Mirrors ffmpeg_stage.py's
                # _dash_download_with_refresh: resolve-cheap + download-Seller#0 is
                # the intentional fast path (only fails when the URL IS IP-bound);
                # every fallback tier after that keeps resolve-proxy and
                # download-proxy IDENTICAL.
                last_url, last_ua, last_proxy = init_video_url, init_user_agent, cheap_proxy

                # Attempt 1: cached URL (Proxy-Cheap resolve) + Proxy-Seller pool IP #0
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

                # Attempt 2: re-resolve + download, both via Proxy-Seller pool IP #1 (matched)
                if not clip_raw_done:
                    ps_proxy_1 = get_proxyseller_proxy(session_id=source_id, attempt=1)
                    if ps_proxy_1:
                        try:
                            v2, _, ua2 = await get_stream_urls_high_quality(
                                video_id, min_height=1080, max_height=1080, session_id=source_id,
                                proxy_override=ps_proxy_1,
                            )
                            last_url, last_ua, last_proxy = v2, ua2, ps_proxy_1
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

                # Attempt 3: re-resolve + download, both via Proxy-Cheap (matched) —
                # Proxy-Seller uses dedicated static IPs (a retry there wouldn't
                # change anything if both are blocklisted); proxy-cheap is a
                # rotating gateway, so this tier is worth trying as a last resort.
                if not clip_raw_done:
                    pc_proxy = get_proxy_url(session_id=f"{source_id}-retry")
                    if pc_proxy:
                        try:
                            v3, _, ua3 = await get_stream_urls_high_quality(
                                video_id, min_height=1080, max_height=1080, session_id=source_id,
                                proxy_override=pc_proxy,
                            )
                            last_url, last_ua, last_proxy = v3, ua3, pc_proxy
                            await get_clip_via_dash(
                                v3, start, start + dur, clip_raw,
                                audio_url=None,
                                user_agent=ua3,
                                session_id=source_id,
                                proxy_url=pc_proxy,
                            )
                            clip_raw_done = True
                            logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← DASH Proxy-Cheap re-resolve")
                        except Exception as exc3:
                            logger.warning(f"[gameplay-yt {source_id}] DASH attempt 3 failed: {exc3}")
                            clip_raw.unlink(missing_ok=True)

                # Attempt 4: full-source fallback — reuse the last coherent
                # (url, proxy) pairing rather than re-resolving via a mismatched proxy
                if not clip_raw_done:
                    logger.warning(
                        f"[gameplay-yt {source_id}] all DASH attempts failed for chunk {idx+1}; "
                        "falling back to full-source download"
                    )
                    if last_url is None:
                        # Every resolve above failed too (e.g. Proxy-Seller pool
                        # exhausted) — last resort: resolve+download both via
                        # Proxy-Cheap so the pairing still matches.
                        last_url, _, last_ua = await get_stream_urls_high_quality(
                            video_id, min_height=1080, max_height=1080, session_id=source_id,
                            proxy_override=cheap_proxy,
                        )
                        last_proxy = cheap_proxy
                    source_path = await _get_source(
                        last_url, None, last_ua, video_id, clip_dir, proxy_url=last_proxy
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
                    ], "gameplay full-source extract", timeout=300)
                    source_path.unlink(missing_ok=True)
                    clip_raw_done = True
                    logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← full-source fallback (Proxy-Seller)")

                # ── Reframe — fast preset, 20 min ceiling —────────────────
                await _run([
                    "ffmpeg", "-y", "-i", str(clip_raw),
                    "-vf", f"{_REFRAME},fps=30", "-an",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-profile:v", "high", "-level", "4.0",
                    "-movflags", "+faststart",
                    "-threads", "4",
                    str(clip_path),
                ], "gameplay reframe", timeout=1200)

                # ── Thumbnail — single frame, fast ──────────────────────
                await _run([
                    "ffmpeg", "-y",
                    "-ss", f"{dur / 2:.2f}", "-i", str(clip_raw),
                    "-vf", _REFRAME, "-frames:v", "1",
                    "-threads", "4",
                    str(thumb_path),
                ], "gameplay thumbnail", timeout=120)

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


async def _download_gcs_file(gcs_path: str, dest: Path) -> Path:
    """Download a gs://bucket/object URI to a local file."""
    if not gcs_path.startswith("gs://"):
        raise RuntimeError(f"Not a GCS URI: {gcs_path}")
    bucket_name, _, object_name = gcs_path[len("gs://"):].partition("/")
    if not bucket_name or not object_name:
        raise RuntimeError(f"Malformed GCS URI: {gcs_path}")

    def _sync_download() -> None:
        from app.pipeline.uploader import _get_gcs_client
        client = _get_gcs_client()
        blob = client.bucket(bucket_name).blob(object_name)
        blob.download_to_filename(str(dest))

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _sync_download)
    return dest


async def run_gameplay_on_worker(
    source_id: str,
    category: str,
    video_id: str | None = None,
    gcs_path: str | None = None,
) -> None:
    """Wrapper for running the gameplay processing on the FFmpeg worker.
    Creates a temporary directory, runs the process, and cleans it up.

    Dispatches to the YouTube DASH path when video_id is set, or downloads the
    uploaded/GCS file and runs the local-file reframe path when gcs_path is
    set — the two source types are mutually exclusive (see
    process_one_gameplay_job in the watcher).
    """
    logger.info(
        f"[gameplay {source_id}] starting on worker, video_id={video_id}, "
        f"gcs_path={gcs_path}, category={category}"
    )
    try:
        with tempfile.TemporaryDirectory() as td:
            tmp_dir = Path(td)
            if video_id:
                await process_gameplay_source_youtube(source_id, video_id, category, tmp_dir)
            elif gcs_path:
                ext = Path(gcs_path).suffix or ".mp4"
                local_path = tmp_dir / f"source{ext}"
                await _download_gcs_file(gcs_path, local_path)
                await process_gameplay_source(source_id, local_path, category, tmp_dir)
            else:
                raise RuntimeError("Gameplay source has neither video_id nor gcs_path")
    except Exception as e:
        logger.exception(f"[gameplay {source_id}] worker wrapper failed")
        try:
            await db.set_gameplay_source_status(source_id, "failed", str(e)[:500])
        except Exception:
            pass
