"""
brainrot_stage.py — top-level pipeline entrypoint for the Brainrot Clips Maker,
dispatched by the watcher to POST /internal/brainrot-stage/run (see
app/api/internal.py), same shape as ffmpeg_stage.py::run_ffmpeg_stage.

Flow:
  1. Load the job row (payload JSONB written by POST /brainrot/jobs)
  2. generate_scene_plan() — AI dialogue timeline (brainrot_script.py)
  3. TTS every line in parallel (bounded concurrency), build a sequential
     timeline from the REAL audio durations (no interpolated timestamps)
  4. Download character assets + music/SFX from GCS. The gameplay clip and
     TTS line audio are handed to ffmpeg as GCS URLs directly (no local
     download) — see the "streamed render" comment in
     _run_brainrot_ffmpeg_stage for why, and its fallback for what happens
     if that fails mid-render.
  5. brainrot_composite.render() — one ffmpeg pass
  6. Upload the finished clip, mark the job complete

Credits: a brainrot job reserves exactly 1 credit at submission time
(POST /brainrot/jobs — see reserved_credits in the payload). If the job
fails at either stage below, _fail_and_refund() releases it in full —
same reserve/release primitive jobs.py + ffmpeg_stage.py use for YouTube
Shorts, just without the partial-refund math since a brainrot job only
ever produces one clip (all-or-nothing, not N-requested/M-delivered).
"""
import asyncio
import logging
import tempfile
import time
import uuid
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline import brainrot_composite as composite
from app.pipeline import brainrot_script, tts, voice_catalog
from app.pipeline.uploader import download_to_file, upload_clip

logger = logging.getLogger(__name__)
settings = get_settings()

BRAINROT_STAGE_TIMEOUT_SECONDS = 1500  # 25 minutes, same ceiling as ffmpeg_stage.py
TTS_CONCURRENCY = 5
HEARTBEAT_INTERVAL_SECONDS = 20

# How many brainrot renders are actually executing composite.render() on this
# instance right now. Module-level (not per-request) because the Cloud Run
# image runs a single uvicorn worker (--workers 1, see Dockerfile) — one
# process, one event loop per instance — so a plain int genuinely reflects
# this instance's live state and is safe without a lock (no other OS thread
# ever touches it). --concurrency on the brainrot worker allows 2 requests
# per instance, and /internal/brainrot-ffmpeg-stage/run fires the actual
# render as a detached asyncio task (see internal.py) that outlives the HTTP
# response — so unlike the main FFmpeg worker (1 job/instance, no sharing
# possible), two renders CAN genuinely run at once here. This counter is
# what lets each one find out and divide the CPU budget accordingly, the
# same role ffmpeg_stage.py's _ACTIVE_JOBS_ON_INSTANCE plays for the main
# pipeline (see that file's "fix: concurrency" / "fix: cpu thread min load"
# history for why unpinned/unaware ffmpeg thread counts silently oversubscribe).
_ACTIVE_RENDERS_ON_INSTANCE = 0


async def _heartbeat(job_id: str) -> None:
    """Keeps updated_at fresh while the FFmpeg stage is running. A hard
    process death (e.g. an OOM kill during the ffmpeg subprocess) bypasses
    every try/except in this module — SIGKILL, not a raisable exception —
    so without this the job's updated_at freezes at whatever it was when
    the crash happened, and the watcher's stuck-job reconciler has no way
    to tell "still working" from "already dead" except by staleness."""
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


async def run_brainrot_api_stage(job_id: str) -> None:
    try:
        await asyncio.wait_for(
            _execute_brainrot_api_stage(job_id),
            timeout=BRAINROT_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] Brainrot API stage timed out")
        await _fail_and_refund(job_id, "Script generation took too long.")
    except Exception as exc:
        logger.exception(f"[{job_id}] Brainrot API stage failed: {exc}")
        await _fail_and_refund(job_id, _friendly_error(str(exc)))


