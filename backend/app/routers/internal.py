import asyncio
import json
import tempfile
import time as _time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..core.log import bind, get_logger, timed
from ..db import get_pool
from ..dependencies import internal_request
from ..models.schemas import InternalRunRequest
from ..services.deepseek_planner import DeepSeekStoryPlanner
from ..services.quality import mux_narration, validate_audio_input, validate_final
from ..services.drawn_by_code_renderer import DrawnByCodeRenderer, NonRetryableRenderError
from ..services.deepseek_animation import DeepSeekAnimationCompiler
from ..services.storage import ObjectStorage
from ..services.email import ProjectReadyEmailer
from ..services.voices import UnrealSpeech

logger = get_logger("shortclipr.internal")

api_router = APIRouter(prefix="/internal", tags=["internal-api-worker"], dependencies=[Depends(internal_request)])
ffmpeg_router = APIRouter(prefix="/internal", tags=["internal-ffmpeg-worker"], dependencies=[Depends(internal_request)])


def decode_json_object(value: object) -> dict:
    """asyncpg may return JSONB as either decoded data or a JSON string."""
    if isinstance(value, str):
        decoded = json.loads(value)
        if not isinstance(decoded, dict):
            raise ValueError("Scene program must be a JSON object")
        return decoded
    if isinstance(value, dict):
        return value
    return dict(value)  # type: ignore[arg-type]


LEASE_SECONDS = {"api": 6 * 60, "render": 28 * 60}
LEASE_HEARTBEAT_SECONDS = 15


@asynccontextmanager
async def maintain_worker_lease(
    pool: asyncpg.Pool, project_id: UUID, attempt_id: UUID, lease_token: UUID, job_class: str,
):
    """Keep a live worker's lease fresh; stale/cancelled deliveries stop doing work."""
    ttl_seconds = LEASE_SECONDS[job_class]

    async def renew() -> bool:
        value = await pool.fetchval(
            """UPDATE job_attempts
               SET lease_expires_at=now()+($5 * interval '1 second')
               WHERE id=$1 AND project_id=$2 AND job_class=$3 AND lease_token=$4
                 AND status='running' AND lease_expires_at>now()
               RETURNING id""",
            attempt_id, project_id, job_class, lease_token, ttl_seconds,
        )
        return value is not None

    if not await renew():
        yield False
        return

    owner_task = asyncio.current_task()

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(LEASE_HEARTBEAT_SECONDS)
            try:
                current = await renew()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("worker.lease_heartbeat_error", extra={
                    "job_class": job_class, "project_id": str(project_id),
                    "attempt_id": str(attempt_id),
                })
                continue
            if not current:
                logger.warning("worker.lease_lost", extra={
                    "job_class": job_class, "project_id": str(project_id),
                    "attempt_id": str(attempt_id),
                })
                if owner_task and not owner_task.done():
                    owner_task.cancel()
                return

    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        yield True
    finally:
        heartbeat_task.cancel()
        await asyncio.gather(heartbeat_task, return_exceptions=True)


async def finish_attempt(
    pool: asyncpg.Pool, attempt_id: UUID, lease_token: UUID,
    final_status: str, error: str | None = None,
) -> None:
    await pool.execute(
        """UPDATE job_attempts
           SET status=$3,lease_token=NULL,lease_expires_at=NULL,worker_region=NULL,last_error=$4
           WHERE id=$1 AND lease_token=$2 AND status IN ('leased','running')""",
        attempt_id, lease_token, final_status, error,
    )


async def fail_project_in_transaction(
    connection: asyncpg.Connection, project_id: UUID, code: str, message: str,
) -> None:
    """Fail once and release the reservation exactly once; provider failures never burn user credits."""
    project = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
    if not project or project["status"] in {"complete", "cancelled", "failed"}:
        return
    release_key = f"project:{project_id}:failure-release"
    release = await connection.fetchval(
        """INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key)
           VALUES($1,$2,'release',$3,$4) ON CONFLICT DO NOTHING RETURNING id""",
        project["user_id"], project_id, -project["credits_reserved"], release_key,
    )
    if release:
        await connection.execute(
            "UPDATE credit_accounts SET reserved_credits=GREATEST(0,reserved_credits-$2) WHERE user_id=$1",
            project["user_id"], project["credits_reserved"],
        )
    await connection.execute(
        "UPDATE projects SET status='failed',error_code=$2,error_message=$3 WHERE id=$1",
        project_id, code, message,
    )
    await connection.execute(
        "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'failed',$2,0,$3::jsonb)",
        project_id, code.split("_")[0], json.dumps({"code": code}),
    )


