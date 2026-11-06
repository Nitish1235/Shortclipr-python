import asyncio
import json
import tempfile
from pathlib import Path
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..db import get_pool
from ..dependencies import internal_request
from ..models.schemas import InternalRunRequest
from ..services.openai_planner import OpenAIPlanner
from ..services.quality import validate_final
from ..services.renderer import RevideoRenderer
from ..services.scene_compiler import SceneCompiler
from ..services.storage import ObjectStorage
from ..services.email import ProjectReadyEmailer
from ..services.voices import UnrealSpeech


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


async def finish_attempt(pool: asyncpg.Pool, attempt_id: UUID | None, lease_token: UUID | None, final_status: str, error: str | None = None):
    if not attempt_id:
        return
    await pool.execute(
        "UPDATE job_attempts SET status=$3,lease_expires_at=NULL,last_error=$4 WHERE id=$1 AND ($2::uuid IS NULL OR lease_token=$2)",
        attempt_id, lease_token, final_status, error,
    )


async def fail_project(pool: asyncpg.Pool, project_id: UUID, code: str, message: str) -> None:
    """Fail once and release a reservation exactly once; provider failures never burn user credits."""
    async with pool.acquire() as connection:
        async with connection.transaction():
            project = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
            if not project or project["status"] in {"complete", "cancelled"}:
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


async def run_planning(
    project_id: UUID,
    attempt_id: UUID | None,
    lease_token: UUID | None,
    pool: asyncpg.Pool,
    planner: OpenAIPlanner,
    compiler: SceneCompiler,
    speech: UnrealSpeech,
    storage: ObjectStorage,
):
    try:
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", project_id)
        if not project or project["status"] == "cancelled":
            await finish_attempt(pool, attempt_id, lease_token, "cancelled")
            return
        await pool.execute("UPDATE projects SET status='planning',progress=12 WHERE id=$1", project_id)
        plan = await planner.plan(dict(project))
        limiter = asyncio.Semaphore(4)

        async def compile_one(scene: dict) -> dict:
            async with limiter:
                return await compiler.compile(dict(project), scene)

        compiled_scenes, narration_assets = await asyncio.gather(
            asyncio.gather(*(compile_one(scene) for scene in plan["scenes"])),
            speech.synthesize(plan["narration"], project["voice_id"]),
        )
        audio, timestamps = narration_assets
        prefix = f"projects/{project['user_id']}/{project_id}/audio"
        audio_object, timestamps_object = await asyncio.gather(
            storage.upload_bytes_private(audio, "audio/mpeg", prefix, ".mp3"),
            storage.upload_bytes_private(timestamps, "application/json", prefix, ".json"),
        )
        async with pool.acquire() as connection:
            async with connection.transaction():
                await connection.execute("DELETE FROM scene_plans WHERE project_id=$1", project_id)
                for scene in compiled_scenes:
                    await connection.execute(
                        """
                        INSERT INTO scene_plans(project_id,scene_index,start_frame,end_frame,complexity,assigned_model,program)
                        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
                        """,
                        project_id, scene["index"], scene["start_frame"], scene["end_frame"], scene["complexity"], scene["assigned_model"], json.dumps(scene),
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
                    project_id, json.dumps({"scene_count": len(compiled_scenes), "models": sorted({scene["assigned_model"] for scene in compiled_scenes})}),
                )
                await connection.execute("SELECT pg_notify('shortclipr_jobs',$1)", str(render_attempt))
        await finish_attempt(pool, attempt_id, lease_token, "complete")
    except Exception as error:
        message = str(error)[:1000]
        await fail_project(pool, project_id, "planning_failed", message)
        await finish_attempt(pool, attempt_id, lease_token, "failed", message)


async def run_render(project_id: UUID, attempt_id: UUID | None, lease_token: UUID | None, pool: asyncpg.Pool, renderer: RevideoRenderer, storage: ObjectStorage, emailer: ProjectReadyEmailer):
    output_path: Path | None = None
    completed_project: dict | None = None
    try:
        project = await pool.fetchrow("SELECT * FROM projects WHERE id=$1", project_id)
        if not project or project["status"] == "cancelled":
            await finish_attempt(pool, attempt_id, lease_token, "cancelled")
            return
        scenes = await pool.fetch("SELECT program FROM scene_plans WHERE project_id=$1 ORDER BY scene_index", project_id)
        if not scenes:
            raise RuntimeError("No planned scenes are available")
        await pool.execute("UPDATE projects SET status='rendering',progress=48 WHERE id=$1", project_id)
        plan = {
            "projectId": str(project_id),
            "title": project["title"],
            "narration": project["narration_script"] or "",
            "aspectRatio": project["aspect_ratio"],
            "fps": 30,
            "durationSeconds": project["duration_seconds"],
            "scenes": [decode_json_object(row["program"]) for row in scenes],
            "palette": {"background":"#171914","foreground":"#f2f0e7","accent":"#bdff32","secondary":"#c6b7ec"},
        }
        if project["audio_object"]:
            plan["audioPath"] = await storage.signed_url(project["audio_object"], minutes=60)
        output_path = Path(tempfile.mkdtemp(prefix="shortclipr-render-")) / f"{project_id}.mp4"
        await renderer.render(plan, output_path)
        quality = await validate_final(output_path, project["aspect_ratio"], project["duration_seconds"])
        output_object = await storage.upload_file_private(output_path, "video/mp4", f"projects/{project['user_id']}/{project_id}/final")
        discard_output = False
        final_attempt_status = "complete"
        async with pool.acquire() as connection:
            async with connection.transaction():
                locked = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
                if locked["status"] == "cancelled":
                    discard_output = True
                    final_attempt_status = "cancelled"
                elif locked["credits_settled"] is not None or locked["status"] == "complete":
                    # A retried delivery must never charge the same project twice.
                    discard_output = True
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
        if discard_output:
            await storage.delete(output_object)
        elif completed_project:
            owner = await pool.fetchrow("SELECT id,email,full_name FROM users WHERE id=$1", completed_project["user_id"])
            if owner:
                await emailer.send_project_ready(pool, completed_project, dict(owner))
        await finish_attempt(pool, attempt_id, lease_token, final_attempt_status)
    except Exception as error:
        message = str(error)[:1000]
        await fail_project(pool, project_id, "render_failed", message)
        await finish_attempt(pool, attempt_id, lease_token, "failed", message)
    finally:
        if output_path:
            output_path.unlink(missing_ok=True)
            try:
                output_path.parent.rmdir()
            except OSError:
                pass


@api_router.post("/api-stage/run", status_code=status.HTTP_202_ACCEPTED)
async def api_stage(payload: InternalRunRequest, request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    planner: OpenAIPlanner = request.app.state.planner
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
    await run_render(payload.project_id, payload.attempt_id, payload.lease_token, pool, request.app.state.renderer, request.app.state.storage, request.app.state.emailer)
    return {"completed": True, "projectId": str(payload.project_id), "renderer": "revideo"}