@dataclass
class _PrefetchedAssets:
    """Characters + music, already downloaded to local disk before the
    FFmpeg stage even starts — see _prefetch_shared_assets / run_brainrot_stage."""
    characters: list
    music_path: object  # Path | None


async def _prefetch_shared_assets(payload: dict, tmp_dir: Path) -> "_PrefetchedAssets":
    """Characters + music are fully known from the job's payload at creation
    time — nothing about them depends on the script or TTS output that the
    API stage produces. Kicking their download off concurrently with
    generate_scene_plan()/TTS (see run_brainrot_stage) instead of waiting
    for the whole API stage to finish hides their download time entirely
    behind however long script+TTS already take, rather than adding it on
    top afterward in the FFmpeg stage."""
    characters, music_path = await asyncio.gather(
        _fetch_characters(payload, tmp_dir),
        _fetch_optional_asset(payload.get("music_url"), tmp_dir, "music"),
    )
    return _PrefetchedAssets(characters=characters, music_path=music_path)


async def run_brainrot_ffmpeg_stage(job_id: str, prefetched: "_PrefetchedAssets | None" = None) -> None:
    try:
        await asyncio.wait_for(
            _execute_brainrot_ffmpeg_stage(job_id, prefetched=prefetched),
            timeout=BRAINROT_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] Brainrot FFmpeg stage timed out")
        await _fail_and_refund(job_id, "Rendering took too long. Please try again with a shorter script.")
    except Exception as exc:
        logger.exception(f"[{job_id}] Brainrot FFmpeg stage failed: {exc}")
        await _fail_and_refund(job_id, _friendly_error(str(exc)))


async def _fail_and_refund(job_id: str, message: str) -> None:
    """Marks the job failed and refunds its reserved credit. Re-fetches the
    job row rather than threading user_id/reserved_credits through every
    call site, since a failure can originate deep inside the pipeline (TTS,
    ffmpeg) with those values long out of scope — this stays correct no
    matter which stage or which line inside it actually raised.

    Safe to call once per job: the API stage and FFmpeg stage run strictly
    sequentially (run_brainrot_stage / the watcher only dispatches the
    FFmpeg stage after the API stage reaches 'api_done'), so a job can only
    ever fail in one of them, never both — no double-refund risk."""
    await db.fail_brainrot_job(job_id, message)
    try:
        row = await db.get_brainrot_job(job_id)
        if not row:
            return
        if row["status"] == "complete":
            # Race: the render/upload actually finished and called
            # complete_brainrot_job right as this timeout fired.
            # fail_brainrot_job's own status guard already no-op'd the
            # flip back to 'failed' — skip the refund too, the clip is real.
            logger.info(f"[{job_id}] Timeout/failure fired but job had already completed — skipping refund")
            return
        payload = row.get("payload") or {}
        reserved = payload.get("reserved_credits", 0)
        if reserved > 0:
            await db.release_brainrot_credits(str(row["user_id"]), reserved)
            logger.info(f"[{job_id}] Refunded {reserved} credit(s) after failure")
    except Exception:
        logger.exception(f"[{job_id}] Failed to refund credits after job failure — needs manual reconciliation")


