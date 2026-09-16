"""
factloop_stage.py — top-level pipeline entrypoints for Factloop.

Two stages, not the Brainrot pipeline's three — Factloop has NO user review
step (input facts in, finished video out, fully automatic), and one credit
is reserved at job creation (see app/api/factloop.py) rather than at a
separate confirm gate. That collapses what used to be three stages into:

  1. GENERATE STAGE (run_factloop_api_stage → _execute_factloop_api_stage)
     Dispatched at job creation (POST /factloop/jobs, right after the
     credit is reserved). Script goes first, then images + TTS run in
     parallel (both now depend on the finished script, so — unlike before
     the per-fact image rework — they can no longer run alongside it):
       - factloop_script.generate_narration() writes the narrator lines,
         each tagged with kind + stat_key + image_query so the compositor
         can sync each fact's animated callout AND its own on-screen image
         to real TTS timing later.
       - factloop_image.generate_images_for_lines() resolves ONE up-centric
         image PER FACT (a batting shot vs. a bowling shot vs. a
         celebration shot, etc., driven by that fact's image_query) —
         real stock photo search first (factloop_stock_images.py: Pexels,
         Unsplash, Pixabay), Runware AI generation as the fallback for
         whichever facts no stock photo matched. Uploaded to GCS in the
         same step so the FFmpeg stage can either download them back or
         the same code path re-uses the local copies — same pattern
         brainrot_stage.py used for TTS audio.
       - TTS synthesizes every narration line via the same _synthesize_
         timeline() approach the old confirm stage used (bounded
         concurrency, one retry per line, real durations laid out
         sequentially).
     scene_plan written as the timed narrator lines (with kind/stat_key
     preserved), status flipped to 'api_done' — which is the same status
     the FFmpeg stage's split-worker claim query already looks for, so
     the watcher/dispatcher needs zero changes.

  2. RENDER STAGE (run_factloop_ffmpeg_stage → _execute_factloop_ffmpeg_stage)
     Same shape as brainrot_stage.py's FFmpeg stage: prefetch what's small
     and reusable (the generated image, music), stream what's large
     (gameplay clip + TTS audio) straight from GCS URLs, single ffmpeg
     invocation via factloop_composite.render(), upload result, complete.

Refund-on-failure keeps using the same pattern brainrot_stage.py used —
_fail_and_refund reads only payload['reserved_credits'] and calls
db.release_brainrot_credits, both of which are pipeline-shape-agnostic.
"""
import asyncio
import logging
import tempfile
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline import factloop_composite as composite
from app.pipeline import factloop_image, factloop_script, tts, voice_catalog
from app.pipeline.uploader import download_to_file, upload_clip, upload_generated_images, upload_tts_audio

logger = logging.getLogger(__name__)
settings = get_settings()

FACTLOOP_STAGE_TIMEOUT_SECONDS = 1500  # 25 minutes, same ceiling as ffmpeg_stage.py
TTS_CONCURRENCY = 5
HEARTBEAT_INTERVAL_SECONDS = 20

# Mirrors brainrot_stage.py's _ACTIVE_RENDERS_ON_INSTANCE — same
# per-instance render-count → per-render thread-budget split logic (see
# brainrot_stage.py's comment for the full rationale — one uvicorn worker
# per instance, so a plain int is a valid cross-request counter here).
_ACTIVE_RENDERS_ON_INSTANCE = 0


