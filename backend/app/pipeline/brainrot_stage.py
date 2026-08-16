"""
brainrot_stage.py — top-level pipeline entrypoint for the Brainrot Clips Maker,
dispatched by the watcher to POST /internal/brainrot-stage/run (see
app/api/internal.py), same shape as ffmpeg_stage.py::run_ffmpeg_stage.

Flow:
  1. Load the job row (payload JSONB written by POST /brainrot/jobs)
  2. generate_scene_plan() — AI dialogue timeline (brainrot_script.py)
  3. TTS every line in parallel (bounded concurrency), build a sequential
     timeline from the REAL audio durations (no interpolated timestamps)
  4. Download character assets + gameplay clip + music/SFX from GCS
  5. brainrot_composite.render() — one ffmpeg pass
  6. Upload the finished clip, mark the job complete

Phase 1 scope note: unlike ffmpeg_stage.py, this does not yet refund
reserved credits on failure (see plan_limits.py / jobs.py:211-341 for the
pattern to add once brainrot has its own credit cost model).
"""
import asyncio
import logging
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from app.db import supabase as db
from app.pipeline import brainrot_composite as composite
from app.pipeline import brainrot_script, tts, voice_catalog
from app.pipeline.uploader import download_to_file, upload_clip

logger = logging.getLogger(__name__)

BRAINROT_STAGE_TIMEOUT_SECONDS = 1500  # 25 minutes, same ceiling as ffmpeg_stage.py
TTS_CONCURRENCY = 5


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
        await db.fail_brainrot_job(job_id, "Script generation took too long.")
    except Exception as exc:
        logger.exception(f"[{job_id}] Brainrot API stage failed: {exc}")
        await db.fail_brainrot_job(job_id, _friendly_error(str(exc)))


