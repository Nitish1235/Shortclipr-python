"""
ffmpeg_stage.py — FFmpeg-side pipeline steps for the split-worker architecture.

Runs on the "FFmpeg Worker" Cloud Run service (4 vCPU + 8GB, 1 concurrent — Cloud Run scales horizontally):
  1. Read `ffmpeg_payload` from the jobs table
  2. Re-resolve stream URL if the cached one expired (fallback safety net)
  3. DASH parallel download all clips (~5-8 MB each)
  4. Per-clip pipeline (concurrent, capped by MAX_CONCURRENT_ENCODES):
     trim → silence + face → reframe + captions → thumbnail → GCS upload → insert clip row
  5. Refund unused credits (reserved N, delivered M, refund N-M)
  6. Complete the job

Single-service mode: orchestrator.py calls run_ffmpeg_stage() right after
run_api_stage() in-process — reads the same ffmpeg_payload from the DB
row that api_stage.py just wrote there.

The stage is idempotent-ish: safe to retry from scratch if the FFmpeg
worker crashes mid-encode. Uploaded clips that landed in GCS + the clips
table before the crash stay; on retry they get re-inserted with new
clip_ids (no dedup because the pre-crash rows are still valid finished
clips — the user just gets a slightly bigger set on the rare crash-retry
case, which is better than losing clips).
"""

import asyncio
import logging
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from app.core.config import get_settings
from app.core.email import send_email
from app.core.email_templates import clips_ready_email_html
from app.core.proxy import get_proxyseller_proxy, url_is_ip_bound
from app.db import supabase as db
from app.pipeline.ai_clipper import ClipTimestamp
from app.pipeline.captions import (
    captions_to_dict, clamp_captions_to_silence, detect_silences, get_clip_captions,
)
from app.pipeline.downloader import download_all_clips_parallel
from app.pipeline.extractor import (
    _compute_zoom_beats, _get_source, extract_clip, probe_clip_start_offset, reframe_and_caption,
)
from app.pipeline.face_tracker import compute_face_track
from app.pipeline.stream import get_stream_urls
from app.pipeline.uploader import (
    cleanup_job_files, generate_thumbnail,
    upload_clip, upload_raw_clip, upload_thumbnail,
)

logger = logging.getLogger(__name__)
settings = get_settings()

FFMPEG_STAGE_TIMEOUT_SECONDS = 1500   # 25 minutes — kill hung encodes

# Adaptive per-job encode cap (same rule as the pre-split orchestrator):
# solo job on this instance → full global pool; 2+ jobs → cap each to 1 to
# prevent one big job from starving another. Plain int is safe here (single-
# threaded asyncio event loop).
_ACTIVE_JOBS_ON_INSTANCE = 0


@asynccontextmanager
async def _step(job_id: str, name: str):
    """Timing + logging wrapper for a pipeline step — same shape as orchestrator's."""
    t0 = time.monotonic()
    logger.info(f"[{job_id}] -> {name} started")
    try:
        yield
    except Exception as e:
        logger.error(f"[{job_id}] x {name} FAILED after {time.monotonic() - t0:.2f}s: {e}")
        raise
    else:
        logger.info(f"[{job_id}] OK {name} completed in {time.monotonic() - t0:.2f}s")


async def run_ffmpeg_stage(job_id: str) -> None:
    """
    Top-level entrypoint for the FFmpeg worker. Reads ffmpeg_payload from
    the jobs table (written by api_stage.py) and runs the encoding pipeline.
    """
    try:
        await asyncio.wait_for(
            _execute_ffmpeg_stage(job_id),
            timeout=FFMPEG_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] FFmpeg stage timed out after {FFMPEG_STAGE_TIMEOUT_SECONDS}s")
        await _fail_and_refund_from_db(job_id, _friendly_ffmpeg_error("timed out"))
    except Exception as exc:
        logger.exception(f"[{job_id}] FFmpeg stage failed: {exc}")
        await _fail_and_refund_from_db(job_id, _friendly_ffmpeg_error(str(exc)))