async def run_brainrot_stage(job_id: str) -> None:
    """
    Single-service pipeline: run the API stage (script + TTS) and prefetch
    characters/music concurrently — not sequentially — since the latter are
    fully known from the payload at job-creation time and don't depend on
    anything the API stage produces. Only safe here (not in
    run_brainrot_api_stage/run_brainrot_ffmpeg_stage individually) because
    this function runs both stages in the same process: the split-worker
    dispatch path (watcher calling those two separately, on two different
    machines) has no local disk to share a prefetch across, so it keeps the
    original self-contained fetch in the FFmpeg stage untouched.
    """
    row = await db.get_brainrot_job(job_id)
    if not row:
        logger.error(f"[{job_id}] Brainrot job not found at stage start")
        return
    payload = row["payload"]

    with tempfile.TemporaryDirectory(prefix=f"brainrot_prefetch_{job_id}_") as prefetch_dir_str:
        prefetch_task = asyncio.create_task(
            _prefetch_shared_assets(payload, Path(prefetch_dir_str)),
            name=f"brainrot-prefetch-{job_id[:8]}",
        )

        await run_brainrot_api_stage(job_id)

        job = await db.get_brainrot_job(job_id)
        if not job or job.get("status") != "api_done":
            # API stage failed — the prefetch is now moot. Drain it before
            # the tmp dir it's writing into gets torn down on the way out
            # of this `with` block, and don't let a prefetch-side failure
            # (e.g. a bad music URL) surface as this job's error instead of
            # whatever actually failed in the API stage.
            prefetch_task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await prefetch_task
            return

        try:
            prefetched = await prefetch_task
        except Exception as exc:
            # A prefetch failure (e.g. a bad/expired music URL) shouldn't
            # sink a job whose script+TTS already succeeded — fall back to
            # None and let the FFmpeg stage do its own self-contained fetch,
            # same as it always has.
            logger.warning(f"[{job_id}] Asset prefetch failed ({exc}) — falling back to fetching in the FFmpeg stage")
            prefetched = None

        await run_brainrot_ffmpeg_stage(job_id, prefetched=prefetched)


def _friendly_error(raw: str) -> str:
    r = (raw or "").lower()
    if "tts" in r or "unrealspeech" in r or "lemonfox" in r:
        return "Voice synthesis failed. Please try again."
    # Character/gameplay/audio asset download failures (download_to_file in
    # uploader.py, after its own 3 retries) — catch before the generic
    # fallback so the user never sees a raw GCS URL or "404 Not Found"
    # exception string, which the old fallback branch used to leak verbatim.
    if "download failed" in r or "storage.googleapis.com" in r or "client error" in r or "404 not found" in r:
        return "Couldn't load one of this clip's assets (character, gameplay, or audio). Please try again — if it keeps happening, contact support."
    if "ffmpeg" in r or "composite" in r:
        return "Rendering failed. Please try again, or contact support if it keeps happening."
    if "zero usable dialogue" in r:
        return "Couldn't generate a script from that input — try rephrasing or adding more detail."
    first_line = raw.strip().split("\n", 1)[0][:200] if raw else ""
    return f"Something went wrong while creating your clip. {first_line}".rstrip()