async def run_brainrot_ffmpeg_stage(job_id: str) -> None:
    try:
        await asyncio.wait_for(
            _execute_brainrot_ffmpeg_stage(job_id),
            timeout=BRAINROT_STAGE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(f"[{job_id}] Brainrot FFmpeg stage timed out")
        await db.fail_brainrot_job(job_id, "Rendering took too long. Please try again with a shorter script.")
    except Exception as exc:
        logger.exception(f"[{job_id}] Brainrot FFmpeg stage failed: {exc}")
        await db.fail_brainrot_job(job_id, _friendly_error(str(exc)))


async def run_brainrot_stage(job_id: str) -> None:
    """
    Single-service pipeline: run API stage → check outcome → run FFmpeg stage.
    """
    await run_brainrot_api_stage(job_id)

    job = await db.get_brainrot_job(job_id)
    if not job or job.get("status") != "api_done":
        return

    await run_brainrot_ffmpeg_stage(job_id)


def _friendly_error(raw: str) -> str:
    r = (raw or "").lower()
    if "tts" in r or "unrealspeech" in r or "lemonfox" in r:
        return "Voice synthesis failed. Please try again."
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

        async with _step(job_id, "synthesize_voices"):
            await db.update_brainrot_job_progress(job_id, 30, "Synthesizing voices...", status="synthesizing_voice")
            timed_lines = await _synthesize_timeline(job_id, dialogue_lines, payload, tmp_dir)

        # The API stage is finished, save the plan and handoff
        await db.set_brainrot_scene_plan(
            job_id, [{"speaker": l.speaker, "text": l.text, "start": l.start, "end": l.end, "audio_url": l.audio_path} for l in timed_lines],
        )
        await db.set_job_api_done_brainrot(job_id)


async def _execute_brainrot_ffmpeg_stage(job_id: str) -> None:
    row = await db.get_brainrot_job(job_id)
    if not row:
        raise RuntimeError(f"Brainrot job {job_id} not found")
    payload = row["payload"]
    scene_plan = row.get("scene_plan") or []

    with tempfile.TemporaryDirectory(prefix=f"brainrot_{job_id}_") as tmp_dir_str:
        tmp_dir = Path(tmp_dir_str)

        # Hydrate timed_lines from the scene_plan
        timed_lines = []
        for i, line in enumerate(scene_plan):
            local_audio = tmp_dir / f"line_{i}.mp3"
            await download_to_file(line["audio_url"], local_audio)
            timed_lines.append(composite.TimedLine(
                speaker=line["speaker"], text=line["text"], start=line["start"], end=line["end"], audio_path=local_audio,
            ))

        # Prefer the REAL synthesized-audio length (sum of actual TTS clip
        # durations) over the nominal requested duration_seconds — the latter
        # is only an estimate used to size the script (see _target_lines()),
        # and is always truthy (clamped 5-120), so using it here would
        # silently truncate dialogue/captions mid-line whenever the real
        # audio runs longer than estimated.
        clip_duration = (timed_lines[-1].end if timed_lines else 0.0) or payload.get("duration_seconds", 30)

        async with _step(job_id, "fetch_assets"):
            await db.update_brainrot_job_progress(job_id, 50, "Downloading assets...", status="rendering")
            characters = await _fetch_characters(payload, tmp_dir)
            gameplay_path = await _fetch_gameplay_clip(payload, tmp_dir)
            music_path = await _fetch_optional_asset(payload.get("music_url"), tmp_dir, "music")
            intro_sfx_path = await _fetch_optional_asset(payload.get("intro_sfx_url"), tmp_dir, "intro_sfx")
            outro_sfx_path = await _fetch_optional_asset(payload.get("outro_sfx_url"), tmp_dir, "outro_sfx")

        async with _step(job_id, "composite_render"):
            await db.update_brainrot_job_progress(job_id, 60, "Rendering clip...", status="rendering")
            output_path = tmp_dir / "output.mp4"
            await composite.render(
                gameplay_clip_path=gameplay_path,
                lines=timed_lines,
                characters=characters,
                motion_mode=payload.get("motion_mode", "turn_based"),
                clip_duration=clip_duration,
                caption_style=payload.get("caption_style", "brainrot"),
                caption_color=payload.get("caption_color", "yellow_black"),
                output_path=output_path,
                music_path=music_path,
                music_volume=payload.get("music_volume", 0.3),
                intro_sfx=intro_sfx_path,
                outro_sfx=outro_sfx_path,
            )

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


async def _synthesize_timeline(
    job_id: str, dialogue_lines: list, payload: dict, tmp_dir: Path,
) -> list[composite.TimedLine]:
    """TTS every line (bounded concurrency), then lay them out sequentially —
    line N starts the instant line N-1's audio ends. This gives exact
    start/end timestamps straight from real audio duration, no interpolation."""
    provider = payload.get("tts_provider", "unrealspeech")
    voice_left = payload.get("voice_left", "")
    voice_right = payload.get("voice_right", "")
    sem = asyncio.Semaphore(TTS_CONCURRENCY)

    async def _synth_one(i: int, line):
        voice = voice_right if line.speaker == "right" else voice_left
        voice_entry = voice_catalog.get_voice(provider, voice) if voice else None
        locale = voice_entry.locale if voice_entry else "en-US"
        async with sem:
            audio_bytes, duration = await tts.synthesize(line.text, voice, provider, locale=locale)
        audio_path = tmp_dir / f"line_{i}.mp3"
        audio_path.write_bytes(audio_bytes)
        return duration, audio_path

    results = await asyncio.gather(*(_synth_one(i, l) for i, l in enumerate(dialogue_lines)))

    from app.pipeline.uploader import upload_tts_audio

    timed_lines: list[composite.TimedLine] = []
    cursor = 0.0
    for i, (line, (duration, audio_path)) in enumerate(zip(dialogue_lines, results)):
        start, end = cursor, cursor + duration
        audio_url = await upload_tts_audio(audio_path, job_id, f"line_{i}")
        timed_lines.append(composite.TimedLine(
            speaker=line.speaker, text=line.text, start=start, end=end, audio_path=audio_url,
        ))
        cursor = end
    logger.info(f"[{job_id}] Synthesized {len(timed_lines)} lines, total {cursor:.1f}s")
    return timed_lines


async def _fetch_characters(payload: dict, tmp_dir: Path) -> list[composite.CharacterPlacement]:
    positions = payload.get("character_positions", [])
    characters: list[composite.CharacterPlacement] = []
    for pos in positions:
        image_url = pos["image_url"]  # resolved by the API layer from GET /brainrot/characters
        local_path = tmp_dir / f"char_{pos['side']}.png"
        await download_to_file(image_url, local_path)
        characters.append(composite.CharacterPlacement(
            side=pos["side"], image_path=local_path,
            x=pos.get("x", 0.25 if pos["side"] == "left" else 0.75),
            y=pos.get("y", 0.75), scale=pos.get("scale", 1.0), rotation=pos.get("rotation", 0.0),
            entry=pos.get("entry", "slide"), exit=pos.get("exit", "slide"),
        ))
    return characters


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