async def fail_project(pool: asyncpg.Pool, project_id: UUID, code: str, message: str) -> None:
    async with pool.acquire() as connection:
        async with connection.transaction():
            await fail_project_in_transaction(connection, project_id, code, message)


async def gather_cancel_on_error(*coroutines):
    """Do not leave provider/TTS requests running after a sibling stage fails."""
    tasks = [asyncio.create_task(coro) for coro in coroutines]
    try:
        return await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise


# ---------------------------------------------------------------------------
# Planning pipeline (api-worker)
# ---------------------------------------------------------------------------

async def run_planning(
    project_id: UUID,
    attempt_id: UUID | None,
    lease_token: UUID | None,
    pool: asyncpg.Pool,
    planner: DeepSeekStoryPlanner,
    compiler: DeepSeekAnimationCompiler,
    speech: UnrealSpeech,
    storage: ObjectStorage,
):
    t0_total = _time.monotonic()
    bind(
        project_id=str(project_id),
        attempt_id=str(attempt_id) if attempt_id else "",
        job_class="api",
    )
    try:
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", project_id)
        if not project or project["status"] == "cancelled":
            logger.info("planning.cancelled", extra={"status": project["status"] if project else "not_found"})
            await finish_attempt(pool, attempt_id, lease_token, "cancelled")
            return

        logger.info(
            "planning.start",
            extra={
                "clip_type": project["clip_type"],
                "duration_s": project["duration_seconds"],
                "aspect_ratio": project["aspect_ratio"],
                "voice_id": project["voice_id"],
            },
        )

        await pool.execute("UPDATE projects SET status='planning',progress=12 WHERE id=$1", project_id)

        # Load durable stage outputs first. A retry must not pay for stages that
        # already completed successfully on an earlier attempt.
        artifacts = await pool.fetchrow(
            "SELECT story_plan,animation_program,audio_object,timestamps_object FROM project_pipeline_artifacts WHERE project_id=$1",
            project_id,
        )
        artifacts = dict(artifacts) if artifacts else {}

        # ── Stage 1: story, narration script and timed shot plan ────────────
        async with timed(logger, "planning.deepseek_story") as ctx:
            plan_value = artifacts.get("story_plan")
            if isinstance(plan_value, str):
                plan = json.loads(plan_value)
            elif isinstance(plan_value, dict):
                plan = plan_value
            else:
                plan = await planner.plan(dict(project))
                await pool.execute(
                    """INSERT INTO project_pipeline_artifacts(project_id,story_plan)
                       VALUES($1,$2::jsonb)
                       ON CONFLICT(project_id) DO UPDATE SET story_plan=EXCLUDED.story_plan""",
                    project_id, json.dumps(plan),
                )
                logger.info("planning.artifact_saved", extra={"artifact":"story_plan"})
            ctx["scene_count"] = len(plan["scenes"])
            ctx["narration_chars"] = len(plan.get("narration", ""))
            ctx["title"] = plan.get("title", "")[:60]
            ctx["cache_hit"] = bool(artifacts.get("story_plan"))

        # ── Stage 2: animation code and narration audio (independent) ──────
        async with timed(logger, "planning.deepseek_animation_and_tts") as ctx:
            async def compile_animation():
                cached = artifacts.get("animation_program")
                if isinstance(cached, str):
                    cached = json.loads(cached)
                if isinstance(cached, dict) and isinstance(cached.get("scene_js"), str):
                    logger.info("planning.artifact_reused", extra={"artifact":"animation_program"})
                    return cached
                async with timed(logger, "planning.deepseek_animation") as stage:
                    result = await compiler.compile(dict(project), plan)
                    stage["shot_count"] = result.get("shot_count")
                    stage["source_chars"] = len(result.get("scene_js", ""))
                await pool.execute(
                    """INSERT INTO project_pipeline_artifacts(project_id,animation_program)
                       VALUES($1,$2::jsonb)
                       ON CONFLICT(project_id) DO UPDATE SET animation_program=EXCLUDED.animation_program""",
                    project_id, json.dumps(result),
                )
                logger.info("planning.artifact_saved", extra={"artifact":"animation_program"})
                return result

            async def synthesize_narration():
                cached_audio = artifacts.get("audio_object")
                cached_timestamps = artifacts.get("timestamps_object")
                if cached_audio and cached_timestamps:
                    logger.info("planning.artifact_reused", extra={"artifact":"narration_audio"})
                    return cached_audio, cached_timestamps
                async with timed(logger, "planning.tts") as stage:
                    audio_bytes, timestamp_bytes = await speech.synthesize(plan["narration"], project["voice_id"])
                    if not audio_bytes:
                        raise RuntimeError("TTS returned empty narration audio")
                    prefix = f"projects/{project['user_id']}/{project_id}/audio"
                    audio_object, timestamps_object = await asyncio.gather(
                        storage.upload_bytes_private(audio_bytes, "audio/mpeg", prefix, ".mp3"),
                        storage.upload_bytes_private(timestamp_bytes or b"[]", "application/json", prefix, ".json"),
                    )
                    await pool.execute(
                        """INSERT INTO project_pipeline_artifacts(project_id,audio_object,timestamps_object)
                           VALUES($1,$2,$3)
                           ON CONFLICT(project_id) DO UPDATE SET
                             audio_object=EXCLUDED.audio_object,
                             timestamps_object=EXCLUDED.timestamps_object""",
                        project_id, audio_object, timestamps_object,
                    )
                    stage["audio_bytes"] = len(audio_bytes)
                    stage["timestamps_bytes"] = len(timestamp_bytes or b"[]")
                    stage["audio_object"] = audio_object
                    return audio_object, timestamps_object

            compiled_film, narration_objects = await asyncio.gather(
                compile_animation(), synthesize_narration(),
            )
            audio_object, timestamps_object = narration_objects
            total_frames = int(project["duration_seconds"]) * 30
            compiled_scenes = [{
                "index": 0, "start_frame": 0, "end_frame": total_frames,
                "complexity": "heavy", "assigned_model": compiler.model,
                "scene_js": compiled_film["scene_js"], "style": compiled_film["style"],
                "quality_review": compiled_film.get("quality_review", {}),
            }]
            ctx["scene_count"] = len(plan["scenes"])
            ctx["render_programs"] = 1
            ctx["animation_model"] = compiler.model
            ctx["animation_source_chars"] = len(compiled_film["scene_js"])
            ctx["compiled_shot_count"] = compiled_film.get("shot_count", len(plan["scenes"]))
            ctx["visual_style"] = compiled_film.get("style", "unknown")
            ctx["quality_review"] = compiled_film.get("quality_review", {})
            ctx["audio_object"] = audio_object
            ctx["timestamps_object"] = timestamps_object
            ctx["audio_cached"] = bool(artifacts.get("audio_object"))

        # ── Persist scene plans + queue render job ─────────────────────────
        async with pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute("DELETE FROM scene_plans WHERE project_id=$1", project_id)
                for scene in compiled_scenes:
                    await connection.execute(
                        """
                        INSERT INTO scene_plans(project_id,scene_index,start_frame,end_frame,complexity,assigned_model,program)
                        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
                        """,
                        project_id, scene["index"], scene["start_frame"], scene["end_frame"],
                        scene["complexity"], scene["assigned_model"], json.dumps(scene),
                    )
                render_attempt = await connection.fetchval(
                    """
                    INSERT INTO job_attempts(project_id,job_class,status) VALUES($1,'render','ready')
                    ON CONFLICT(project_id,job_class,pipeline_revision) DO UPDATE SET status='ready',due_at=now()
                    RETURNING id
                    """,
                    project_id,
                )
                await connection.execute(
                    "UPDATE projects SET title=$2,narration_script=$3,audio_object=$4,timestamps_object=$5,status='rendering',progress=38 WHERE id=$1",
                    project_id, plan["title"][:76], plan["narration"], audio_object, timestamps_object,
                )
                await connection.execute(
                    "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'planned','api',38,$2::jsonb)",
                    project_id, json.dumps({"scene_count": len(plan["scenes"]), "render_program_count": len(compiled_scenes), "shot_count": compiled_film.get("shot_count", len(plan["scenes"])), "visual_style": compiled_film.get("style", "unknown"), "quality_review": compiled_film.get("quality_review", {}), "models": sorted({scene["assigned_model"] for scene in compiled_scenes})}),
                )
                await connection.execute("SELECT pg_notify('shortclipr_jobs',$1)", str(render_attempt))

        total_ms = round((_time.monotonic() - t0_total) * 1000)
        logger.info(
            "planning.complete",
            extra={
                "duration_ms": total_ms,
                "scene_count": len(compiled_scenes),
                "render_attempt_id": str(render_attempt),
                "audio_object": audio_object,
            },
        )
        await finish_attempt(pool, attempt_id, lease_token, "complete")

    except Exception as error:
        total_ms = round((_time.monotonic() - t0_total) * 1000)
        message = str(error)[:1000]
        logger.error(
            "planning.failed",
            extra={"duration_ms": total_ms, "error": message},
            exc_info=True,
        )
        # Match render-stage retry semantics: transient provider failures must
        # not immediately fail the project or release the user's reservation.
        attempt_row = (
            await pool.fetchrow("SELECT attempts, max_attempts FROM job_attempts WHERE id=$1", attempt_id)
            if attempt_id else None
        )
        is_final = not attempt_row or attempt_row["attempts"] >= attempt_row["max_attempts"]
        if is_final:
            await fail_project(pool, project_id, "planning_failed", message)
            await finish_attempt(pool, attempt_id, lease_token, "failed", message)
        else:
            retry_delay = min(300, 30 * max(1, attempt_row["attempts"]))
            if attempt_id:
                await pool.execute(
                    """UPDATE job_attempts
                       SET status='ready', due_at=now()+($3 * interval '1 second'),
                           lease_token=NULL, lease_expires_at=NULL, last_error=$4
                       WHERE id=$1 AND lease_token=$2""",
                    attempt_id, lease_token, retry_delay, message[:1000],
                )
            await pool.execute(
                "UPDATE projects SET status='queued',progress=8 WHERE id=$1 AND status='planning'",
                project_id,
            )
            await pool.execute(
                """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
                   VALUES($1,'retrying','api',8,$2::jsonb)""",
                project_id,
                json.dumps({
                    "attempt": attempt_row["attempts"],
                    "max_attempts": attempt_row["max_attempts"],
                    "retry_in_s": retry_delay,
                    "error": message[:240],
                }),
            )
            logger.warning(
                "planning.will_retry",
                extra={
                    "attempt": attempt_row["attempts"],
                    "max_attempts": attempt_row["max_attempts"],
                    "retry_in_s": retry_delay,
                    "error": message[:240],
                },
            )