def _friendly_ffmpeg_error(raw: str) -> str:
    """User-facing mapper for FFmpeg-stage failures (mirror of _friendly_api_error)."""
    r = (raw or "").lower()

    if "timed out" in r or "timeout" in r:
        return "Video encoding took too long. Please try again — this can happen with unusually long videos."
    if "403" in r and ("forbidden" in r or "cdn" in r or "stream" in r):
        return "YouTube's video CDN rejected our request. Please retry — the video URL likely expired mid-processing."
    if "storage" in r or "upload" in r or "gcs" in r or "s3" in r:
        return "Failed to upload finished clips. Please try again."
    if "cancelled" in r:
        return "Job was cancelled."
    if "all clip extractions failed" in r or "no clips" in r:
        return "Could not extract any clips from this video. It may be corrupted or in an unsupported format."
    if "ffmpeg" in r or "encode" in r or "reframe" in r:
        return "Video encoding failed. Please try again, or contact support if it keeps happening."

    first_line = raw.strip().split("\n", 1)[0][:200] if raw else ""
    return f"Something went wrong while encoding. {first_line}".rstrip()


async def _execute_ffmpeg_stage(job_id: str) -> None:
    row = await db.get_job_with_ffmpeg_payload(job_id)
    if not row:
        raise RuntimeError(f"Job {job_id} not found")
    payload = row.get("ffmpeg_payload")
    if not payload:
        raise RuntimeError(f"Job {job_id} has no ffmpeg_payload — API stage did not complete")

    # Parse payload
    user_id     = str(payload["user_id"])

    user_info = await db.get_user(user_id)
    is_marketer = bool(user_info and user_info.get("plan") == "marketer")
    cta_settings = user_info.get("cta_settings") if user_info else None
    if not is_marketer:
        cta_settings = None  # Only marketer plan gets CTA

    youtube_url = row["youtube_url"]
    options     = payload["options"]
    video_id    = payload["video_id"]
    metadata    = payload["video_metadata"]
    transcript  = payload["transcript"]
    stream_url  = payload.get("stream_url", "")
    audio_url   = payload.get("audio_url", "")
    user_agent  = payload.get("user_agent", "")
    timestamps  = [
        ClipTimestamp(
            start           = t["start"],
            end             = t["end"],
            title           = t["title"],
            viral_score     = t["viral_score"],
            reason          = t["reason"],
            caption_preview = t["caption_preview"],
            title_emoji     = t.get("title_emoji", ""),
        )
        for t in payload["timestamps"]
    ]

    # Options unpacking (mirror orchestrator.py)
    clip_style       = options.get("style",           "minimal")
    quality          = options.get("quality",         "1080p")
    color_combo      = options.get("color",           "white_black")
    h_align          = options.get("h_align",         "center")
    v_align          = options.get("v_align",         "bottom")
    words_per_line   = options.get("words_per_line",  3)
    caption_y        = options.get("caption_y")
    caption_scale    = options.get("caption_scale", 1.0)
    short_template   = options.get("short_template",  "full_screen")
    title_permanent  = options.get("title_permanent",  False)
    hook_title_enabled = options.get("hook_title_enabled", True)
    font             = options.get("font",            "default")
    title_color      = options.get("title_color",     "white")
    title_bg         = options.get("title_bg",        "none")
    title_bg_opacity = options.get("title_bg_opacity", 0.55)
    bar_color        = options.get("bar_color",       "#0d0d0d")
    aspect           = options.get("aspect",          "9:16")
    gameplay_clip_id = options.get("gameplay_clip_id", None)

    reserved_credits       = options.get("reserved_credits",       0)
    video_minutes_reserved = options.get("video_minutes_reserved", 0.0)

    success = False
    job_dir = Path(tempfile.mkdtemp(prefix=f"sc_{job_id[:8]}_"))

    await db.set_job_ffmpeg_processing(job_id)
    await db.update_job_progress(job_id, 25, "Encoding stage starting...")

    global _ACTIVE_JOBS_ON_INSTANCE
    _ACTIVE_JOBS_ON_INSTANCE += 1

    try:
        # ── STEP 6: Download all clips in parallel via DASH ────────
        # stream_url from ffmpeg_payload — the API stage cached it. Ranged
        # media URLs are short-lived (YouTube signs them for ~4-6 hrs) but
        # normally still valid a few minutes later when the FFmpeg stage
        # picks up. If they've expired we get an HTTP 403 and re-resolve.
        clip_ranges     = [(ts.start, ts.end) for ts in timestamps]
        source_path     = None
        raw_clip_results = None

        gameplay_bg_path = None
        if gameplay_clip_id and settings.gameplay_gcs_bucket_name:
            async with _step(job_id, "downloading gameplay bg"):
                gameplay_bg_path = job_dir / "gameplay_bg.mp4"
                def _dl_gameplay():
                    from google.cloud import storage
                    bucket = storage.Client().bucket(settings.gameplay_gcs_bucket_name)
                    blob = bucket.blob(f"gameplay_clips/{gameplay_clip_id}.mp4")
                    if blob.exists():
                        blob.download_to_filename(str(gameplay_bg_path))
                    else:
                        raise ValueError(f"Gameplay clip not found: {gameplay_clip_id}")
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, _dl_gameplay)

        try:
            async with _step(job_id, f"DASH parallel download ({len(timestamps)} clips)"):
                raw_clip_results = await _dash_download_with_refresh(
                    video_id, job_id, stream_url, audio_url, user_agent,
                    clip_ranges, job_dir, quality,
                )
        except Exception as dash_exc:
            logger.warning(f"[{job_id}] DASH batch failed ({dash_exc}); falling back to full source")
            await db.update_job_progress(job_id, 25, "Downloading source video (fallback)...")

            if isinstance(dash_exc, DashDownloadFailed):
                # Reuse the LAST coherent (proxy, URL) pairing that
                # _dash_download_with_refresh actually verified was
                # resolved-and-downloaded-through the same exit IP — no
                # re-resolution needed, and critically, no proxy mismatch.
                stream_url, audio_url, user_agent = dash_exc.stream_url, dash_exc.audio_url, dash_exc.user_agent
                fallback_proxy = dash_exc.proxy_url
            else:
                # Defensive path for anything that escaped
                # _dash_download_with_refresh's own try/except (shouldn't
                # normally happen). Proxy-Seller ISP only — proxy-cheap's 2GB
                # bandwidth cap must never absorb full-video byte downloads
                # (that's what exhausted it and took down the whole proxy-cheap
                # gateway, including unrelated metadata/transcript calls, on
                # 2026-08-29). Resolve+download coherently through the SAME
                # Proxy-Seller IP.
                fallback_proxy = get_proxyseller_proxy(job_id, attempt=0)
                stream_url, audio_url, user_agent = await get_stream_urls(
                    video_id, quality=quality, session_id=job_id,
                    proxy_override=fallback_proxy,
                )

            async with _step(job_id, "full-source fallback download"):
                source_path = await _get_source(
                    stream_url, audio_url, user_agent, video_id, job_dir, proxy_url=fallback_proxy
                )

        await db.update_job_progress(job_id, 33, f"Encoding {len(timestamps)} clips...")

        total      = len(timestamps)
        clips_done = 0

        # Adaptive per-job encode cap — split the vCPU budget across whatever
        # jobs are on this instance. With Cloud Run concurrency=1 this is
        # always MAX (one job owns the whole instance → 4 encoders × 1 thread
        # = 4 vCPUs). The // fallback stays defensive in case someone bumps
        # Cloud Run concurrency later — no thrashing then either.
        job_cap = max(1, settings.MAX_CONCURRENT_ENCODES // max(1, _ACTIVE_JOBS_ON_INSTANCE))
        job_encode_semaphore = asyncio.Semaphore(job_cap)

        async def _process_one_clip(i: int, ts: ClipTimestamp) -> dict:
            nonlocal clips_done

            raw_clip_path = job_dir / f"clip_{i:02d}_trimmed.mp4"
            caption_base: float = ts.start   # see orchestrator.py for full explanation

            async with _step(job_id, f"clip {i} trim"):
                if raw_clip_results is not None:
                    raw_path_dash, actual_start_t = raw_clip_results[i]
                    ss_offset = max(0.0, ts.start - actual_start_t)
                    duration  = ts.end - ts.start
                    trim_cmd = [
                        "ffmpeg", "-y",
                        "-ss", str(ss_offset), "-i", str(raw_path_dash),
                        "-t", str(duration), "-c", "copy",
                        "-avoid_negative_ts", "make_zero",
                        "-movflags", "+faststart",
                        str(raw_clip_path),
                    ]
                    proc = await asyncio.create_subprocess_exec(
                        *trim_cmd,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    _, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
                    if proc.returncode != 0:
                        raise RuntimeError(f"DASH trim failed: {stderr.decode(errors='ignore')[-300:]}")
                    raw_path_dash.unlink(missing_ok=True)
                    kf_offset = await probe_clip_start_offset(raw_clip_path, duration)
                    caption_base = ts.start - kf_offset
                else:
                    raw_clip_path = await extract_clip(source_path, ts.start, ts.end, raw_clip_path)
                    kf_offset = await probe_clip_start_offset(raw_clip_path, ts.end - ts.start)
                    caption_base = ts.start - kf_offset

            clip_id = str(uuid.uuid4())

            clip_data = {
                "clip_id":            clip_id,
                "job_id":             job_id,
                "user_id":            user_id,
                "video_url":          "",
                "thumbnail_url":      "",
                "raw_video_url":      "",
                "clip_ready":         False,
                "duration":           ts.duration,
                "start_time":         ts.start,
                "end_time":           ts.end,
                "transcript_snippet": ts.caption_preview,
                "viral_score":        ts.viral_score,
                "top_title":          ts.title_with_emoji,
                "bottom_tag":         f"#{ts.title.lower().replace(' ', '')}",
                "caption_style":      clip_style,
                "ai_reason":          ts.reason,
                "captions_data":      [],
                "editor_config":      {},
            }
            await db.insert_clip(clip_data)

            try:
                job_check = await db.get_job(job_id)
                if job_check and job_check.get("status") == "cancelled":
                    raise RuntimeError(f"Job {job_id} cancelled")

                clip_actual_dur = ts.end - caption_base
                captions        = get_clip_captions(transcript, caption_base, ts.end)
                async with _step(job_id, f"clip {i} silence+face detection"):
                    silences, (src_w, src_h, face_track) = await asyncio.gather(
                        detect_silences(raw_clip_path),
                        compute_face_track(raw_clip_path, clip_actual_dur),
                    )
                if silences:
                    captions = clamp_captions_to_silence(captions, silences)
                zoom_beats = _compute_zoom_beats(captions, clip_actual_dur)

                async with _step(job_id, f"clip {i} reframe+caption encode"):
                    reframed_path, captioned_path = await reframe_and_caption(
                        raw_clip_path,
                        job_dir / f"clip_{i:02d}_vertical.mp4",
                        job_dir / f"clip_{i:02d}_captioned.mp4",
                        template=short_template, bar_color=bar_color,
                        zoom_beats=zoom_beats, aspect=aspect,
                        captions=captions, style=clip_style, color=color_combo,
                        h_align=h_align, v_align=v_align, words_per_line=words_per_line,
                        caption_y=caption_y, caption_scale=caption_scale,
                        hook_title=(ts.title_with_emoji if hook_title_enabled else None),
                        face_track=face_track, src_w=src_w, src_h=src_h,
                        title_permanent=title_permanent, clip_duration=clip_actual_dur,
                        font=font, title_color=title_color, title_bg=title_bg,
                        title_bg_opacity=title_bg_opacity,
                        job_semaphore=job_encode_semaphore,
                        is_marketer=is_marketer,
                        cta_settings=cta_settings,
                        gameplay_bg_path=gameplay_bg_path,
                    )

                thumb_path = job_dir / f"clip_{i:02d}_thumb.jpg"
                await generate_thumbnail(captioned_path, thumb_path)

                async with _step(job_id, f"clip {i} phase2 upload"):
                    thumb_exists = thumb_path.exists() and thumb_path.stat().st_size > 0
                    upload_tasks = [
                        upload_clip(captioned_path, job_id, clip_id),
                        upload_raw_clip(reframed_path, job_id, clip_id),
                        upload_thumbnail(thumb_path, job_id, clip_id) if thumb_exists else _empty_str(),
                    ]
                    final_url, raw_vertical_url, thumb_url = await asyncio.gather(*upload_tasks)

                await db.update_clip_final_url(
                    clip_id=clip_id,
                    video_url=final_url,
                    raw_video_url=raw_vertical_url,
                    thumbnail_url=thumb_url,
                    captions_data=captions_to_dict(captions),
                )
            except BaseException:
                # Row was inserted (clip_ready=FALSE) before this point —
                # without cleanup it's a permanent orphan since nothing else
                # ever marks it ready or removes it.
                await db.delete_clip(clip_id)
                raise

            clips_done += 1
            pct = 33 + int(57 * clips_done / total)
            await db.update_job_progress(job_id, pct, f"HD ready: {clips_done}/{total} clips encoded...")
            logger.info(f"[{job_id}] Clip {i} HD live (clip_id={clip_id})")

            for p in [raw_clip_path, captioned_path, reframed_path, thumb_path]:
                p.unlink(missing_ok=True)

            return {**clip_data, "video_url": final_url}

        results = await asyncio.gather(
            *[_process_one_clip(i, ts) for i, ts in enumerate(timestamps)],
            return_exceptions=True,
        )
        uploaded_count = sum(1 for r in results if not isinstance(r, Exception))
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.error(f"[{job_id}] Clip {i} failed: {r}")

        if not uploaded_count:
            # The aggregate message never contains "cancelled" even when
            # every clip failed because the job was cancelled mid-run (each
            # clip's own "Job {id} cancelled" exception is swallowed by
            # asyncio.gather(..., return_exceptions=True) above) — check
            # explicitly so _friendly_ffmpeg_error reports the real cause.
            job_check = await db.get_job(job_id)
            if job_check and job_check.get("status") == "cancelled":
                raise RuntimeError(f"Job {job_id} cancelled")
            raise RuntimeError("All clip extractions failed")

        # Re-check cancellation immediately before marking complete — the
        # per-clip check above only catches cancellation that happened
        # before that clip started; a cancel that lands after all clips
        # already passed their check must still stop this job from being
        # marked completed (and the "clips ready" email from going out).
        job_check = await db.get_job(job_id)
        if job_check and job_check.get("status") == "cancelled":
            raise RuntimeError(f"Job {job_id} cancelled")

        await db.update_job_progress(job_id, 90, "Finalizing...")
        await db.complete_job(job_id, uploaded_count)

        # Partial-refund: reserved N credits (one per requested clip), only
        # M delivered. Refund N-M so the user isn't billed for clips that
        # never landed. video_minutes_reserved is not refunded here — it's
        # billed against the source-video window that WAS processed.
        unused_credits = reserved_credits - uploaded_count
        if unused_credits > 0:
            await db.release_credits(user_id, unused_credits)

        success = True
        logger.info(
            f"[{job_id}] Done: {uploaded_count}/{reserved_credits} clips delivered "
            f"({video_minutes_reserved:.1f} min billed to user {user_id})"
        )

        # "Your clips are ready" email — best-effort, never allowed to fail
        # a job that already succeeded. send_email() itself never raises,
        # but the DB lookup here could, so this whole block is wrapped too.
        try:
            user = await db.get_user(user_id)
            if user and user.get("email"):
                is_paid = bool(user.get("plan")) and user.get("plan") != "free"
                plural = uploaded_count != 1
                await asyncio.to_thread(
                    send_email,
                    user["email"],
                    f"Your {uploaded_count} clip{'s' if plural else ''} {'are' if plural else 'is'} ready 🎬",
                    clips_ready_email_html(metadata.get("title", ""), uploaded_count, is_paid),
                )
        except Exception as email_exc:
            logger.warning(f"[{job_id}] Failed to send 'clips ready' email: {email_exc}")

    finally:
        if not success:
            # Full refund on FFmpeg failure — nothing (or nothing complete)
            # was delivered, so the user shouldn't be charged. Same rule as
            # the pre-split orchestrator's `finally` block.
            if reserved_credits > 0:
                await db.release_credits(user_id, reserved_credits)
            if video_minutes_reserved > 0:
                await db.release_video_minutes(user_id, video_minutes_reserved)
        cleanup_job_files(job_dir)
        _ACTIVE_JOBS_ON_INSTANCE = max(0, _ACTIVE_JOBS_ON_INSTANCE - 1)


class DashDownloadFailed(RuntimeError):
    """
    All DASH attempts failed. Carries the LAST coherent (proxy, URL) pairing
    that was actually tried, so the caller's full-source fallback can reuse
    it directly instead of re-resolving via one proxy and downloading via a
    different one — which just reproduces the same IP-mismatch 403 a 4th
    time (this used to happen: the caller's own fallback re-resolved via
    one proxy but always downloaded via Proxy-Seller, regardless of which
    proxy the fresh URL was actually bound to).
    """
    def __init__(self, message: str, stream_url: str, audio_url: str | None, user_agent: str, proxy_url: str | None):
        super().__init__(message)
        self.stream_url = stream_url
        self.audio_url = audio_url
        self.user_agent = user_agent
        self.proxy_url = proxy_url


async def _dash_download_with_refresh(
    video_id: str,
    job_id: str,
    stream_url: str,
    audio_url: str,
    user_agent: str,
    clip_ranges: list[tuple[float, float]],
    job_dir: Path,
    quality: str,
) -> list:
    """
    DASH download — Proxy-Seller ISP ONLY.

    proxy-cheap is billed by bandwidth (2GB/mo as of 2026-08) and shared
    with the lightweight API-stage calls (metadata/transcript/stream-URL
    resolution, a few KB each). Actual clip video bytes are MB-to-tens-of-MB
    per job — routing those through proxy-cheap burns its quota in hours,
    and once the quota's gone the gateway refuses ALL connections, including
    the unrelated cheap calls (verified in production 2026-08-29: a proxy-
    cheap outage took down metadata + transcript + stream resolution
    simultaneously, well before this fix). Proxy-Seller's static ISP IPs
    have unlimited bandwidth and exist specifically for this — DASH byte
    downloads must never touch proxy-cheap.

    IP-binding note: stream URLs are sometimes IP-bound — the CDN signature
    covers the exit IP that resolved them. If we resolve via one proxy but
    download via another, the CDN 403s on real segment data. So every
    attempt below resolves AND downloads through the SAME Proxy-Seller pool
    IP (never mixes).

    Fallback chain (all Proxy-Seller):

      1. Cached URL (from API stage) via Proxy-Seller pool IP #0 — if the
         URL isn't IP-bound (url_is_ip_bound() False) this works without a
         re-resolve round trip; if it IS IP-bound and wasn't resolved via
         this same IP, it 403s and we fall through immediately.
      2. Re-resolve + download via Proxy-Seller pool IP #0 (coherent pair).
      3. Re-resolve + download via Proxy-Seller pool IP #1 — in case IP #0
         is the one flagged/blocked for this particular video.
      4. Re-resolve + download via Proxy-Seller pool IP #2.
      5. Caller's full-source fallback, using whichever pairing from above
         was the LAST one actually attempted (see DashDownloadFailed).
    """
    ps_proxy_0 = get_proxyseller_proxy(job_id, attempt=0)
    last = (stream_url, audio_url, user_agent, ps_proxy_0)

    # ── Attempt 1: cached URL + Proxy-Seller IP #0, skip re-resolve when
    # the cached URL isn't IP-bound (works from any IP) ──
    if ps_proxy_0 and not url_is_ip_bound(stream_url):
        try:
            return await download_all_clips_parallel(
                stream_url, clip_ranges, job_dir,
                audio_url=audio_url, user_agent=user_agent,
                proxy_url=ps_proxy_0,
                max_concurrent=3,
            )
        except Exception as exc1:
            exc1_str = str(exc1) or f"{type(exc1).__name__} (no message)"
            logger.warning(f"[{job_id}] DASH attempt 1 failed (cached URL + Proxy-Seller #0): {exc1_str}")

    # ── Attempts 2-4: re-resolve + download via Proxy-Seller pool IPs #0-2 ──
    for ps_attempt in range(3):
        ps_proxy = get_proxyseller_proxy(job_id, attempt=ps_attempt)
        if not ps_proxy:
            break
        try:
            logger.info(f"[{job_id}] Re-resolving stream URLs through Proxy-Seller (pool IP #{ps_attempt})")
            stream_url, audio_url, user_agent = await get_stream_urls(
                video_id, quality=quality, session_id=job_id,
                proxy_override=ps_proxy,
            )
            last = (stream_url, audio_url, user_agent, ps_proxy)
            return await download_all_clips_parallel(
                stream_url, clip_ranges, job_dir,
                audio_url=audio_url, user_agent=user_agent,
                proxy_url=ps_proxy,
                max_concurrent=3,
            )
        except Exception as exc:
            exc_str = str(exc) or f"{type(exc).__name__} (no message)"
            logger.warning(f"[{job_id}] DASH attempt {ps_attempt + 2} failed (Proxy-Seller #{ps_attempt} resolve + DASH): {exc_str}")

    # All DASH attempts exhausted — hand the caller the last coherent
    # (proxy, URL) pairing so its full-source fallback doesn't repeat the
    # same mismatch.
    raise DashDownloadFailed(
        f"All DASH download attempts failed for job {job_id}",
        *last,
    )


async def _fail_and_refund_from_db(job_id: str, error_message: str) -> None:
    """
    FFmpeg stage failed before delivering any clips. Look up the row so we
    can find the user + reservation and refund. Called for exceptions that
    escaped the main try/finally above (timeouts, or errors reading the
    ffmpeg_payload in the first place).
    """
    await db.fail_job(job_id, error_message)
    row = await db.get_job(job_id)
    if not row:
        return
    user_id                = str(row["user_id"])
    reserved_credits       = int(row.get("clip_count") or 0)
    video_minutes_reserved = float(row.get("reserved_video_minutes") or 0)
    if reserved_credits > 0:
        await db.release_credits(user_id, reserved_credits)
    if video_minutes_reserved > 0:
        await db.release_video_minutes(user_id, video_minutes_reserved)


async def _empty_str() -> str:
    return ""
