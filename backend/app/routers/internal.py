import asyncio
import json
import shutil
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
from ..services.visual_qa import VisualQualityReviewer
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


LEASE_SECONDS = {"api": 3 * 60, "render": 3 * 60}
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


async def save_pipeline_artifacts(
    pool: asyncpg.Pool, project_id: UUID, attempt_id: UUID, lease_token: UUID,
    **artifacts: str,
) -> None:
    """Persist a stage artifact only while the same API attempt owns the project."""
    casts = {
        "story_plan": "::jsonb",
        "animation_program": "::jsonb",
        "audio_object": "",
        "timestamps_object": "",
    }
    if not artifacts or any(name not in casts for name in artifacts):
        raise ValueError("Unsupported or empty pipeline artifact update")

    columns = list(artifacts)
    values = [project_id, *[artifacts[name] for name in columns]]
    assignments = [
        f"{name}=${index + 2}{casts[name]}" for index, name in enumerate(columns)
    ]

    async with pool.acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow(
                "SELECT status FROM projects WHERE id=$1 FOR UPDATE", project_id,
            )
            attempt = await connection.fetchrow(
                """SELECT id FROM job_attempts
                   WHERE id=$1 AND project_id=$2 AND job_class='api'
                     AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                   FOR UPDATE""",
                attempt_id, project_id, lease_token,
            )
            if not project or project["status"] != "planning" or not attempt:
                raise asyncio.CancelledError("planning lease was lost before artifact persistence")
            await connection.execute(
                "INSERT INTO project_pipeline_artifacts(project_id) VALUES($1) ON CONFLICT(project_id) DO NOTHING",
                project_id,
            )
            await connection.execute(
                f"UPDATE project_pipeline_artifacts SET {', '.join(assignments)} WHERE project_id=$1",
                *values,
            )


async def assert_worker_lease(
    pool: asyncpg.Pool, project_id: UUID, attempt_id: UUID,
    lease_token: UUID, job_class: str,
) -> None:
    """Stop a stale worker before it persists another stage artifact."""
    owned = await pool.fetchval(
        """SELECT 1 FROM job_attempts
           WHERE id=$1 AND project_id=$2 AND job_class=$3 AND lease_token=$4
             AND status='running' AND lease_expires_at>now()""",
        attempt_id, project_id, job_class, lease_token,
    )
    if not owned:
        raise asyncio.CancelledError("worker lease is no longer current")


async def set_render_progress(
    pool: asyncpg.Pool, project_id: UUID, attempt_id: UUID,
    lease_token: UUID, progress: int,
) -> None:
    """Write render progress only while this exact attempt still owns the lease."""
    updated = await pool.fetchval(
        """UPDATE projects AS p SET progress=GREATEST(p.progress,$4)
           WHERE p.id=$1 AND p.status='rendering'
             AND EXISTS (
                 SELECT 1 FROM job_attempts AS j
                 WHERE j.id=$2 AND j.project_id=p.id AND j.job_class='render'
                   AND j.lease_token=$3 AND j.status='running'
                   AND j.lease_expires_at>now()
             )
           RETURNING p.id""",
        project_id, attempt_id, lease_token, progress,
    )
    if not updated:
        raise asyncio.CancelledError("render lease was lost while updating progress")