async def _heartbeat(job_id: str) -> None:
    """Keeps updated_at fresh during long stages — same purpose as
    brainrot_stage.py's _heartbeat: a hard process death (OOM SIGKILL)
    bypasses every try/except, so without a periodic touch the watcher's
    stuck-job reconciler can't tell "still working" from "already dead"."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
        try:
            await db.touch_brainrot_job(job_id)
        except Exception:
            logger.exception(f"[{job_id}] heartbeat update failed")


@asynccontextmanager
async def _step(job_id: str, name: str):
    t0 = time.monotonic()
    logger.info(f"[{job_id}] -> {name} started")
    try:
        yield
    except Exception as e:
        logger.error(f"[{job_id}] x {name} FAILED after {time.monotonic() - t0:.2f}s: {e}")
        raise
    else:
        logger.info(f"[{job_id}] OK {name} completed in {time.monotonic() - t0:.2f}s")


# ── Public entrypoints ─────────────────────────────────────────

async def run_factloop_api_stage(job_id: str) -> None:
    """Generate stage — dispatched at job creation, AFTER the credit is
    reserved (see /factloop/jobs). Runs script + image + TTS, writes the
    final timed scene_plan, flips status to 'api_done'. In single-service
    mode, chains straight into the FFmpeg stage in-process; in split-worker
    mode, the existing claim_brainrot_ffmpeg_job query on the watcher picks
    it up unchanged (same status='api_done' claim target the old pipeline
    used)."""
    heartbeat_task = asyncio.create_task(_heartbeat(job_id))
    try:
        await asyncio.wait_for(
            _execute_factloop_api_stage(job_id),
            timeout=FACTLOOP_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] Factloop generate stage timed out")
        await _fail_and_refund(job_id, "Generation took too long. Please try again.")
        return
    except Exception as exc:
        logger.exception(f"[{job_id}] Factloop generate stage failed: {exc}")
        await _fail_and_refund(job_id, _friendly_error(str(exc)))
        return
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task

    # Single-service mode: chain directly into the FFmpeg stage. Split-
    # worker mode leaves the row at 'api_done' for the watcher's
    # claim_brainrot_ffmpeg_job query to pick up on its normal cadence.
    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        logger.info(f"[{job_id}] Factloop api stage done — waiting for FFmpeg worker claim")
        return

    # Claim the row for this in-process FFmpeg dispatch immediately — flip
    # status to 'rendering' BEFORE dispatching so the always-running watcher
    # (which independently claims status='api_done' rows via
    # claim_brainrot_ffmpeg_job) can't also pick up this same job.
    await db.update_brainrot_job_progress(job_id, 55, "Starting render...", status="rendering")
    await run_factloop_ffmpeg_stage(job_id)


async def run_factloop_ffmpeg_stage(job_id: str) -> None:
    heartbeat_task = asyncio.create_task(_heartbeat(job_id))
    try:
        await asyncio.wait_for(
            _execute_factloop_ffmpeg_stage(job_id),
            timeout=FACTLOOP_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] Factloop FFmpeg stage timed out")
        await _fail_and_refund(job_id, "Rendering took too long. Please try again with a shorter clip.")
    except Exception as exc:
        logger.exception(f"[{job_id}] Factloop FFmpeg stage failed: {exc}")
        await _fail_and_refund(job_id, _friendly_error(str(exc)))
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task


# ── Refund / friendly errors ──────────────────────────────────

async def _fail_and_refund(job_id: str, message: str) -> None:
    """Marks the job failed and refunds its reserved credit — identical
    pattern to brainrot_stage.py's _fail_and_refund (same DB primitives,
    same clean-up race guard against a late timeout firing right after a
    successful complete)."""
    await db.fail_brainrot_job(job_id, message)
    try:
        row = await db.get_brainrot_job(job_id)
        if not row:
            return
        if row["status"] == "complete":
            logger.info(f"[{job_id}] Timeout/failure fired but job had already completed — skipping refund")
            return
        payload = row.get("payload") or {}
        reserved = payload.get("reserved_credits", 0)
        if reserved > 0:
            await db.release_brainrot_credits(str(row["user_id"]), reserved)
            logger.info(f"[{job_id}] Refunded {reserved} credit(s) after failure")
    except Exception:
        logger.exception(f"[{job_id}] Failed to refund credits after job failure — needs manual reconciliation")


def _friendly_error(raw: str) -> str:
    r = (raw or "").lower()
    if "runware" in r or "image" in r and "generat" in r:
        return "Image generation failed. Please try again."
    if "tts" in r or "unrealspeech" in r or "lemonfox" in r:
        return "Voice synthesis failed. Please try again."
    if "download failed" in r or "storage.googleapis.com" in r or "404 not found" in r:
        return "Couldn't load one of this clip's assets. Please try again — if it keeps happening, contact support."
    if "ffmpeg" in r or "composite" in r:
        return "Rendering failed. Please try again, or contact support if it keeps happening."
    if "zero usable narration" in r or "at least one fact" in r:
        return "Couldn't generate a narration from those facts — try adding more detail or rephrasing."
    first_line = raw.strip().split("\n", 1)[0][:200] if raw else ""
    return f"Something went wrong while creating your clip. {first_line}".rstrip()


# ── Generate stage: script + image + TTS ──────────────────────

async def _execute_factloop_api_stage(job_id: str) -> None:
    row = await db.get_brainrot_job(job_id)
    if not row:
        raise RuntimeError(f"Factloop job {job_id} not found")
    payload = row["payload"]
    title = payload.get("title", "")
    facts = payload.get("facts", [])
    context = payload.get("context", "")

    if not facts:
        raise RuntimeError("Factloop job missing facts in payload")

    with tempfile.TemporaryDirectory(prefix=f"factloop_gen_{job_id}_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        # Images are now per-fact and driven by each stat line's own
        # GPT-written image_query (a batting shot vs. a bowling shot vs. a
        # celebration shot, etc.) — so unlike the old single whole-video
        # image, image generation now DEPENDS on the finished script and
        # can no longer run concurrently with it. Script goes first.
        async with _step(job_id, "generate_script"):
            await db.update_brainrot_job_progress(job_id, 15, "Writing script...", status="generating_script")
            subject, narration_lines = await factloop_script.generate_narration(
                title=title,
                facts=facts,
                context=context,
                duration_seconds=payload.get("duration_seconds", 30),
            )

        async with _step(job_id, "generate_post_meta"):
            post_meta = await factloop_script.generate_post_meta(narration_lines)
            if post_meta["title"] or post_meta["hashtags"]:
                await db.set_brainrot_post_meta(job_id, post_meta["title"], post_meta["hashtags"])

        # Per-fact images (stock photo search first, AI-generated fallback)
        # and TTS narration ARE independent of each other — both only need
        # the finished script — so these two run concurrently, hiding
        # whichever is slower behind the other.
        async with _step(job_id, "generate_images_and_voice"):
            await db.update_brainrot_job_progress(
                job_id, 25, "Finding images and synthesizing narration...", status="synthesizing_voice",
            )
            images_by_key, timed_lines = await asyncio.gather(
                factloop_image.generate_images_for_lines(job_id, subject, narration_lines, context, tmp_dir),
                _synthesize_timeline(job_id, narration_lines, payload, tmp_dir),
            )

        async with _step(job_id, "upload_generated_images"):
            uploaded_images = await upload_generated_images(images_by_key, job_id)
            await db.set_brainrot_generated_images(job_id, uploaded_images)

        await db.set_brainrot_scene_plan(
            job_id,
            [
                {
                    "kind": l.kind, "text": l.text, "stat_key": l.stat_key,
                    "start": l.start, "end": l.end, "audio_url": l.audio_path,
                }
                for l in timed_lines
            ],
        )
        await db.set_job_api_done_brainrot(job_id)


# ── FFmpeg stage: composite + upload ──────────────────────────

async def _execute_factloop_ffmpeg_stage(job_id: str) -> None:
    row = await db.get_brainrot_job(job_id)
    if not row:
        raise RuntimeError(f"Factloop job {job_id} not found")
    payload = row["payload"]
    scene_plan = row.get("scene_plan") or []
    if not scene_plan:
        raise RuntimeError("Factloop job has no scene_plan at render time")

    with tempfile.TemporaryDirectory(prefix=f"factloop_{job_id}_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        timed_lines = [
            composite.TimedLine(
                kind=line.get("kind", "context"), text=line["text"], stat_key=line.get("stat_key"),
                start=line["start"], end=line["end"], audio_path=line["audio_url"],
            )
            for line in scene_plan
        ]
        # Real synthesized-audio length wins over the nominal
        # duration_seconds — same reasoning brainrot_stage.py uses (the
        # nominal is only an estimate used for script pacing, and using it
        # here would silently truncate captions mid-line when audio runs
        # longer than estimated).
        clip_duration = (timed_lines[-1].end if timed_lines else 0.0) or payload.get("duration_seconds", 30)

        gameplay_url = payload["gameplay_clip_url"]
        generated_images = payload.get("generated_images") or {}
        if not generated_images:
            raise RuntimeError("Factloop job missing generated_images in payload")

        async def _download_stat_image(stat_key: str, info: dict) -> tuple[str, Path]:
            dest = tmp_dir / f"generated_{stat_key}.png"
            await download_to_file(info["url"], dest)
            return stat_key, dest

        async with _step(job_id, "fetch_assets"):
            await db.update_brainrot_job_progress(job_id, 50, "Downloading assets...", status="rendering")
            image_downloads, music_local = await asyncio.gather(
                asyncio.gather(*(
                    _download_stat_image(stat_key, info) for stat_key, info in generated_images.items()
                )),
                _fetch_optional_asset(payload.get("music_url"), tmp_dir, "music"),
            )
            images_local: dict[str, Path] = dict(image_downloads)

        async with _step(job_id, "composite_render"):
            await db.update_brainrot_job_progress(job_id, 60, "Rendering clip...", status="rendering")
            output_path = tmp_dir / "output.mp4"
            global _ACTIVE_RENDERS_ON_INSTANCE
            _ACTIVE_RENDERS_ON_INSTANCE += 1
            try:
                threads = max(1, settings.BRAINROT_WORKER_VCPUS // _ACTIVE_RENDERS_ON_INSTANCE)
                logger.info(
                    f"[{job_id}] render start: threads={threads} "
                    f"active_renders_on_instance={_ACTIVE_RENDERS_ON_INSTANCE} "
                    f"clip_duration={clip_duration:.1f}s facts={len(payload.get('facts', []))} lines={len(timed_lines)}"
                )

                last_reported_pct = -1

                async def _on_render_progress(frac: float) -> None:
                    nonlocal last_reported_pct
                    pct = 60 + int(30 * frac)
                    if pct == last_reported_pct:
                        return
                    last_reported_pct = pct
                    await db.update_brainrot_job_progress(job_id, pct, "Rendering clip...", status="rendering")

                async def _render(gameplay_clip_path, lines):
                    return await composite.render(
                        gameplay_clip_path=gameplay_clip_path,
                        images=images_local,
                        lines=lines,
                        facts=payload.get("facts", []),
                        clip_duration=clip_duration,
                        caption_style=payload.get("caption_style", "brainrot"),
                        caption_color=payload.get("caption_color", "yellow_black"),
                        caption_y=payload.get("caption_y", 0.82),
                        output_path=output_path,
                        seed=job_id,
                        music_path=music_local,
                        music_volume=payload.get("music_volume", 0.3),
                        threads=threads,
                        on_progress=_on_render_progress,
                    )

                try:
                    # Fast path: gameplay clip streamed straight from GCS
                    # (validated Range support), TTS audio URLs also fed
                    # to ffmpeg directly. Same fallback strategy
                    # brainrot_stage.py uses — if streaming fails once,
                    # download everything locally and retry.
                    await _render(gameplay_url, timed_lines)
                except Exception as exc:
                    logger.warning(
                        f"[{job_id}] Streamed render failed ({exc}) — "
                        f"falling back to fully-local assets and retrying once"
                    )
                    gameplay_path = tmp_dir / "gameplay.mp4"
                    await download_to_file(gameplay_url, gameplay_path)

                    async def _hydrate_line(i: int, line: dict) -> composite.TimedLine:
                        local_audio = tmp_dir / f"line_{i}.mp3"
                        await download_to_file(line["audio_url"], local_audio)
                        return composite.TimedLine(
                            kind=line.get("kind", "context"), text=line["text"],
                            stat_key=line.get("stat_key"),
                            start=line["start"], end=line["end"], audio_path=local_audio,
                        )

                    local_lines = list(await asyncio.gather(
                        *(_hydrate_line(i, line) for i, line in enumerate(scene_plan))
                    ))
                    await _render(gameplay_path, local_lines)
            finally:
                _ACTIVE_RENDERS_ON_INSTANCE = max(0, _ACTIVE_RENDERS_ON_INSTANCE - 1)

        async with _step(job_id, "upload"):
            await db.update_brainrot_job_progress(job_id, 90, "Uploading...", status="rendering")
            output_url = await upload_clip(output_path, job_id, "main")

        await db.complete_brainrot_job(job_id, output_url)


# ── TTS timeline ──────────────────────────────────────────────

async def _synthesize_timeline(
    job_id: str, narration_lines: list, payload: dict, tmp_dir: Path,
) -> list[composite.TimedLine]:
    """Single narrator (no left/right split) — reuse the same bounded
    fan-out + concurrent GCS upload pattern brainrot_stage._synthesize_
    timeline used, just with one voice_id source instead of two."""
    voice_id = payload.get("voice_id") or ""
    voice_entry = voice_catalog.find_voice(voice_id) if voice_id else None
    if voice_entry is None:
        # Fall back to a sensible default when the payload doesn't carry
        # (or carries an unknown) voice_id — matches how the old
        # _resolve_distinct_voices function guarded against empty
        # voice_left/voice_right at TTS time.
        voice_entry = voice_catalog.default_voice_for_gender("neutral", slot=0)
        voice_id = voice_entry.voice_id
    provider = voice_entry.provider
    locale = voice_entry.locale

    sem = asyncio.Semaphore(TTS_CONCURRENCY)

    async def _synth_one(i: int, line):
        async with sem:
            last_exc = None
            for attempt in range(2):
                try:
                    audio_bytes, duration = await tts.synthesize(line.text, voice_id, provider, locale=locale)
                    break
                except Exception as exc:
                    last_exc = exc
                    if attempt == 0:
                        logger.warning(f"[{job_id}] TTS line {i} attempt 1 failed: {exc} — retrying")
                        await asyncio.sleep(1.5)
            else:
                raise last_exc
        audio_path = tmp_dir / f"line_{i}.mp3"
        audio_path.write_bytes(audio_bytes)
        return duration, audio_path

    results = await asyncio.gather(*(_synth_one(i, l) for i, l in enumerate(narration_lines)))

    cursor = 0.0
    windows: list[tuple[float, float]] = []
    for duration, _audio_path in results:
        windows.append((cursor, cursor + duration))
        cursor += duration

    audio_urls = await asyncio.gather(*(
        upload_tts_audio(audio_path, job_id, f"line_{i}")
        for i, (_duration, audio_path) in enumerate(results)
    ))

    timed_lines: list[composite.TimedLine] = [
        composite.TimedLine(
            kind=line.kind, text=line.text, stat_key=line.stat_key,
            start=start, end=end, audio_path=audio_url,
        )
        for line, (start, end), audio_url in zip(narration_lines, windows, audio_urls)
    ]
    logger.info(f"[{job_id}] Synthesized {len(timed_lines)} lines, total {cursor:.1f}s")
    return timed_lines


# ── Small asset fetch helpers ─────────────────────────────────

async def _fetch_optional_asset(asset_url: str | None, tmp_dir: Path, name: str) -> Path | None:
    if not asset_url:
        return None
    local_path = tmp_dir / f"{name}.mp3"
    await download_to_file(asset_url, local_path)
    return local_path
