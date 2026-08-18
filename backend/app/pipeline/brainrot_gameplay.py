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


async def _run(cmd: list[str], what: str, timeout: int = 1200, tag: str = "") -> None:
    """
    Run a subprocess and wait for it to finish.

    Streams stderr line-by-line to the logger instead of buffering the whole
    thing until exit — for a long ffmpeg encode this gives real-time progress
    visibility, and if the container gets killed mid-encode we've at least
    logged what stage it reached instead of losing the whole buffer.

    timeout: seconds to wait before killing the process (default 1200 = 20 min).
    This is intentionally generous — a `slow`-preset libx264 encode of a 120s
    1080p clip on a 4-vCPU machine takes ~2–5 min; 20 min is a safe ceiling
    that will still catch truly hung processes (stalled FFmpeg, broken pipe, etc.).
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
    )

    last_lines: list[str] = []   # keep tail for error reporting

    async def _pump_stderr() -> None:
        assert proc.stderr is not None
        line_count = 0
        while True:
            try:
                line = await proc.stderr.readline()
            except Exception:
                break
            if not line:
                break
            text = line.decode(errors="ignore").rstrip()
            if not text:
                continue
            last_lines.append(text)
            if len(last_lines) > 20:
                last_lines.pop(0)
            line_count += 1
            # Log every ~100th ffmpeg progress line (frame=N fps=…) so the
            # job stays visibly alive during a multi-minute encode without
            # spamming — plus anything containing 'error'/'warning' always.
            if "error" in text.lower() or "warning" in text.lower():
                logger.warning(f"[{tag or what}] ffmpeg: {text}")
            elif line_count % 100 == 0:
                logger.info(f"[{tag or what}] ffmpeg progress: {text}")

    pump_task = asyncio.create_task(_pump_stderr())
    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        pump_task.cancel()
        raise RuntimeError(
            f"{what} timed out after {timeout}s. Last stderr: "
            f"{' | '.join(last_lines[-5:])}"
        )
    finally:
        try:
            await asyncio.wait_for(pump_task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass

    if proc.returncode != 0:
        raise RuntimeError(
            f"{what} failed (rc={proc.returncode}): "
            f"{' | '.join(last_lines[-5:])}"
        )


async def process_gameplay_source(source_id: str, local_path: Path, category: str, tmp_dir: Path) -> None:
    """Full processing pipeline for one source.

    Strategy: split the raw source into ≤CHUNK_SECONDS keyframe-aligned
    segments in ONE fast `-c copy` pass, DELETE the source immediately (frees
    hundreds of MB of tmpfs — Cloud Run's /tmp is memory-backed and counts
    against the container limit), then reframe each small segment independently.
    Each reframe process now reads a ~50-100MB file instead of seeking through
    the full 200MB-2GB source, eliminating the concurrent-seek I/O contention
    and the OOM risk from keeping the whole source resident during encodes.
    """
    try:
        duration = await _ffprobe_duration(local_path)
        chunks = _plan_chunks(duration)
        _status[source_id] = {"status": "processing", "total": len(chunks), "done": 0, "error": None}
        try:
            src_size_mb = local_path.stat().st_size / (1024 * 1024)
            logger.info(f"[gameplay {source_id}] source={src_size_mb:.0f}MB, {duration:.1f}s → {len(chunks)} clip(s)")
        except Exception:
            logger.info(f"[gameplay {source_id}] {duration:.1f}s → {len(chunks)} clip(s)")

        # ── Step A: split source into pre-cut segments (stream copy, no re-encode) ──
        # One ffmpeg pass, near-zero CPU, near-zero memory. Each output is a
        # keyframe-aligned segment ~= CHUNK_SECONDS long. Seek offset (start0
        # from _plan_chunks) is honored via -ss before -i so the intro is
        # skipped without decoding it. Segments won't be perfectly frame-aligned
        # to _plan_chunks (they snap to the nearest keyframe) but that's fine —
        # each will be re-encoded to a clean 9:16 clip in step B and reflect
        # its own real duration, not the theoretical chunk boundary.
        seg_dir = tmp_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        seg_start = chunks[0][0] if chunks else 0.0
        logger.info(f"[gameplay {source_id}] splitting source into ≤{int(CHUNK_SECONDS)}s segments (skip head={seg_start:.0f}s)…")
        await _run([
            "ffmpeg", "-y",
            "-threads", "1",
            "-ss", f"{seg_start:.2f}", "-i", str(local_path),
            "-c", "copy",
            "-an",
            "-f", "segment",
            "-segment_time", f"{int(CHUNK_SECONDS)}",
            "-reset_timestamps", "1",
            "-map", "0:v:0",
            str(seg_dir / "seg_%03d.mp4"),
        ], "gameplay source split", timeout=1200, tag=f"gp:{source_id[:8]}:split")

        # Free the raw source immediately — hundreds of MB back to the OS
        # (matters a lot when /tmp is tmpfs and counted against RAM).
        try:
            local_path.unlink(missing_ok=True)
        except Exception as unlink_exc:
            logger.warning(f"[gameplay {source_id}] source cleanup failed: {unlink_exc}")

        segments = sorted(seg_dir.glob("seg_*.mp4"))
        if not segments:
            raise RuntimeError("Source split produced no segments")

        # Drop any final sliver that's under MIN_TRAILING_SECONDS — measure
        # each segment's actual duration since keyframe-boundary splits don't
        # always land exactly on CHUNK_SECONDS.
        seg_durations: list[float] = []
        for seg in segments:
            try:
                seg_dur = await _ffprobe_duration(seg)
            except Exception as probe_exc:
                logger.warning(f"[gameplay {source_id}] ffprobe failed on {seg.name}: {probe_exc}; skipping")
                seg.unlink(missing_ok=True)
                seg_dur = 0.0
            seg_durations.append(seg_dur)

        usable: list[tuple[Path, float]] = [
            (seg, sd) for seg, sd in zip(segments, seg_durations) if sd >= MIN_TRAILING_SECONDS
        ]
        for seg, sd in zip(segments, seg_durations):
            if sd < MIN_TRAILING_SECONDS:
                seg.unlink(missing_ok=True)

        if not usable:
            raise RuntimeError("No usable segments after split")

        # Runaway guard — same as _plan_chunks
        usable = usable[:MAX_CLIPS_PER_SOURCE]

        total = len(usable)
        _status[source_id]["total"] = total
        logger.info(f"[gameplay {source_id}] {total} usable segment(s) ready for reframe")

        # ── Step B: reframe each pre-cut segment to 9:16 (parallel, sem-capped) ──
        made = 0
        made_lock = asyncio.Lock()
        # sem=2: 2 concurrent 1080p libx264 encodes fit comfortably in 8Gi
        # RAM even with lanczos+unsharp (~500MB-1GB working set each) and use
        # both CPU pairs on the 4-vCPU worker (each ffmpeg is single-threaded
        # per the -threads flags below). sem=4 previously OOMed on longer
        # sources — silent SIGKILL with no Python-visible error.
        sem = asyncio.Semaphore(2)

        async def _process_segment(idx: int, seg_path: Path, seg_dur: float) -> None:
            nonlocal made
            async with sem:
                clip_id = uuid.uuid4().hex[:12]
                clip_path = tmp_dir / f"{clip_id}.mp4"
                thumb_path = tmp_dir / f"{clip_id}.jpg"
                logger.info(f"[gameplay {source_id}] segment {idx+1}/{total} start ({seg_dur:.0f}s) → {clip_id}")

                # -threads/-filter_complex_threads/-filter_threads all pinned to 1 —
                # `sem` alone provides real concurrency; letting each ffmpeg
                # auto-pick threads to host vCPU count oversubscribes the
                # 4-vCPU worker and silently balloons a ~1-2 min encode into
                # 20+ min (identical bug already diagnosed in extractor.py).
                # Reads a small pre-cut segment (~50-100MB) instead of seeking
                # through the huge source, so no I/O contention between parallel
                # workers either.
                await _run([
                    "ffmpeg", "-y",
                    "-threads", "1", "-filter_complex_threads", "1", "-filter_threads", "1",
                    "-i", str(seg_path),
                    "-vf", f"{_REFRAME},fps=30", "-an",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-profile:v", "high", "-level", "4.0",
                    "-movflags", "+faststart",
                    "-threads", "1", str(clip_path),
                ], "gameplay reframe", timeout=1200, tag=f"gp:{source_id[:8]}:{idx+1}")

                await _run([
                    "ffmpeg", "-y",
                    "-threads", "1", "-filter_threads", "1",
                    "-ss", f"{seg_dur / 2:.2f}", "-i", str(seg_path),
                    "-vf", _REFRAME, "-frames:v", "1", "-threads", "1", str(thumb_path),
                ], "gameplay thumbnail", timeout=120, tag=f"gp:{source_id[:8]}:{idx+1}")

                # Free the segment now that both outputs are produced
                seg_path.unlink(missing_ok=True)

                clip_url = await upload_gameplay_clip(clip_path, source_id, clip_id)
                thumb_url = None
                try:
                    thumb_url = await upload_gameplay_thumbnail(thumb_path, source_id, clip_id)
                except Exception as e:
                    logger.warning(f"[gameplay {source_id}] thumbnail upload failed for clip {clip_id}: {e}")

                await db.insert_gameplay_clip(source_id, category, clip_url, thumb_url, seg_dur)
                clip_path.unlink(missing_ok=True)
                thumb_path.unlink(missing_ok=True)

                async with made_lock:
                    made += 1
                    _status[source_id]["done"] = made
                logger.info(f"[gameplay {source_id}] clip {made}/{total} done → {clip_url}")

        tasks = [_process_segment(idx, seg, dur) for idx, (seg, dur) in enumerate(usable)]
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
                        "-threads", "1",
                        str(clip_raw),
                    ], "gameplay full-source extract", timeout=300)
                    source_path.unlink(missing_ok=True)
                    clip_raw_done = True
                    logger.info(f"[gameplay-yt {source_id}] clip {clip_id} ← full-source fallback (Proxy-Seller)")

                # ── Reframe — fast preset, 20 min ceiling. -threads 1 is
                # deliberate: `sem` already provides real concurrency (4
                # chunks in parallel); letting each ffmpeg process also grab
                # ~4 auto-picked threads oversubscribes the 4-vCPU worker up
                # to 16-way and silently turns a ~1-2 min encode into 20+ min
                # (identical bug already diagnosed in extractor.py) —────────
                await _run([
                    "ffmpeg", "-y", "-i", str(clip_raw),
                    "-vf", f"{_REFRAME},fps=30", "-an",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                    "-profile:v", "high", "-level", "4.0",
                    "-movflags", "+faststart",
                    "-threads", "1",
                    str(clip_path),
                ], "gameplay reframe", timeout=1200)

                # ── Thumbnail — single frame, fast ──────────────────────
                await _run([
                    "ffmpeg", "-y",
                    "-ss", f"{dur / 2:.2f}", "-i", str(clip_raw),
                    "-vf", _REFRAME, "-frames:v", "1",
                    "-threads", "1",
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