# ---------------------------------------------------------------------------
# Render pipeline (ffmpeg-worker)
# ---------------------------------------------------------------------------

async def run_render(
    project_id: UUID,
    attempt_id: UUID | None,
    lease_token: UUID | None,
    pool: asyncpg.Pool,
    renderer: DrawnByCodeRenderer,
    storage: ObjectStorage,
    emailer: ProjectReadyEmailer,
):
    t0_total = _time.monotonic()
    bind(
        project_id=str(project_id),
        attempt_id=str(attempt_id) if attempt_id else "",
        job_class="render",
    )
    output_path: Path | None = None
    audio_path: Path | None = None
    completed_project: dict | None = None
    try:
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", project_id)
        if not project or project["status"] == "cancelled":
            logger.info("render.cancelled", extra={"status": project["status"] if project else "not_found"})
            await finish_attempt(pool, attempt_id, lease_token, "cancelled")
            return

        scenes = await pool.fetch("SELECT program FROM scene_plans WHERE project_id=$1 ORDER BY scene_index", project_id)
        if not scenes:
            raise RuntimeError("No planned scenes are available — did planning complete?")

        logger.info(
            "render.start",
            extra={
                "scene_count": len(scenes),
                "aspect_ratio": project["aspect_ratio"],
                "duration_s": project["duration_seconds"],
                "has_audio": bool(project["audio_object"]),
            },
        )

        await pool.execute("UPDATE projects SET status='rendering',progress=48 WHERE id=$1", project_id)

        program = decode_json_object(scenes[0]["program"])
        scene_js = program.get("scene_js")
        if not isinstance(scene_js, str) or not scene_js:
            raise NonRetryableRenderError("Persisted Drawn-by-Code animation program is missing scene_js")
        plan = {
            "projectId": str(project_id), "title": project["title"],
            "narration": project["narration_script"] or "",
            "aspectRatio": project["aspect_ratio"], "fps": 30,
            "durationSeconds": project["duration_seconds"],
            "scene_js": scene_js, "style": program.get("style", "paper-cutout"),
        }

        # ── Download narration locally for renderer ───────────────────────
        if project["audio_object"]:
            async with timed(logger, "render.download_audio") as ctx:
                audio_path = Path(tempfile.mkdtemp(prefix="shortclipr-audio-")) / "narration.mp3"
                await storage.download_private(project["audio_object"], audio_path)
                ctx["audio_object"] = project["audio_object"]
                ctx["size_bytes"] = audio_path.stat().st_size if audio_path.exists() else 0
            async with timed(logger, "render.validate_audio") as ctx:
                ctx.update(await validate_audio_input(audio_path))
        else:
            raise RuntimeError("Narration audio is not available for this render")
        await pool.execute("UPDATE projects SET progress=52 WHERE id=$1 AND status='rendering'", project_id)

        # ── Run the Remotion renderer subprocess ─────────────────────────
        output_path = Path(tempfile.mkdtemp(prefix="shortclipr-render-")) / f"{project_id}.mp4"

        async def update_visual_progress(render_progress: int) -> None:
            # Reserve 55–80 for the visual renderer; 82 means the subprocess
            # has fully completed and the mux stage is next.
            mapped = min(80, 55 + round(render_progress * 0.25))
            await pool.execute(
                "UPDATE projects SET progress=GREATEST(progress,$2) WHERE id=$1 AND status='rendering'",
                project_id, mapped,
            )

        await pool.execute("UPDATE projects SET progress=55 WHERE id=$1 AND status='rendering'", project_id)
        async with timed(logger, "render.subprocess") as ctx:
            await renderer.render(plan, output_path, progress_callback=update_visual_progress)
            if output_path.exists():
                ctx["output_size_mb"] = round(output_path.stat().st_size / 1_048_576, 2)
        await pool.execute("UPDATE projects SET progress=82 WHERE id=$1 AND status='rendering'", project_id)

        # ── Mux narration after visuals ──────────────────────────────────
        async with timed(logger, "render.mux_audio") as ctx:
            ctx.update(await mux_narration(output_path, audio_path, project["duration_seconds"]))
        await pool.execute("UPDATE projects SET progress=86 WHERE id=$1 AND status='rendering'", project_id)

        # ── Quality validation ────────────────────────────────────────────
        async with timed(logger, "render.quality") as ctx:
            quality = await validate_final(output_path, project["aspect_ratio"], project["duration_seconds"])
            ctx.update(quality)
        await pool.execute("UPDATE projects SET progress=90 WHERE id=$1 AND status='rendering'", project_id)

        # ── Upload final MP4 to GCS ───────────────────────────────────────
        async with timed(logger, "render.upload") as ctx:
            output_object = await storage.upload_file_private(
                output_path, "video/mp4",
                f"projects/{project['user_id']}/{project_id}/final",
            )
            ctx["output_object"] = output_object
            ctx["size_mb"] = round(output_path.stat().st_size / 1_048_576, 2) if output_path.exists() else None
        await pool.execute("UPDATE projects SET progress=96 WHERE id=$1 AND status='rendering'", project_id)

        # ── Settle credits (idempotent) ───────────────────────────────────
        discard_output = False
        final_attempt_status = "complete"
        async with pool.acquire() as connection:
            async with connection.transaction():
                locked = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
                if locked["status"] == "cancelled":
                    discard_output = True
                    final_attempt_status = "cancelled"
                    logger.info("render.cancelled_post_render", extra={"output_object": output_object})
                elif locked["credits_settled"] is not None or locked["status"] == "complete":
                    # A retried delivery must never charge the same project twice.
                    discard_output = True
                    logger.warning("render.duplicate_delivery", extra={"output_object": output_object})
                else:
                    settled = locked["credits_reserved"]
                    await connection.execute(
                        "UPDATE projects SET status='complete',progress=100,output_object=$2,credits_settled=$3,completed_at=now() WHERE id=$1",
                        project_id, output_object, settled,
                    )
                    await connection.execute(
                        "UPDATE credit_accounts SET reserved_credits=reserved_credits-$2,spent_credits=spent_credits+$2 WHERE user_id=$1",
                        locked["user_id"], settled,
                    )
                    await connection.execute(
                        "INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key) VALUES($1,$2,'settle',$3,$4) ON CONFLICT DO NOTHING",
                        locked["user_id"], project_id, settled, f"project:{project_id}:settle",
                    )
                    await connection.execute(
                        "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'completed','render',100,$2::jsonb)",
                        project_id, json.dumps({"output_object": output_object, "quality": quality}),
                    )
                    completed_project = dict(locked)
                    completed_project["output_object"] = output_object
                    logger.info("render.settled", extra={"credits_settled": settled, "output_object": output_object})

        # ── Send delivery email ───────────────────────────────────────────
        if discard_output:
            await storage.delete(output_object)
        elif completed_project:
            owner = await pool.fetchrow("SELECT id,email,full_name FROM users WHERE id=$1", completed_project["user_id"])
            if owner:
                async with timed(logger, "render.email") as ctx:
                    await emailer.send_project_ready(pool, completed_project, dict(owner))
                    ctx["email"] = owner["email"]

        total_ms = round((_time.monotonic() - t0_total) * 1000)
        logger.info(
            "render.complete",
            extra={
                "duration_ms": total_ms,
                "final_status": final_attempt_status,
                "output_object": output_object if not discard_output else None,
            },
        )
        await finish_attempt(pool, attempt_id, lease_token, final_attempt_status)

    except Exception as error:
        total_ms = round((_time.monotonic() - t0_total) * 1000)
        message = str(error)[:1000]
        logger.error(
            "render.failed",
            extra={"duration_ms": total_ms, "error": message},
            exc_info=True,
        )
        # Only permanently fail the project once all watcher retries are
        # exhausted (attempts >= max_attempts). For earlier failures, mark
        # the job_attempt as failed so the watcher can schedule the next
        # attempt without immediately burning the user's credits.
        attempt_row = (
            await pool.fetchrow("SELECT attempts, max_attempts FROM job_attempts WHERE id=$1", attempt_id)
            if attempt_id else None
        )
        is_final = (
            isinstance(error, NonRetryableRenderError)
            or not attempt_row
            or attempt_row["attempts"] >= attempt_row["max_attempts"]
        )
        if is_final:
            await fail_project(pool, project_id, "render_failed", message)
            await finish_attempt(pool, attempt_id, lease_token, "failed", message)
        else:
            # Non-final failure — requeue with exponential back-off so the
            # watcher can dispatch it again without user intervention.
            retry_delay = min(300, 30 * (attempt_row["attempts"] if attempt_row else 1))
            logger.warning(
                "render.will_retry",
                extra={
                    "attempt": attempt_row["attempts"] if attempt_row else "?",
                    "max_attempts": attempt_row["max_attempts"] if attempt_row else "?",
                    "retry_in_s": retry_delay,
                    "error": message[:200],
                },
            )
            if attempt_id:
                await pool.execute(
                    """UPDATE job_attempts
                       SET status='ready', due_at=now()+($3 * interval '1 second'),
                           lease_token=NULL, lease_expires_at=NULL, last_error=$4
                       WHERE id=$1 AND lease_token=$2""",
                    attempt_id, lease_token, retry_delay, message[:1000],
                )
            # Keep the durable project state aligned with the retry queue.
            # Otherwise the UI remains at the last render milestone (usually
            # 48%) while the job is waiting for its next attempt.
            await pool.execute(
                "UPDATE projects SET status='queued',progress=45 WHERE id=$1 AND status='rendering'",
                project_id,
            )
            await pool.execute(
                """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
                   VALUES($1,'retrying','render',45,$2::jsonb)""",
                project_id,
                json.dumps({"attempt": attempt_row["attempts"], "max_attempts": attempt_row["max_attempts"], "retry_in_s": retry_delay}),
            )
    finally:
        if output_path:
            output_path.unlink(missing_ok=True)
            try:
                output_path.parent.rmdir()
            except OSError:
                pass
        if audio_path:
            audio_path.unlink(missing_ok=True)
            try:
                audio_path.parent.rmdir()
            except OSError:
                pass


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@api_router.post("/api-stage/run", status_code=status.HTTP_202_ACCEPTED)
async def api_stage(payload: InternalRunRequest, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    planner: DeepSeekStoryPlanner = request.app.state.planner
    await run_planning(
        payload.project_id, payload.attempt_id, payload.lease_token, pool, planner,
        request.app.state.scene_compiler, request.app.state.speech, request.app.state.storage,
    )
    return {"completed": True, "projectId": str(payload.project_id)}


@ffmpeg_router.post("/ffmpeg-stage/run", status_code=status.HTTP_202_ACCEPTED)
async def render_stage(payload: InternalRunRequest, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    project = await pool.fetchrow("SELECT id,status FROM projects WHERE id=$1", payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project["status"] == "cancelled":
        return {"accepted": False, "reason": "cancelled"}
    await pool.execute("UPDATE projects SET status='rendering',progress=45 WHERE id=$1", payload.project_id)
    await run_render(
        payload.project_id, payload.attempt_id, payload.lease_token,
        pool, request.app.state.renderer, request.app.state.storage, request.app.state.emailer,
    )
    return {"completed": True, "projectId": str(payload.project_id), "renderer": "drawn-by-code"}