async def _execute_brainrot_api_stage(job_id: str) -> None:
    row = await db.get_brainrot_job(job_id)
    if not row:
        raise RuntimeError(f"Brainrot job {job_id} not found")
    payload = row["payload"]

    with tempfile.TemporaryDirectory(prefix=f"brainrot_{job_id}_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        character_ids: list[str] = payload.get("character_ids", [])
        character_count = len(character_ids)
        left_profile, right_profile = _side_profiles(payload)

        async with _step(job_id, "generate_scene_plan"):
            await db.update_brainrot_job_progress(job_id, 10, "Writing script...", status="generating_script")
            dialogue_lines = await brainrot_script.generate_scene_plan(
                payload["script_input"],
                character_count,
                duration_seconds=payload.get("duration_seconds", 30),
                left_profile=left_profile,
                right_profile=right_profile,
            )
            # Post title/hashtags are derived from the ACTUAL dialogue just
            # written above, never from the raw topic the user typed — the
            # frontend's pre-generated values (seeded from the topic, before
            # this script existed) were only ever a preview. This call reads
            # the finished lines and never feeds anything back into them.
            post_meta = await brainrot_script.generate_post_meta(dialogue_lines)
            if post_meta["title"] or post_meta["hashtags"]:
                await db.set_brainrot_post_meta(job_id, post_meta["title"], post_meta["hashtags"])

        async with _step(job_id, "synthesize_voices"):
            await db.update_brainrot_job_progress(job_id, 30, "Synthesizing voices...", status="synthesizing_voice")
            timed_lines = await _synthesize_timeline(job_id, dialogue_lines, payload, tmp_dir)

        # The API stage is finished, save the plan and handoff
        await db.set_brainrot_scene_plan(
            job_id, [{"speaker": l.speaker, "text": l.text, "start": l.start, "end": l.end, "audio_url": l.audio_path} for l in timed_lines],
        )
        await db.set_job_api_done_brainrot(job_id)


async def _execute_brainrot_ffmpeg_stage(job_id: str, prefetched: "_PrefetchedAssets | None" = None) -> None:
    heartbeat_task = asyncio.create_task(_heartbeat(job_id))
    try:
        await _run_brainrot_ffmpeg_stage(job_id, prefetched=prefetched)
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task


async def _run_brainrot_ffmpeg_stage(job_id: str, prefetched: "_PrefetchedAssets | None" = None) -> None:
    row = await db.get_brainrot_job(job_id)
    if not row:
        raise RuntimeError(f"Brainrot job {job_id} not found")
    payload = row["payload"]
    scene_plan = row.get("scene_plan") or []

    with tempfile.TemporaryDirectory(prefix=f"brainrot_{job_id}_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        # Remote timed_lines — no download. TimedLine.audio_path takes a GCS
        # URL string just as happily as a local Path (see its dataclass
        # comment), and composite.render() only ever does str(audio_path) to
        # build the ffmpeg -i args, so handing it the URL directly skips the
        # "API stage uploads it, FFmpeg stage downloads it straight back
        # down" round trip entirely. Each line plays once, never looped, so
        # there's no seek-back-over-HTTP behavior to worry about — the
        # lowest-risk version of this technique (see the gameplay clip below
        # for the higher-risk, `-stream_loop`'d case, and its fallback).
        remote_lines = [
            composite.TimedLine(
                speaker=line["speaker"], text=line["text"], start=line["start"], end=line["end"],
                audio_path=line["audio_url"],
            )
            for line in scene_plan
        ]

        # Prefer the REAL synthesized-audio length (sum of actual TTS clip
        # durations) over the nominal requested duration_seconds — the latter
        # is only an estimate used to size the script (see _target_lines()),
        # and is always truthy (clamped 5-120), so using it here would
        # silently truncate dialogue/captions mid-line whenever the real
        # audio runs longer than estimated.
        clip_duration = (remote_lines[-1].end if remote_lines else 0.0) or payload.get("duration_seconds", 30)

        motion_mode = payload.get("motion_mode", "turn_based")
        gameplay_url = payload["gameplay_clip_url"]  # resolved by the API layer at job-creation time

        async with _step(job_id, "fetch_assets"):
            await db.update_brainrot_job_progress(job_id, 50, "Downloading assets...", status="rendering")
            if prefetched is not None:
                # run_brainrot_stage already fetched these concurrently with
                # script generation + TTS (see _prefetch_shared_assets) —
                # nothing left to download here.
                characters, music_path = prefetched.characters, prefetched.music_path
                logger.info(f"[{job_id}] using prefetched characters/music (fetched during API stage)")
            else:
                # Standalone call (split-worker dispatch, or the prefetch
                # failed upstream) — self-contained fetch, same as always.
                # Characters + music/SFX only — small, single-read files
                # where a local download is already cheap. The gameplay
                # clip (the one genuinely large asset) and TTS lines are NOT
                # fetched here; they go straight to ffmpeg as URLs in the
                # streamed render below.
                characters, music_path = await asyncio.gather(
                    _fetch_characters(payload, tmp_dir),
                    _fetch_optional_asset(payload.get("music_url"), tmp_dir, "music"),
                )
            logger.info(
                f"[{job_id}] music_url={payload.get('music_url')!r} → "
                f"{'downloaded to ' + str(music_path) if music_path else 'NOT included (music_url was empty)'}"
            )
            entry_motion, exit_motion = composite.resolve_entry_exit_motions(
                remote_lines, characters, motion_mode, clip_duration,
            )
            entry_sfx_path, exit_sfx_path = await asyncio.gather(
                _fetch_motion_sfx(entry_motion, tmp_dir, "entry_sfx"),
                _fetch_motion_sfx(exit_motion, tmp_dir, "exit_sfx"),
            )

        async with _step(job_id, "composite_render"):
            await db.update_brainrot_job_progress(job_id, 60, "Rendering clip...", status="rendering")
            output_path = tmp_dir / "output.mp4"
            global _ACTIVE_RENDERS_ON_INSTANCE
            _ACTIVE_RENDERS_ON_INSTANCE += 1
            try:
                # Split this instance's vCPU budget across however many
                # renders are actually live right now — see the comment on
                # _ACTIVE_RENDERS_ON_INSTANCE above. Solo render → full box;
                # a second one landing on the same instance → both drop to
                # half, read fresh at each render's own start.
                threads = max(1, settings.BRAINROT_WORKER_VCPUS // _ACTIVE_RENDERS_ON_INSTANCE)
                logger.info(
                    f"[{job_id}] render start: threads={threads} "
                    f"active_renders_on_instance={_ACTIVE_RENDERS_ON_INSTANCE} "
                    f"clip_duration={clip_duration:.1f}s characters={len(characters)} lines={len(remote_lines)}"
                )

                # Real mid-render progress instead of sitting static at 60%
                # for the whole ~60-90s encode — see composite.render()'s
                # on_progress docstring. Throttled to one DB write per whole
                # percentage point (not per progress line, which fires many
                # times a second) so this doesn't hammer the DB.
                last_reported_pct = -1

                async def _on_render_progress(frac: float) -> None:
                    nonlocal last_reported_pct
                    pct = 60 + int(30 * frac)
                    if pct == last_reported_pct:
                        return
                    last_reported_pct = pct
                    await db.update_brainrot_job_progress(job_id, pct, "Rendering clip...", status="rendering")

                def _render(gameplay_clip_path, lines):
                    return composite.render(
                        gameplay_clip_path=gameplay_clip_path,
                        lines=lines,
                        characters=characters,
                        motion_mode=motion_mode,
                        clip_duration=clip_duration,
                        caption_style=payload.get("caption_style", "brainrot"),
                        caption_color=payload.get("caption_color", "yellow_black"),
                        caption_y=payload.get("caption_y", 0.82),
                        output_path=output_path,
                        music_path=music_path,
                        music_volume=payload.get("music_volume", 0.3),
                        entry_sfx=entry_sfx_path,
                        exit_sfx=exit_sfx_path,
                        threads=threads,
                        on_progress=_on_render_progress,
                    )

                try:
                    # Fast path: gameplay clip streamed straight from its GCS
                    # URL with -stream_loop -1 (validated against a real
                    # Range-serving HTTP source before shipping this — ffmpeg
                    # correctly re-seeks to byte 0 on each loop). This is the
                    # one place a mid-render network hiccup can actually fail
                    # the whole ffmpeg process (unlike the never-looped TTS
                    # lines above), so it gets the fallback below; TTS lines
                    # don't need their own because a full render retry
                    # re-reads them too.
                    await _render(gameplay_url, remote_lines)
                except Exception as exc:
                    logger.warning(
                        f"[{job_id}] Streamed render failed ({exc}) — "
                        f"falling back to fully-local assets and retrying once"
                    )
                    gameplay_path = await _fetch_gameplay_clip(payload, tmp_dir)

                    async def _hydrate_line(i: int, line: dict) -> composite.TimedLine:
                        local_audio = tmp_dir / f"line_{i}.mp3"
                        await download_to_file(line["audio_url"], local_audio)
                        return composite.TimedLine(
                            speaker=line["speaker"], text=line["text"],
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


def _side_profiles(payload: dict) -> tuple[dict | None, dict | None]:
    """Pull the left/right character personality profiles out of the stored
    character_positions so brainrot_script.py can write each side in-character."""
    left = right = None
    for pos in payload.get("character_positions", []):
        profile = {
            "name": pos.get("name", ""),
            "archetype": pos.get("archetype", ""),
            "role": pos.get("role", ""),
            "voice": pos.get("voice", ""),
        }
        if pos.get("side") == "right":
            right = profile
        else:
            left = profile
    return left, right


def _resolve_distinct_voices(payload: dict) -> tuple[str, str]:
    """voice_left/voice_right straight from the payload — but POST /brainrot/jobs's
    auto-assign (gender-matched, slot-rotated, drawn from the full combined
    catalog across both providers) only runs at job-creation time, so if
    either side is still empty here, or both happen to already be the
    identical voice_id (an explicit user pick, or a stale duplicate default),
    this is the last chance to fix it before TTS actually runs. Without this,
    an empty voice on both sides falls through to tts.py's single flat
    DEFAULT_VOICES entry and both characters render with the exact same
    voice — the "same voice for both characters" bug. No provider param —
    the Studio picker shows all voices from both providers as one flat
    list, so the provider each voice_id actually belongs to is resolved
    per-voice downstream (see _synthesize_timeline), not fixed per-job."""
    voice_left = payload.get("voice_left", "")
    voice_right = payload.get("voice_right", "")
    gender_by_side = {p.get("side"): p.get("gender", "neutral") for p in payload.get("character_positions", [])}
    has_right = "right" in gender_by_side

    if not voice_left:
        voice_left = voice_catalog.default_voice_for_gender(gender_by_side.get("left", "neutral"), slot=0).voice_id
    if not voice_right and has_right:
        voice_right = voice_catalog.default_voice_for_gender(gender_by_side["right"], slot=1).voice_id

    if has_right and voice_right and voice_right == voice_left:
        gender = gender_by_side.get("right", "neutral")
        candidates = [v.voice_id for v in voice_catalog.VOICES if v.voice_id != voice_left]
        same_gender = [vid for vid in candidates if voice_catalog.find_voice(vid).gender == gender]
        if same_gender or candidates:
            voice_right = (same_gender or candidates)[0]

    return voice_left, voice_right


async def _synthesize_timeline(
    job_id: str, dialogue_lines: list, payload: dict, tmp_dir: Path,
) -> list[composite.TimedLine]:
    """TTS every line (bounded concurrency), then lay them out sequentially —
    line N starts the instant line N-1's audio ends. This gives exact
    start/end timestamps straight from real audio duration, no interpolation."""
    voice_left, voice_right = _resolve_distinct_voices(payload)
    sem = asyncio.Semaphore(TTS_CONCURRENCY)

    async def _synth_one(i: int, line):
        voice = voice_right if line.speaker == "right" else voice_left
        # Combined picker, no per-job provider field — each voice_id
        # carries its own provider (see voice_catalog.find_voice), so a
        # single clip can freely mix an UnrealSpeech voice on one side
        # with a Lemonfox voice on the other.
        voice_entry = voice_catalog.find_voice(voice) if voice else None
        provider = voice_entry.provider if voice_entry else "unrealspeech"
        locale = voice_entry.locale if voice_entry else "en-US"
        # One retry on transient TTS failure: providers occasionally 5xx or
        # timeout under load, and re-running the whole job just to re-do a
        # single failed line is wasteful (every other line's TTS cost has
        # already been paid). Cost of a retry is one extra API call for
        # that line; cost of NOT retrying is a full job failure + refund
        # + user resubmit.
        async with sem:
            last_exc = None
            for attempt in range(2):
                try:
                    audio_bytes, duration = await tts.synthesize(line.text, voice, provider, locale=locale)
                    break
                except Exception as exc:
                    last_exc = exc
                    if attempt == 0:
                        logger.warning(f"[{job_id}] TTS line {i} attempt 1 failed: {exc} — retrying")
                        await asyncio.sleep(1.5)
            else:
                raise last_exc  # both attempts failed — propagate
        audio_path = tmp_dir / f"line_{i}.mp3"
        audio_path.write_bytes(audio_bytes)
        return duration, audio_path

    # No return_exceptions — a genuine TTS failure (after retry) should abort
    # the whole synthesis, since a clip missing a line reads as broken to
    # the viewer. The failure then propagates to run_brainrot_api_stage's
    # exception handler which refunds the reserved credit in full.
    results = await asyncio.gather(*(_synth_one(i, l) for i, l in enumerate(dialogue_lines)))

    from app.pipeline.uploader import upload_tts_audio

    # Timeline math (start/end) only depends on synth order + real durations,
    # already known here — compute it up front, then fire every line's GCS
    # upload concurrently instead of one-at-a-time. Uploads don't need to
    # finish in order, only to be matched back to the right line afterward.
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
        composite.TimedLine(speaker=line.speaker, text=line.text, start=start, end=end, audio_path=audio_url)
        for line, (start, end), audio_url in zip(dialogue_lines, windows, audio_urls)
    ]
    logger.info(f"[{job_id}] Synthesized {len(timed_lines)} lines, total {cursor:.1f}s")
    return timed_lines


async def _fetch_characters(payload: dict, tmp_dir: Path) -> list[composite.CharacterPlacement]:
    positions = payload.get("character_positions", [])

    async def _fetch_one(pos: dict) -> composite.CharacterPlacement:
        image_url = pos["image_url"]  # resolved by the API layer from GET /brainrot/characters
        local_path = tmp_dir / f"char_{pos['side']}.png"
        await download_to_file(image_url, local_path)
        return composite.CharacterPlacement(
            side=pos["side"], image_path=local_path,
            x=pos.get("x", 0.25 if pos["side"] == "left" else 0.75),
            y=pos.get("y", 0.75), scale=pos.get("scale", 1.0), rotation=pos.get("rotation", 0.0),
            entry=pos.get("entry", "slide"), exit=pos.get("exit", "slide"),
        )

    # Almost always exactly 2 (left + right) — download both concurrently
    # rather than one-at-a-time.
    return list(await asyncio.gather(*(_fetch_one(pos) for pos in positions)))


async def _fetch_gameplay_clip(payload: dict, tmp_dir: Path) -> Path:
    gameplay_url = payload["gameplay_clip_url"]  # resolved by the API layer at job-creation time
    local_path = tmp_dir / "gameplay.mp4"
    await download_to_file(gameplay_url, local_path)
    return local_path


async def _fetch_optional_asset(asset_url: str | None, tmp_dir: Path, name: str) -> Path | None:
    if not asset_url:
        return None
    local_path = tmp_dir / f"{name}.mp3"
    await download_to_file(asset_url, local_path)
    return local_path


async def _fetch_motion_sfx(motion_id: str | None, tmp_dir: Path, name: str) -> Path | None:
    """Entry/exit one-shot stinger, resolved from whichever character's own
    entry/exit motion pick opens/closes the clip (see
    composite.resolve_entry_exit_motions) — no separate picker in the
    Studio UI. Admin uploads one 'sfx' asset per motion id (category=
    'slide', 'bounce', etc. — see animation_catalog.MOTIONS) via the
    existing Music & SFX admin form. None if no motion resolved (e.g. a
    0-character narrator clip), or no asset uploaded yet for that motion —
    the clip just renders without that stinger."""
    if not motion_id:
        return None
    asset = await db.get_audio_asset_by_category("sfx", motion_id)
    if not asset:
        return None
    return await _fetch_optional_asset(asset["gcs_path"], tmp_dir, name)