async def fail_project_in_transaction(
    connection: asyncpg.Connection, project_id: UUID, code: str, message: str,
) -> None:
    """Fail once and release the reservation exactly once; provider failures never burn user credits."""
    project = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
    if not project or project["status"] in {"complete", "cancelled", "failed"}:
        return
    release_key = f"project:{project_id}:v{project['credit_reservation_version']}:failure-release"
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
        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
           lease_expires_at=NULL,worker_region=NULL
           WHERE project_id=$1 AND status IN ('ready','leased','running')""",
        project_id,
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
    attempt_id: UUID,
    lease_token: UUID,
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
        should_skip = False
        skip_status = "not_found"
        project = None
        async with pool.acquire() as connection:
            async with connection.transaction():
                # Project first, then attempt: this is the same lock order used
                # by cancellation, retry reconciliation and finalization.
                project = await connection.fetchrow(
                    "SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id,
                )
                current_attempt = await connection.fetchrow(
                    """SELECT id FROM job_attempts
                       WHERE id=$1 AND project_id=$2 AND job_class='api'
                         AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, project_id, lease_token,
                )
                if not project:
                    should_skip, skip_status = True, "not_found"
                elif not current_attempt:
                    should_skip, skip_status = True, "stale_lease"
                elif project["status"] in {"cancelled", "failed"}:
                    should_skip, skip_status = True, project["status"]
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                elif project["status"] in {"rendering", "complete"}:
                    # Planning already committed its render job. A duplicate
                    # delivery must not regenerate the film or reset the queue.
                    should_skip, skip_status = True, project["status"]
                    await connection.execute(
                        """UPDATE job_attempts SET status='complete',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL,last_error=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                elif project["status"] in {"queued", "planning"}:
                    await connection.execute(
                        """UPDATE projects SET status='planning',progress=GREATEST(progress,12)
                           WHERE id=$1""",
                        project_id,
                    )
                else:
                    should_skip, skip_status = True, project["status"]
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
        if should_skip:
            logger.info("planning.delivery_skipped", extra={"status": skip_status})
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
                await save_pipeline_artifacts(
                    pool, project_id, attempt_id, lease_token,
                    story_plan=json.dumps(plan),
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
                    await assert_worker_lease(pool, project_id, attempt_id, lease_token, "api")
                    stage["shot_count"] = result.get("shot_count")
                    stage["source_chars"] = len(result.get("scene_js", ""))
                await save_pipeline_artifacts(
                    pool, project_id, attempt_id, lease_token,
                    animation_program=json.dumps(result),
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
                    await assert_worker_lease(pool, project_id, attempt_id, lease_token, "api")
                    if not audio_bytes:
                        raise RuntimeError("TTS returned empty narration audio")
                    prefix = f"projects/{project['user_id']}/{project_id}/audio"
                    audio_object, timestamps_object = await gather_cancel_on_error(
                        storage.upload_bytes_private(audio_bytes, "audio/mpeg", prefix, ".mp3"),
                        storage.upload_bytes_private(timestamp_bytes or b"[]", "application/json", prefix, ".json"),
                    )
                    try:
                        await save_pipeline_artifacts(
                            pool, project_id, attempt_id, lease_token,
                            audio_object=audio_object,
                            timestamps_object=timestamps_object,
                        )
                    except BaseException:
                        # These objects have not been committed to the artifact
                        # manifest, so clean up successful uploads if lease is lost.
                        await asyncio.gather(
                            storage.delete(audio_object),
                            storage.delete(timestamps_object),
                            return_exceptions=True,
                        )
                        raise
                    stage["audio_bytes"] = len(audio_bytes)
                    stage["timestamps_bytes"] = len(timestamp_bytes or b"[]")
                    stage["audio_object"] = audio_object
                    return audio_object, timestamps_object

            compiled_film, narration_objects = await gather_cancel_on_error(
                compile_animation(), synthesize_narration(),
            )
            audio_object, timestamps_object = narration_objects
            total_frames = int(project["duration_seconds"]) * 30
            compiled_scenes = [{
                "index": 0, "start_frame": 0, "end_frame": total_frames,
                "complexity": "heavy", "assigned_model": compiler.model,
                "scene_js": compiled_film["scene_js"], "style": compiled_film["style"],
                "quality_review": compiled_film.get("quality_review", {}),
                "shot_manifest": compiled_film.get("shot_manifest", []),
                "motion_diagnostics": compiled_film.get("motion_diagnostics", []),
                "visual_qa_context": compiled_film.get("visual_qa_context", {}),
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
                # Lock the project before the attempt (same order as cancellation
                # and watcher retries) so a cancelled or stale job cannot revive it.
                locked_project = await connection.fetchrow(
                    "SELECT status FROM projects WHERE id=$1 FOR UPDATE", project_id,
                )
                if not locked_project or locked_project["status"] in {"cancelled", "failed", "complete"}:
                    logger.info("planning.finalize_skipped", extra={
                        "status": locked_project["status"] if locked_project else "not_found",
                    })
                    return
                current_attempt = await connection.fetchrow(
                    """SELECT id FROM job_attempts
                       WHERE id=$1 AND project_id=$2 AND job_class='api'
                         AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, project_id, lease_token,
                )
                if not current_attempt:
                    logger.warning("planning.stale_attempt_at_finalize")
                    return
                if locked_project["status"] == "rendering":
                    await connection.execute(
                        """UPDATE job_attempts SET status='complete',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL,last_error=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                    return
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
                    """INSERT INTO job_attempts(project_id,job_class,status)
                       VALUES($1,'render','ready')
                       ON CONFLICT(project_id,job_class,pipeline_revision) DO NOTHING
                       RETURNING id""",
                    project_id,
                )
                if not render_attempt:
                    existing_render = await connection.fetchrow(
                        """SELECT id,status FROM job_attempts
                           WHERE project_id=$1 AND job_class='render' AND pipeline_revision='v1'""",
                        project_id,
                    )
                    if not existing_render:
                        raise RuntimeError("Render attempt could not be recovered")
                    if existing_render["status"] in {"failed", "cancelled", "complete"}:
                        render_attempt = await connection.fetchval(
                            """UPDATE job_attempts SET status='ready',attempts=0,due_at=now(),
                               lease_token=NULL,lease_expires_at=NULL,last_error=NULL,worker_region=NULL
                               WHERE id=$1 AND status IN ('failed','cancelled','complete') RETURNING id""",
                            existing_render["id"],
                        )
                        if not render_attempt:
                            raise RuntimeError("Render attempt changed while the project was being queued")
                    else:
                        render_attempt = existing_render["id"]
                updated_project = await connection.fetchval(
                    """UPDATE projects SET title=$2,narration_script=$3,audio_object=$4,
                       timestamps_object=$5,status='rendering',progress=38
                       WHERE id=$1 AND status IN ('queued','planning') RETURNING id""",
                    project_id, plan["title"][:76], plan["narration"], audio_object, timestamps_object,
                )
                if not updated_project:
                    raise RuntimeError("Project left the planning state before render was queued")
                await connection.execute(
                    "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'planned','api',38,$2::jsonb)",
                    project_id, json.dumps({"scene_count": len(plan["scenes"]), "render_program_count": len(compiled_scenes), "shot_count": compiled_film.get("shot_count", len(plan["scenes"])), "visual_style": compiled_film.get("style", "unknown"), "quality_review": compiled_film.get("quality_review", {}), "models": sorted({scene["assigned_model"] for scene in compiled_scenes})}),
                )
                completed_attempt = await connection.fetchval(
                    """UPDATE job_attempts SET status='complete',lease_token=NULL,
                       lease_expires_at=NULL,worker_region=NULL,last_error=NULL
                       WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id""",
                    attempt_id, lease_token,
                )
                if not completed_attempt:
                    raise RuntimeError("Planning lease was lost before commit")
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
    except asyncio.CancelledError:
        logger.warning("planning.cancelled_or_lease_lost")
        raise
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
        retry_delay = 0
        async with pool.acquire() as connection:
            async with connection.transaction():
                locked_project = await connection.fetchrow(
                    "SELECT status FROM projects WHERE id=$1 FOR UPDATE", project_id,
                )
                attempt_row = await connection.fetchrow(
                    """SELECT attempts,max_attempts FROM job_attempts
                       WHERE id=$1 AND lease_token=$2 AND project_id=$3
                         AND job_class='api' AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, lease_token, project_id,
                )
                if not attempt_row:
                    logger.warning("planning.failure_from_stale_attempt")
                    return
                if not locked_project or locked_project["status"] in {"cancelled", "complete", "failed"}:
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                    return
                is_final = attempt_row["attempts"] >= attempt_row["max_attempts"]
                if is_final:
                    await connection.execute(
                        """UPDATE job_attempts SET status='failed',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL,last_error=$3
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token, message,
                    )
                    await fail_project_in_transaction(connection, project_id, "planning_failed", message)
                else:
                    retry_delay = min(300, 30 * max(1, attempt_row["attempts"]))
                    await connection.execute(
                        """UPDATE job_attempts SET status='ready',due_at=now()+($3 * interval '1 second'),
                           lease_token=NULL,lease_expires_at=NULL,worker_region=NULL,last_error=$4
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token, retry_delay, message,
                    )
                    await connection.execute(
                        "UPDATE projects SET status='queued',progress=8 WHERE id=$1 AND status='planning'",
                        project_id,
                    )
                    await connection.execute(
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
        if retry_delay:
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
    attempt_id: UUID,
    lease_token: UUID,
    pool: asyncpg.Pool,
    renderer: DrawnByCodeRenderer,
    storage: ObjectStorage,
    emailer: ProjectReadyEmailer,
    visual_reviewer: VisualQualityReviewer,
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
    output_object: str | None = None
    qa_object: str | None = None
    output_committed = False
    try:
        project = None
        should_skip = False
        skip_status = "not_found"
        already_complete = False
        async with pool.acquire() as connection:
            async with connection.transaction():
                project = await connection.fetchrow(
                    "SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id,
                )
                current_attempt = await connection.fetchrow(
                    """SELECT id FROM job_attempts
                       WHERE id=$1 AND project_id=$2 AND job_class='render'
                         AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, project_id, lease_token,
                )
                if not project:
                    should_skip, skip_status = True, "not_found"
                elif not current_attempt:
                    should_skip, skip_status = True, "stale_lease"
                elif project["status"] in {"cancelled", "failed"}:
                    should_skip, skip_status = True, project["status"]
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                elif project["status"] == "complete":
                    already_complete = True
                elif project["status"] in {"queued", "rendering"}:
                    await connection.execute(
                        """UPDATE projects SET status='rendering',progress=GREATEST(progress,48)
                           WHERE id=$1""",
                        project_id,
                    )
                else:
                    should_skip, skip_status = True, project["status"]
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )

        if should_skip:
            logger.info("render.delivery_skipped", extra={"status": skip_status})
            return
        if already_complete:
            # A delivery replay must not render or settle again. The ready-email
            # helper is idempotent, so this also recovers a process crash after settlement.
            owner = await pool.fetchrow(
                "SELECT id,email,full_name FROM users WHERE id=$1", project["user_id"],
            )
            if owner and project["output_object"]:
                await emailer.send_project_ready(pool, dict(project), dict(owner))
            await finish_attempt(pool, attempt_id, lease_token, "complete")
            logger.info("render.already_complete")
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
            "shot_manifest": program.get("shot_manifest", []),
            "motion_diagnostics": program.get("motion_diagnostics", []),
            "visual_qa_context": program.get("visual_qa_context", {}),
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
        await set_render_progress(pool, project_id, attempt_id, lease_token, 52)

        # ── Run the Drawn-by-Code renderer subprocess ────────────────────
        output_path = Path(tempfile.mkdtemp(prefix="shortclipr-render-")) / f"{project_id}.mp4"

        async def update_visual_progress(render_progress: int) -> None:
            # Reserve 55–80 for the visual renderer; 82 means the subprocess
            # has fully completed and the mux stage is next.
            mapped = min(80, 55 + round(render_progress * 0.25))
            await set_render_progress(pool, project_id, attempt_id, lease_token, mapped)

        await set_render_progress(pool, project_id, attempt_id, lease_token, 55)
        motion_qa = None
        async with timed(logger, "render.subprocess") as ctx:
            _, motion_qa = await renderer.render(
                plan, output_path, progress_callback=update_visual_progress,
            )
            if output_path.exists():
                ctx["output_size_mb"] = round(output_path.stat().st_size / 1_048_576, 2)
            if motion_qa:
                ctx["motion_qa_status"] = motion_qa.get("status")
                ctx["motion_qa_samples"] = motion_qa.get("sample_count", 0)
        await set_render_progress(pool, project_id, attempt_id, lease_token, 82)

        # ── Mux narration after visuals ──────────────────────────────────
        async with timed(logger, "render.mux_audio") as ctx:
            ctx.update(await mux_narration(output_path, audio_path, project["duration_seconds"]))
        await set_render_progress(pool, project_id, attempt_id, lease_token, 86)

        # ── Quality validation ────────────────────────────────────────────
        async with timed(logger, "render.quality") as ctx:
            quality = await validate_final(output_path, project["aspect_ratio"], project["duration_seconds"])
            ctx.update(quality)
        if motion_qa:
            quality["motion_qa"] = {
                "status": motion_qa.get("status"),
                "sample_count": motion_qa.get("sample_count", 0),
                "samples": motion_qa.get("samples", []),
                "motion_diagnostics": plan.get("motion_diagnostics", []),
            }
            contact_sheet = Path(motion_qa["contact_sheet_path"]) if motion_qa.get("contact_sheet_path") else None
            if contact_sheet and contact_sheet.is_file():
                try:
                    qa_object = await storage.upload_file_private(
                        contact_sheet, "image/png",
                        f"projects/{project['user_id']}/{project_id}/motion-qa",
                    )
                    quality["motion_qa"]["contact_sheet_object"] = qa_object
                except Exception as error:
                    logger.warning("render.motion_qa.upload_failed", extra={
                        "project_id": str(project_id), "error": str(error)[:500],
                    })
                    quality["motion_qa"]["contact_sheet_upload_error"] = str(error)[:300]
                try:
                    async with timed(logger, "render.visual_qa") as ctx:
                        visual_review = await visual_reviewer.review(
                            contact_sheet,
                            plan.get("visual_qa_context", {}),
                            motion_qa.get("samples", []),
                        )
                        quality["visual_qa"] = visual_review
                        ctx["status"] = visual_review.get("status")
                        ctx["finding_count"] = len(visual_review.get("findings", []))
                        ctx["overall_score"] = visual_review.get("overall_score")
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    logger.warning("render.visual_qa.failed", extra={
                        "project_id": str(project_id), "error": str(error)[:500],
                    })
                    quality["visual_qa"] = {
                        "status": "unavailable",
                        "reason": "review_request_failed",
                        "error": str(error)[:300],
                        "automatic_repair": False,
                    }
            else:
                quality["visual_qa"] = {
                    "status": "skipped",
                    "reason": "contact_sheet_unavailable",
                    "automatic_repair": False,
                }
        await set_render_progress(pool, project_id, attempt_id, lease_token, 90)

        # ── Upload final MP4 to GCS ───────────────────────────────────────
        async with timed(logger, "render.upload") as ctx:
            output_object = await storage.upload_file_private(
                output_path, "video/mp4",
                f"projects/{project['user_id']}/{project_id}/final",
            )
            ctx["output_object"] = output_object
            ctx["size_mb"] = round(output_path.stat().st_size / 1_048_576, 2) if output_path.exists() else None
        await set_render_progress(pool, project_id, attempt_id, lease_token, 96)

        # ── Settle credits (idempotent) ───────────────────────────────────
        discard_output = False
        final_attempt_status = "complete"
        async with pool.acquire() as connection:
            async with connection.transaction():
                # Lock project before attempt, matching the cancellation and retry lock order.
                locked = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
                current_attempt = await connection.fetchrow(
                    """SELECT id FROM job_attempts
                       WHERE id=$1 AND project_id=$2 AND job_class='render'
                         AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, project_id, lease_token,
                )
                if not locked or locked["status"] in {"cancelled", "failed"} or not current_attempt:
                    discard_output = True
                    final_attempt_status = "cancelled"
                    logger.info("render.discard_stale_output", extra={"status": locked["status"] if locked else "not_found"})
                elif locked["credits_settled"] is not None or locked["status"] == "complete":
                    # A repeated delivery after completion must never render or charge twice.
                    discard_output = True
                    logger.warning("render.duplicate_delivery", extra={"output_object": output_object})
                else:
                    settled = locked["credits_reserved"]
                    await connection.execute(
                        "UPDATE projects SET status='complete',progress=100,output_object=$2,credits_settled=$3,completed_at=now() WHERE id=$1",
                        project_id, output_object, settled,
                    )
                    await connection.execute(
                        "UPDATE credit_accounts SET reserved_credits=GREATEST(0,reserved_credits-$2),spent_credits=spent_credits+$2 WHERE user_id=$1",
                        locked["user_id"], settled,
                    )
                    await connection.execute(
                        "INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key) VALUES($1,$2,'settle',$3,$4) ON CONFLICT DO NOTHING",
                        locked["user_id"], project_id, settled, f"project:{project_id}:v{locked['credit_reservation_version']}:settle",
                    )
                    await connection.execute(
                        "INSERT INTO project_events(project_id,event_type,stage,progress,payload) VALUES($1,'completed','render',100,$2::jsonb)",
                        project_id, json.dumps({"output_object": output_object, "quality": quality}),
                    )
                    completed_project = dict(locked)
                    completed_project["output_object"] = output_object
                    logger.info("render.settled", extra={"credits_settled": settled, "output_object": output_object})

        output_committed = completed_project is not None

        # ── Send delivery email ───────────────────────────────────────────
        if discard_output:
            await storage.delete(output_object)
            output_object = None
        elif completed_project:
            owner = await pool.fetchrow("SELECT id,email,full_name FROM users WHERE id=$1", completed_project["user_id"])
            if owner:
                async with timed(logger, "render.email") as ctx:
                    await emailer.send_project_ready(pool, completed_project, dict(owner))
                    ctx["email"] = owner["email"]

        await finish_attempt(pool, attempt_id, lease_token, final_attempt_status)
        total_ms = round((_time.monotonic() - t0_total) * 1000)
        logger.info(
            "render.complete",
            extra={
                "duration_ms": total_ms,
                "final_status": final_attempt_status,
                "output_object": output_object if not discard_output else None,
            },
        )
    except asyncio.CancelledError:
        logger.warning("render.cancelled_or_lease_lost")
        raise
    except Exception as error:
        total_ms = round((_time.monotonic() - t0_total) * 1000)
        message = str(error)[:1000]
        logger.error(
            "render.failed",
            extra={"duration_ms": total_ms, "error": message},
            exc_info=True,
        )
        retry_delay = 0
        attempt_row = None
        async with pool.acquire() as connection:
            async with connection.transaction():
                locked_project = await connection.fetchrow(
                    "SELECT status FROM projects WHERE id=$1 FOR UPDATE", project_id,
                )
                attempt_row = await connection.fetchrow(
                    """SELECT attempts,max_attempts FROM job_attempts
                       WHERE id=$1 AND project_id=$2 AND job_class='render'
                         AND lease_token=$3 AND status='running' AND lease_expires_at>now()
                       FOR UPDATE""",
                    attempt_id, project_id, lease_token,
                )
                if not attempt_row:
                    logger.warning("render.failure_from_stale_attempt")
                    return
                if not locked_project or locked_project["status"] in {"cancelled", "complete", "failed"}:
                    await connection.execute(
                        """UPDATE job_attempts SET status='cancelled',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token,
                    )
                    return
                is_final = (
                    isinstance(error, NonRetryableRenderError)
                    or attempt_row["attempts"] >= attempt_row["max_attempts"]
                )
                if is_final:
                    await connection.execute(
                        """UPDATE job_attempts SET status='failed',lease_token=NULL,
                           lease_expires_at=NULL,worker_region=NULL,last_error=$3
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token, message,
                    )
                    await fail_project_in_transaction(connection, project_id, "render_failed", message)
                else:
                    retry_delay = min(300, 30 * max(1, attempt_row["attempts"]))
                    await connection.execute(
                        """UPDATE job_attempts SET status='ready',
                           due_at=now()+($3 * interval '1 second'),
                           lease_token=NULL,lease_expires_at=NULL,worker_region=NULL,last_error=$4
                           WHERE id=$1 AND lease_token=$2""",
                        attempt_id, lease_token, retry_delay, message,
                    )
                    await connection.execute(
                        "UPDATE projects SET status='queued',progress=45 WHERE id=$1 AND status='rendering'",
                        project_id,
                    )
                    await connection.execute(
                        """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
                           VALUES($1,'retrying','render',45,$2::jsonb)""",
                        project_id,
                        json.dumps({
                            "attempt": attempt_row["attempts"],
                            "max_attempts": attempt_row["max_attempts"],
                            "retry_in_s": retry_delay,
                            "error": message[:240],
                        }),
                    )
        if retry_delay:
            logger.warning(
                "render.will_retry",
                extra={
                    "attempt": attempt_row["attempts"],
                    "max_attempts": attempt_row["max_attempts"],
                    "retry_in_s": retry_delay,
                    "error": message[:200],
                },
            )
    finally:
        if output_object and not output_committed:
            try:
                await storage.delete(output_object)
            except Exception:
                logger.exception("render.orphan_output_cleanup_failed", extra={"output_object": output_object})
        if qa_object and not output_committed:
            try:
                await storage.delete(qa_object)
            except Exception:
                logger.exception("render.orphan_motion_qa_cleanup_failed", extra={"qa_object": qa_object})
        if output_path:
            output_path.unlink(missing_ok=True)
            shutil.rmtree(output_path.parent, ignore_errors=True)
        if audio_path:
            audio_path.unlink(missing_ok=True)
            shutil.rmtree(audio_path.parent, ignore_errors=True)


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@api_router.post("/api-stage/run", status_code=status.HTTP_202_ACCEPTED)
async def api_stage(payload: InternalRunRequest, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    async with maintain_worker_lease(pool, payload.project_id, payload.attempt_id, payload.lease_token, "api") as owned:
        if not owned:
            return {"accepted": False, "reason": "stale_or_cancelled_lease"}
        planner: DeepSeekStoryPlanner = request.app.state.planner
        await run_planning(
            payload.project_id, payload.attempt_id, payload.lease_token, pool, planner,
            request.app.state.scene_compiler, request.app.state.speech, request.app.state.storage,
        )
    return {"completed": True, "projectId": str(payload.project_id)}


@ffmpeg_router.post("/ffmpeg-stage/run", status_code=status.HTTP_202_ACCEPTED)
async def render_stage(payload: InternalRunRequest, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    async with maintain_worker_lease(pool, payload.project_id, payload.attempt_id, payload.lease_token, "render") as owned:
        if not owned:
            return {"accepted": False, "reason": "stale_or_cancelled_lease"}
        await run_render(
            payload.project_id, payload.attempt_id, payload.lease_token,
            pool, request.app.state.renderer, request.app.state.storage, request.app.state.emailer,
            request.app.state.visual_reviewer,
        )
    return {"completed": True, "projectId": str(payload.project_id), "renderer": "drawn-by-code"}
