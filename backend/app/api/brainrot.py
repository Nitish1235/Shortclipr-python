"""
brainrot.py — /brainrot endpoints for the Brainrot Clips Maker.

POST /brainrot/jobs               — validate → resolve assets → INSERT job → dispatch
GET  /brainrot/jobs/{job_id}      — single job (create flow's live status polling)
GET  /brainrot/jobs               — list user's jobs (unfiltered, uncapped-by-status)
GET  /brainrot/clips              — Studio "My clips" library: status filter + pagination + tab counts
GET  /brainrot/characters         — the 105-character roster (from GCS, see brainrot_characters.py)
GET  /brainrot/gameplay-clips     — selectable gameplay backgrounds (optional ?category=)
GET  /brainrot/audio-assets       — music/SFX library (optional ?type=music|sfx)
GET  /brainrot/admin/jobs         — admin: brainrot jobs across all users (parallel to /admin/jobs)
POST /brainrot/admin/gameplay-clips/direct — admin: register an already-final clip, NO processing

Same dispatch-mode split as jobs.py: split-worker mode (FFMPEG_WORKER_URLS
configured) inserts as 'created' and relies on the watcher's poll loop
(watcher/dispatcher.py::process_one_brainrot_job) — no pg_notify channel was
added for brainrot in Phase 1, so dispatch latency is bounded by
config.POLL_INTERVAL rather than instant. Single-service mode (no worker
URLs) runs the stage in-process via asyncio.create_task, same as jobs.py.
"""
import asyncio
import logging
import random
import re
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from pydantic import BaseModel, field_validator

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.brainrot_characters import get_character_by_id, get_character_roster
from app.pipeline.brainrot_stage import run_brainrot_api_stage, run_brainrot_confirm_stage, run_brainrot_full_auto
from app.pipeline.animation_catalog import DEFAULT_ENTRY, DEFAULT_EXIT, MOTIONS, valid_motion
from app.pipeline.captions import VALID_COLORS, VALID_STYLES
from app.pipeline.voice_catalog import SAMPLE_TEXT, default_voice_for_gender, list_voices

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Kill switch ──────────────────────────────────────────────────
# Brainrot is fully offline for now — every route on this router
# (including /brainrot/admin/*) rejects with 503. Flip to False to bring
# it back; nothing else needs to change. Matching flag on the frontend:
# src/App.jsx's BRAINROT_OFFLINE (blocks the routes/links; this flag only
# blocks the API — flip both together, since one without the other leaves
# either a dead UI in front of a live API, or a working UI whose every
# call 503s).
BRAINROT_OFFLINE = True


def _check_brainrot_offline() -> None:
    if BRAINROT_OFFLINE:
        raise HTTPException(status_code=503, detail="Brainrot is temporarily unavailable.")


router = APIRouter(prefix="/brainrot", tags=["brainrot"], dependencies=[Depends(_check_brainrot_offline)])

VALID_MOTION_MODES = ["turn_based", "always_on"]
DEFAULT_CAPTION_STYLE = "brainrot"
DEFAULT_CAPTION_COLOR = "yellow_black"
DEFAULT_CAPTION_Y = 0.82

# Statuses shown as "rendering" in the Studio — mirrors the frontend's
# ACTIVE_STATUSES in BrainrotStudio.jsx. Keep both lists in sync.
# 'awaiting_review' is deliberately included: a job sitting in the script
# review screen is still "in progress" from the user's perspective (and
# still counts against MAX_CONCURRENT_BRAINROT_JOBS_PER_USER via
# count_active_brainrot_jobs's status NOT IN ('complete','failed') check),
# even though nothing is actively running server-side while they read/edit.
ACTIVE_JOB_STATUSES = {"created", "generating_script", "awaiting_review", "synthesizing_voice", "rendering"}
# Generous recent-history window for the /clips endpoint — see
# list_brainrot_clips_source. A single user realistically has dozens, not
# thousands, of brainrot jobs, so this comfortably covers real usage while
# keeping status filtering/counts in Python next to _serialize_brainrot_job.
CLIPS_FETCH_CAP = 300


# ── Request schema ──────────────────────────────────────────────

class CharacterPosition(BaseModel):
    character_id: str
    side: str          # "left" | "right" — assigned by the frontend when the
                        # user places a character; for character_count==1 it's
                        # always "left".
    x: float = 0.25
    y: float = 0.78
    scale: float = 1.0
    rotation: float = 0.0
    entry: str = DEFAULT_ENTRY   # entry motion id (see GET /brainrot/animations)
    exit: str = DEFAULT_EXIT     # exit motion id

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        return v if v in ("left", "right") else "left"

    @field_validator("entry")
    @classmethod
    def validate_entry(cls, v: str) -> str:
        return valid_motion(v, DEFAULT_ENTRY)

    @field_validator("exit")
    @classmethod
    def validate_exit(cls, v: str) -> str:
        return valid_motion(v, DEFAULT_EXIT)

    @field_validator("x", "y")
    @classmethod
    def clamp_unit(cls, v: float) -> float:
        return max(0.0, min(1.0, v))

    @field_validator("scale")
    @classmethod
    def clamp_scale(cls, v: float) -> float:
        return max(0.3, min(2.0, v))


class BrainrotJobOptions(BaseModel):
    script_input: str
    character_positions: list[CharacterPosition] = []
    gameplay_clip_id: str
    duration_seconds: int = 30
    caption_style: str = DEFAULT_CAPTION_STYLE
    caption_color: str = DEFAULT_CAPTION_COLOR
    caption_y: float = DEFAULT_CAPTION_Y   # 0=top, 1=bottom — the "Caption position" slider
    voice_left: str = ""
    voice_right: str = ""
    motion_mode: str = "turn_based"
    music_asset_id: str | None = None
    music_volume: float = 0.3
    post_title: str = ""
    post_hashtags: list[str] = []

    @field_validator("character_positions")
    @classmethod
    def max_two_characters(cls, v: list[CharacterPosition]) -> list[CharacterPosition]:
        # Hard cap = 2 (see the original product spec: "I wouldn't allow 3+
        # initially"). Clamp rather than reject, same philosophy as jobs.py's
        # JobOptions validators.
        return v[:2]

    @field_validator("duration_seconds")
    @classmethod
    def clamp_duration(cls, v: int) -> int:
        return max(5, min(120, v))

    @field_validator("caption_style")
    @classmethod
    def validate_caption_style(cls, v: str) -> str:
        return v if v in VALID_STYLES else DEFAULT_CAPTION_STYLE

    @field_validator("caption_color")
    @classmethod
    def validate_caption_color(cls, v: str) -> str:
        return v if v in VALID_COLORS else DEFAULT_CAPTION_COLOR

    @field_validator("caption_y")
    @classmethod
    def clamp_caption_y(cls, v: float) -> float:
        return max(0.0, min(1.0, v))

    @field_validator("motion_mode")
    @classmethod
    def validate_motion_mode(cls, v: str) -> str:
        return v if v in VALID_MOTION_MODES else "turn_based"

    @field_validator("music_volume")
    @classmethod
    def clamp_music_volume(cls, v: float) -> float:
        return max(0.2, min(0.6, v))


class CreateBrainrotJobRequest(BaseModel):
    options: BrainrotJobOptions


# ── POST /brainrot/jobs ─────────────────────────────────────────

@router.post("/jobs", status_code=201)
async def create_brainrot_job(body: CreateBrainrotJobRequest, current_user: CurrentUser):
    opts = body.options

    if not opts.script_input.strip():
        raise HTTPException(status_code=400, detail="script_input is required")

    active = await db.count_active_brainrot_jobs(current_user.user_id)
    if active >= settings.MAX_CONCURRENT_BRAINROT_JOBS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail="You already have a brainrot clip generating. Wait for it to finish before starting another.",
        )

    recent = await db.count_recent_brainrot_jobs(current_user.user_id, datetime.now(timezone.utc) - timedelta(hours=1))
    if recent >= settings.MAX_BRAINROT_JOBS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail=f"Only {settings.MAX_BRAINROT_JOBS_PER_HOUR} brainrot clips allowed per hour. Try again in a bit.",
        )

    # Resolve character ids -> canon image URLs. Enforces "sides are locked at
    # selection time" implicitly: the frontend sends one entry per side, so
    # there's no way to submit the same character twice or reassign a side.
    character_positions: list[dict] = []
    gender_by_side: dict[str, str] = {}
    for pos in opts.character_positions:
        character = await get_character_by_id(pos.character_id)
        if character is None:
            raise HTTPException(status_code=404, detail=f"Unknown character_id: {pos.character_id}")
        character_positions.append({
            "character_id": pos.character_id, "side": pos.side,
            "x": pos.x, "y": pos.y, "scale": pos.scale, "rotation": pos.rotation,
            "entry": pos.entry, "exit": pos.exit,
            "image_url": character["image_url"],
            "gender": character.get("gender", "neutral"),
            # Personality profile — fed to the dialogue writer so each side
            # speaks in-character (see brainrot_script.py).
            "name": character.get("name", ""),
            "archetype": character.get("archetype", ""),
            "role": character.get("role", ""),
            "voice": character.get("voice", ""),
        })
        gender_by_side[pos.side] = character.get("gender", "neutral")
    sides = {p["side"] for p in character_positions}
    if len(character_positions) == 2 and len(sides) != 2:
        raise HTTPException(status_code=400, detail="Two characters must be on different sides (left + right)")

    # Auto-assign a fitting voice per side when the user didn't pick one:
    # match the character's gender (female character -> female voice, etc.),
    # drawn from the FULL combined catalog (UnrealSpeech + Lemonfox, shown
    # to the user as one flat list with no provider distinction) so two
    # same-gender characters get genuinely different defaults instead of
    # rotating within a single 5-voice provider subset. slot rotates
    # left=0/right=1 so two same-gender characters differ. With no character
    # on a side (0-char narrator clips), fall back to a neutral voice so the
    # narrator still has a defined voice.
    voice_left = opts.voice_left
    if not voice_left:
        voice_left = default_voice_for_gender(gender_by_side.get("left", "neutral"), slot=0).voice_id
    voice_right = opts.voice_right
    if not voice_right and "right" in gender_by_side:
        voice_right = default_voice_for_gender(gender_by_side["right"], slot=1).voice_id

    gameplay_clip = await db.get_gameplay_clip(opts.gameplay_clip_id)
    if gameplay_clip is None:
        raise HTTPException(status_code=404, detail="Unknown gameplay_clip_id")

    music_url = None
    if opts.music_asset_id:
        music_asset = await db.get_audio_asset(opts.music_asset_id)
        if music_asset is None:
            raise HTTPException(status_code=404, detail="Unknown music_asset_id")
        music_url = music_asset["gcs_path"]
        logger.info(f"Brainrot job music: asset_id={opts.music_asset_id} name={music_asset.get('name')!r} url={music_url}")
    else:
        logger.info("Brainrot job music: none selected (music_asset_id was empty)")

    # No credit reservation here anymore — the user hasn't seen a script
    # yet, let alone approved one, so nothing billable has happened. The
    # credit is reserved at CONFIRM time instead (POST .../confirm below),
    # once they've actually accepted the dialogue. reserved_credits starts
    # at 0 and _fail_and_refund's refund-if-positive check makes a script-
    # stage failure a no-op on the credit side by construction.
    payload = {
        "reserved_credits": 0,
        "script_input": opts.script_input.strip(),
        "character_ids": [p["character_id"] for p in character_positions],
        "character_positions": character_positions,
        "gameplay_clip_id": opts.gameplay_clip_id,
        "gameplay_clip_url": gameplay_clip["gcs_path"],
        "duration_seconds": opts.duration_seconds,
        "caption_style": opts.caption_style,
        "caption_color": opts.caption_color,
        "caption_y": opts.caption_y,
        "voice_left": voice_left,
        "voice_right": voice_right,
        "motion_mode": opts.motion_mode,
        "music_asset_id": opts.music_asset_id,
        "music_volume": opts.music_volume,
        "music_url": music_url,
        "post_title": opts.post_title.strip(),
        "post_hashtags": opts.post_hashtags,
    }

    # No reservation to unwind on an insert failure anymore — nothing was
    # reserved yet (see the comment above), so this can just raise straight
    # through instead of the old try/except release-then-reraise dance.
    row = await db.insert_brainrot_job(current_user.user_id, payload)
    job_id = str(row["job_id"])

    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        # No pg_notify channel for brainrot yet (Phase 1 simplification) —
        # the watcher's poll loop picks up 'created' rows on its own cadence.
        logger.info(f"[{job_id}] Brainrot job created — queued for watcher poll pickup")
    else:
        # Claim the row for in-process dispatch BEFORE firing the background
        # task, synchronously, in this same request. The watcher is a
        # separate, always-running service — it listens for pg_notify on
        # EVERY brainrot_jobs insert (trg_brainrot_new fires regardless of
        # this service's own single-service-mode setting) and independently
        # polls for status='created' rows to claim. Without this line, the
        # row sits visibly at 'created' for however long it takes the
        # background task below to get scheduled and make its own first DB
        # write — long enough for the watcher to also claim and dispatch
        # the SAME job's script stage a second time, via its own worker
        # pool. Flipping status here, before the task even exists, closes
        # that race: the watcher's claim query (`WHERE status='created'`)
        # never matches this row.
        await db.update_brainrot_job_progress(job_id, 5, "Starting...", status="generating_script")
        asyncio.create_task(run_brainrot_api_stage(job_id), name=f"brainrot-{job_id[:8]}")
        logger.info(f"[{job_id}] Brainrot job created — running script stage in-process (single-service mode)")

    return {"job_id": job_id, "status": row["status"] if split_worker_mode else "generating_script"}


# ── Script review: edit / regenerate / preview / confirm ────────
# The new middle phase between job creation and rendering — see
# brainrot_stage.py's module docstring for the full 3-stage shape. Every
# endpoint here except confirm is completely free (no credit touched, no
# TTS/render run) so the user can iterate on the dialogue as much as they
# want before committing to a render.

class ScriptLine(BaseModel):
    speaker: str
    text: str

    @field_validator("speaker")
    @classmethod
    def validate_speaker(cls, v: str) -> str:
        if v not in ("left", "right", "narrator"):
            raise ValueError("speaker must be left, right, or narrator")
        return v

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("line text can't be empty")
        return v[:500]


class UpdateScriptRequest(BaseModel):
    lines: list[ScriptLine]

    @field_validator("lines")
    @classmethod
    def non_empty(cls, v: list["ScriptLine"]) -> list["ScriptLine"]:
        if not v:
            raise ValueError("script needs at least one line")
        return v


def _require_owned_job(job: dict | None, user_id: str) -> dict:
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return job


@router.patch("/jobs/{job_id}/script")
async def update_brainrot_script(job_id: str, body: UpdateScriptRequest, current_user: CurrentUser):
    """Saves the user's hand-edited dialogue directly — no AI call, instant,
    free. Only valid while awaiting review; once confirmed, scene_plan gets
    overwritten with the final timed lines and editing no longer applies."""
    job = _require_owned_job(await db.get_brainrot_job(job_id), current_user.user_id)
    if job["status"] != "awaiting_review":
        raise HTTPException(status_code=409, detail="Script can only be edited while awaiting review")

    lines = [{"speaker": l.speaker, "text": l.text} for l in body.lines]
    await db.set_brainrot_scene_plan(job_id, lines)
    return {"scene_plan": lines}


@router.post("/jobs/{job_id}/regenerate-script", status_code=202)
async def regenerate_brainrot_script(job_id: str, current_user: CurrentUser):
    """Re-runs the script stage from scratch against the same topic/cast,
    overwriting whatever draft (AI-written or hand-edited) currently sits
    in scene_plan. Free — no credit touched, callable as many times as the
    user wants. Also allowed as a retry when the script stage itself
    previously failed (e.g. a transient GPT error) — checked via
    reserved_credits still being 0, which is only true for a job that
    never made it past the script stage in the first place."""
    job = _require_owned_job(await db.get_brainrot_job(job_id), current_user.user_id)
    already_confirmed = (job.get("payload") or {}).get("reserved_credits", 0) > 0
    if job["status"] not in ("awaiting_review",) and not (job["status"] == "failed" and not already_confirmed):
        raise HTTPException(status_code=409, detail="Can only regenerate while awaiting review")

    asyncio.create_task(run_brainrot_api_stage(job_id), name=f"brainrot-regen-{job_id[:8]}")
    return {"status": "regenerating"}


class PreviewLineRequest(BaseModel):
    speaker: str
    text: str

    @field_validator("speaker")
    @classmethod
    def validate_speaker(cls, v: str) -> str:
        if v not in ("left", "right", "narrator"):
            raise ValueError("speaker must be left, right, or narrator")
        return v


@router.post("/jobs/{job_id}/preview-line")
async def preview_brainrot_line(job_id: str, body: PreviewLineRequest, current_user: CurrentUser):
    """One-off TTS for a single line so the user can hear delivery before
    committing to a render. Never persisted, never touches the job row or
    scene_plan — returned as a data: URL rather than uploaded to GCS, since
    this audio has no reason to exist past the response (no upload, no
    cleanup, no orphaned-file risk)."""
    job = _require_owned_job(await db.get_brainrot_job(job_id), current_user.user_id)
    payload = job["payload"]
    text = body.text.strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    from app.pipeline import tts, voice_catalog

    voice_left = payload.get("voice_left", "")
    voice_right = payload.get("voice_right", "")
    voice = voice_right if body.speaker == "right" else voice_left
    voice_entry = voice_catalog.find_voice(voice) if voice else None
    provider = voice_entry.provider if voice_entry else "unrealspeech"
    locale = voice_entry.locale if voice_entry else "en-US"

    try:
        audio_bytes, duration = await tts.synthesize(text, voice, provider, locale=locale)
    except Exception as exc:
        logger.warning(f"[{job_id}] Line preview TTS failed: {exc}")
        raise HTTPException(status_code=502, detail="Voice preview failed — try again")

    import base64
    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    return {"audio_data_url": f"data:audio/mpeg;base64,{audio_b64}", "duration": duration}


@router.post("/jobs/{job_id}/confirm", status_code=202)
async def confirm_brainrot_job(job_id: str, current_user: CurrentUser):
    """The user has read/edited the dialogue and wants the actual clip. This
    is where the 1 credit is reserved — nothing before this point ever
    touched the user's balance (see reserved_credits=0 at creation, above)."""
    job = _require_owned_job(await db.get_brainrot_job(job_id), current_user.user_id)
    if job["status"] != "awaiting_review":
        raise HTTPException(status_code=409, detail="Job isn't awaiting review")
    if not (job.get("scene_plan") or []):
        raise HTTPException(status_code=400, detail="No script to render — write or generate one first")

    reserved_credits = await db.reserve_brainrot_credits(current_user.user_id, 1)
    if reserved_credits < 1:
        raise HTTPException(
            status_code=402,
            detail="Monthly brainrot clip limit reached for your plan. Resets next month — upgrade to continue.",
        )
    await db.set_brainrot_reserved_credits(job_id, reserved_credits)
    await db.update_brainrot_job_progress(job_id, 20, "Starting voice synthesis...", status="synthesizing_voice")

    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        # See brainrot_stage.py's module docstring — dispatcher.py has no
        # claim query for a confirmed job yet, so this currently stalls in
        # split-worker mode. Logged so it's visible in production rather
        # than silently stuck.
        logger.warning(f"[{job_id}] Brainrot job confirmed in split-worker mode, but no dispatch wiring exists yet — job will stall")
    else:
        asyncio.create_task(run_brainrot_confirm_stage(job_id), name=f"brainrot-confirm-{job_id[:8]}")
        logger.info(f"[{job_id}] Brainrot job confirmed — running confirm+render in-process (single-service mode)")

    return {"job_id": job_id, "status": "synthesizing_voice"}


# ── GET /brainrot/jobs/{job_id} ─────────────────────────────────

@router.get("/jobs/{job_id}")
async def get_brainrot_job(job_id: str, current_user: CurrentUser):
    job = await db.get_brainrot_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize_brainrot_job(job)


# ── GET /brainrot/jobs ───────────────────────────────────────────

@router.get("/jobs")
async def list_brainrot_jobs(current_user: CurrentUser):
    rows = await db.list_brainrot_jobs(current_user.user_id)
    return {"jobs": [_serialize_brainrot_job(r) for r in rows]}


# ── GET /brainrot/clips ───────────────────────────────────────────
# Dedicated feed for the Studio's "My clips" library — separate from
# GET /brainrot/jobs above (which backs the create flow's live job-status
# polling). Failed jobs never show in the library, so they're excluded
# here entirely; supports status filtering + pagination and returns tab
# counts so the UI's All/Rendering/Ready filter chips don't need the full
# list loaded client-side.

@router.get("/clips")
async def list_brainrot_clips(
    current_user: CurrentUser,
    status: str = Query("all", pattern="^(all|active|complete)$"),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    rows = await db.list_brainrot_clips_source(current_user.user_id, limit=CLIPS_FETCH_CAP)
    all_clips = [c for c in (_serialize_brainrot_job(r) for r in rows) if c["status"] != "failed"]

    counts = {
        "all": len(all_clips),
        "active": sum(1 for c in all_clips if c["status"] in ACTIVE_JOB_STATUSES),
        "complete": sum(1 for c in all_clips if c["status"] == "complete"),
        "queued": sum(1 for c in all_clips if c["status"] == "created"),
    }

    if status == "active":
        filtered = [c for c in all_clips if c["status"] in ACTIVE_JOB_STATUSES]
    elif status == "complete":
        filtered = [c for c in all_clips if c["status"] == "complete"]
    else:
        filtered = all_clips

    page = filtered[offset:offset + limit]
    return {
        "clips": page,
        "counts": counts,
        "total": len(filtered),
        "has_more": offset + len(page) < len(filtered),
    }


def _serialize_brainrot_job(row: dict) -> dict:
    payload = row.get("payload") or {}
    status = row["status"]
    output_url = row.get("output_url")
    error_message = row.get("error_message")
    # A completed render/upload can race with the stage timeout firing at
    # nearly the same instant — fail_brainrot_job's own status guard (see
    # db/supabase.py) stops this going forward, but rows written before
    # that guard existed can still say status='failed' even though
    # output_url/current_step prove the clip genuinely finished. Trust the
    # artifact over a stale status field: a real output_url is definitive
    # proof the clip rendered and uploaded successfully.
    if output_url and status != "complete":
        status = "complete"
        error_message = None
    return {
        "job_id": str(row["job_id"]),
        "status": status,
        "progress": row["progress"],
        "current_step": row["current_step"],
        "output_url": output_url,
        "error_message": error_message,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "script_input": payload.get("script_input", ""),
        "post_title": payload.get("post_title", ""),
        "post_hashtags": payload.get("post_hashtags", []),
        # Draft dialogue while awaiting_review ({speaker,text} per line, no
        # timing yet), or the final timed lines once confirmed/rendering —
        # the Studio's review screen and the finished-clip view both read
        # this same field, just at different points in a line's lifecycle.
        "scene_plan": row.get("scene_plan") or [],
    }


# ── GET /brainrot/characters ─────────────────────────────────────

class PostMetaRequest(BaseModel):
    script_input: str


@router.post("/generate-post-meta")
async def generate_post_meta(body: PostMetaRequest, current_user: CurrentUser):
    """
    Given a script/topic, return a viral post title and hashtags for YT/TikTok.
    Uses the same OpenAI client as brainrot_script.py.
    """
    from app.pipeline.brainrot_script import _client as _openai, SCRIPT_MODEL

    script = body.script_input.strip()[:600]
    if not script:
        return {"title": "", "hashtags": []}

    prompt = (
        "You write viral social media metadata for short-form video (TikTok / YouTube Shorts).\n\n"
        f"Video topic / script:\n{script}\n\n"
        "Return ONLY valid JSON with exactly two keys:\n"
        "  \"title\"     — one punchy post title under 80 characters, no hashtags inside it\n"
        "  \"hashtags\"  — array of 6–8 relevant hashtags WITH the # sign, e.g. [\"#skibidi\", \"#fyp\"]\n\n"
        "Rules: title must grab attention in < 5 words; hashtags mix trending (#fyp #viral) "
        "with topic-specific ones. Return nothing except the JSON object."
    )
    try:
        resp = await _openai.chat.completions.create(
            model=SCRIPT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
            response_format={"type": "json_object"},
        )
        import json as _json
        data = _json.loads(resp.choices[0].message.content or "{}")
        title = str(data.get("title", "")).strip()[:100]
        hashtags = [str(h).strip() for h in data.get("hashtags", []) if h][:10]
        return {"title": title, "hashtags": hashtags}
    except Exception as exc:
        logger.warning(f"generate-post-meta failed: {exc}")
        return {"title": "", "hashtags": []}


@router.get("/characters")
async def list_characters():
    return {"characters": await get_character_roster()}


# ── Signature casts — saved character pairs ──────────────────────
# Small, deliberately unopinionated: just "these two characters, in this
# order." The studio re-resolves art/voices from the live roster on load
# rather than storing a snapshot, so a saved cast never goes stale.

MAX_SIGNATURE_CASTS = 12


class SignatureCastCreate(BaseModel):
    character_ids: list[str]
    label: str | None = None

    @field_validator("character_ids")
    @classmethod
    def validate_pair(cls, v: list[str]) -> list[str]:
        if len(v) != 2:
            raise ValueError("A signature cast needs exactly 2 characters")
        return v


@router.get("/signature-casts")
async def list_signature_casts(current_user: CurrentUser):
    rows = await db.list_signature_casts(current_user.user_id)
    return {"casts": [_serialize_signature_cast(r) for r in rows]}


@router.post("/signature-casts")
async def create_signature_cast(body: SignatureCastCreate, current_user: CurrentUser):
    for cid in body.character_ids:
        if await get_character_by_id(cid) is None:
            raise HTTPException(status_code=404, detail=f"Unknown character_id: {cid}")
    if await db.count_signature_casts(current_user.user_id) >= MAX_SIGNATURE_CASTS:
        raise HTTPException(status_code=400, detail=f"Limit of {MAX_SIGNATURE_CASTS} signature casts reached — delete one to save another")
    row = await db.insert_signature_cast(current_user.user_id, body.character_ids, body.label)
    return _serialize_signature_cast(row)


@router.delete("/signature-casts/{cast_id}")
async def delete_signature_cast(cast_id: str, current_user: CurrentUser):
    deleted = await db.delete_signature_cast(cast_id, current_user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Signature cast not found")
    return {"deleted": True}


def _serialize_signature_cast(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "character_ids": row["character_ids"],
        "label": row.get("label"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ── GET /brainrot/gameplay-clips ─────────────────────────────────

@router.get("/gameplay-clips")
async def list_gameplay_clips(category: str | None = Query(default=None)):
    clips = await db.list_gameplay_clips(category, status='selected')
    return {"clips": [
        {
            "id": str(c["id"]), "category": c["category"], "source_title": c.get("source_title"),
            "gcs_path": c["gcs_path"], "thumbnail_url": c.get("thumbnail_url"), 
            "duration_seconds": c["duration_seconds"],
        }
        for c in clips
    ]}


# ── GET /brainrot/audio-assets ───────────────────────────────────

@router.get("/audio-assets")
async def list_audio_assets(asset_type: str | None = Query(default=None, alias="type")):
    if asset_type and asset_type not in ("music", "sfx"):
        raise HTTPException(status_code=400, detail="type must be 'music' or 'sfx'")
    assets = await db.list_audio_assets(asset_type)
    return {"assets": [
        {
            "id": str(a["id"]), "asset_type": a["asset_type"], "category": a.get("category"),
            "name": a["name"], "gcs_path": a["gcs_path"], "duration_seconds": a.get("duration_seconds"),
        }
        for a in assets
    ]}


# ── GET /brainrot/animations ────────────────────────────────────

@router.get("/animations")
async def get_animations():
    """Entry/exit motion presets for the character picker. The same set is
    offered for both entry and exit (a character's entry and exit may differ)."""
    motions = [{"id": m.id, "label": m.label, "description": m.description} for m in MOTIONS]
    return {
        "entry": motions,
        "exit": motions,
        "default_entry": DEFAULT_ENTRY,
        "default_exit": DEFAULT_EXIT,
    }


# ── GET /brainrot/voices ────────────────────────────────────────

@router.get("/voices")
async def get_voices(
    provider: str | None = Query(default=None),
    locale: str | None = Query(default=None),
):
    """Return voice catalog with preview URLs (if samples have been generated)."""
    samples = await db.list_voice_samples()
    sample_map = {(s["provider"], s["voice_id"]): s for s in samples}

    voices = list_voices(provider=provider, locale=locale)
    result = []
    for v in voices:
        sample = sample_map.get((v.provider, v.voice_id))
        result.append({
            "voice_id": v.voice_id,
            "provider": v.provider,
            "locale": v.locale,
            "label": v.label,
            "gender": v.gender,
            "preview_url": sample["gcs_url"] if sample else None,
            "preview_duration": sample["duration_seconds"] if sample else None,
        })
    return {"voices": result}


# ══ ADMIN: Phase 3 library management ════════════════════════════

def _require_admin(current_user: CurrentUser) -> None:
    from app.api.admin import is_admin
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")


# ── GET /brainrot/admin/jobs — history across all users ─────────
# Parallel to admin.py's GET /admin/jobs, but against brainrot_jobs — the two
# tables' payload shapes diverge too much to share one query/serializer.

def _serialize_admin_brainrot_job(row: dict) -> dict:
    payload = row.get("payload") or {}
    return {
        "job_id": str(row["job_id"]),
        "user_email": row.get("user_email"),
        "user_name": row.get("user_name"),
        "status": row["status"],
        "progress": row.get("progress"),
        "current_step": row.get("current_step"),
        "output_url": row.get("output_url"),
        "error_message": row.get("error_message"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "script_input": payload.get("script_input"),
        "character_count": len(payload.get("character_ids") or []),
        "duration_seconds": payload.get("duration_seconds"),
        "caption_style": payload.get("caption_style"),
    }


@router.get("/admin/jobs")
async def admin_list_brainrot_jobs(current_user: CurrentUser):
    """Admin: list brainrot jobs across all users."""
    _require_admin(current_user)
    try:
        rows = await db._fetch(
            """
            SELECT j.*, u.email as user_email, u.full_name as user_name
            FROM brainrot_jobs j
            LEFT JOIN users u ON j.user_id = u.id
            ORDER BY j.created_at DESC
            LIMIT 100
            """
        )
        return {"jobs": [_serialize_admin_brainrot_job(dict(r)) for r in rows]}
    except Exception as e:
        logger.error(f"Admin list brainrot jobs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


_AUDIO_CONTENT_TYPES = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".aac": "audio/aac",
}
_VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".webm": "video/webm", ".mkv": "video/x-matroska",
}

# In-memory progress for the (single-flight) voice-sample generator.
_voice_gen: dict = {"running": False, "total": 0, "done": 0, "failed": 0}


# ── POST /brainrot/admin/voices/generate ────────────────────────

@router.post("/admin/voices/generate", status_code=202)
async def admin_generate_voice_samples(current_user: CurrentUser, missing_only: bool = False):
    """Admin: auto-generate a preview sample for every voice in the catalog
    (or, with missing_only=true, just the ones that don't have a sample yet —
    e.g. after fixing a few broken voice_ids, no need to re-pay for TTS on
    the ones that already worked). Runs in background — each voice gets a
    short TTS clip uploaded to GCS."""
    _require_admin(current_user)
    if _voice_gen["running"]:
        raise HTTPException(status_code=409, detail="Voice generation already running")

    target_voices = await _voices_to_generate(missing_only)
    asyncio.create_task(_generate_all_voice_samples(target_voices), name="voice-sample-gen")
    return {"status": "started", "total_voices": len(target_voices)}


async def _voices_to_generate(missing_only: bool) -> list:
    all_voices = list_voices()
    if not missing_only:
        return all_voices
    samples = await db.list_voice_samples()
    have = {(s["provider"], s["voice_id"]) for s in samples}
    return [v for v in all_voices if (v.provider, v.voice_id) not in have]


@router.get("/admin/voices/status")
async def admin_voice_status(current_user: CurrentUser):
    """Admin: how many voices already have preview samples + live gen progress."""
    _require_admin(current_user)
    samples = await db.list_voice_samples()
    have = {(s["provider"], s["voice_id"]) for s in samples}
    catalog = list_voices()
    return {
        "total_voices": len(catalog),
        "with_samples": sum(1 for v in catalog if (v.provider, v.voice_id) in have),
        "generating": _voice_gen,
    }


async def _generate_all_voice_samples(target_voices: list | None = None) -> None:
    from app.pipeline.tts import synthesize
    from app.pipeline.uploader import upload_voice_sample

    all_voices = target_voices if target_voices is not None else list_voices()
    _voice_gen.update({"running": True, "total": len(all_voices), "done": 0, "failed": 0})
    logger.info(f"Starting voice sample generation for {len(all_voices)} voices")

    try:
        for v in all_voices:
            try:
                audio_bytes, duration = await synthesize(
                    text=SAMPLE_TEXT, voice=v.voice_id, provider=v.provider, locale=v.locale,
                )
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                    tmp.write(audio_bytes)
                    tmp_path = Path(tmp.name)
                try:
                    gcs_url = await upload_voice_sample(tmp_path, v.provider, v.voice_id)
                finally:
                    tmp_path.unlink(missing_ok=True)

                await db.upsert_voice_sample(
                    provider=v.provider, voice_id=v.voice_id, locale=v.locale,
                    gcs_url=gcs_url, duration_seconds=duration,
                )
                _voice_gen["done"] += 1
                logger.info(f"  [{_voice_gen['done']}/{len(all_voices)}] {v.provider}:{v.voice_id} OK ({duration:.1f}s)")
            except Exception as e:
                _voice_gen["failed"] += 1
                logger.error(f"  Voice sample failed for {v.provider}:{v.voice_id}: {e}")
    finally:
        _voice_gen["running"] = False
        logger.info(f"Voice sample generation complete: {_voice_gen['done']} ok, {_voice_gen['failed']} failed")


# ── Bulk generation ────────────────────────────────────────────
# Admin gives a list of topics (one per line); the system casts 2 random
# characters per topic from a curated human/humanoid pool, auto-assigns
# voices the same way a normal job does, picks a random approved gameplay
# background, and renders them one at a time — sequential by design (not
# fanned out in parallel) both because that's what was asked for and
# because it avoids the CPU contention between concurrent renders that's
# been the root cause of slow/failing renders elsewhere in this pipeline
# (see _ACTIVE_RENDERS_ON_INSTANCE in brainrot_stage.py). Reuses the same
# insert_brainrot_job + dispatch path as a normal job, attributed to the
# admin's own account — including normal credit consumption. Deliberately
# does NOT go through create_brainrot_job's per-user rate-limit checks
# (MAX_CONCURRENT_BRAINROT_JOBS_PER_USER / MAX_BRAINROT_JOBS_PER_HOUR) —
# those exist to stop regular-user abuse, not to throttle an admin
# batch tool that already self-paces by running strictly one at a time.

# Human/humanoid characters only — no literal animals (Animals family) and
# no non-human creatures (Gremlins/Hybrids-in-name-only aside, SciFi
# aliens/robots) — with 3 forest-flavored fantasy humanoids (elf/bog
# witch/fairy) mixed in per the "include foresty humans" ask. Edit this
# list directly to change the pool; nothing else needs to change.
BULK_CHARACTER_POOL: list[str] = [
    # Corporate (10)
    "brent-callahan", "deb-from-hr", "todd-synergy", "marcy-mulch", "intern-greg",
    "sharon-quill", "reginald-cost", "chip-vandergraff", "doreen-sludge", "beige",
    # Household (10)
    "dougie-blunt", "marla-blunt", "kip-blunt", "tanner-blunt", "nana-ratchet",
    "uncle-sherm", "bev-nettles", "chad-pemberton", "grill-hutch", "trisha-vane",
    # Street (10)
    "tito-ramirez", "big-marv", "slick-dime", "ms-yolanda", "two-phone-tommy",
    "reseller-ray", "dj-kettle", "curb", "auntie-fern", "rico-static",
    # Period (7 of 10 — trimmed to make room for the 3 forest picks below)
    "bartholomew-crumb", "agnes-grim", "duke-pomp", "clyde-barrelhouse",
    "wilhelmina-frost", "cowboy-jed", "mordecai-blackrot",
    # Fantasy — forest-flavored humanoids only (elf/bog witch/fairy), not
    # the barbarian/dwarf/goblin/etc. rest of that family
    "elowen-mistvale", "puddle", "thistle",
]

# In-memory progress for the (single-flight) bulk generator — same pattern
# as _voice_gen above.
_bulk_gen: dict = {"running": False, "total": 0, "done": 0, "failed": 0, "current_topic": ""}


class BulkCreateRequest(BaseModel):
    topics: list[str]


@router.post("/admin/bulk-create", status_code=202)
async def admin_bulk_create(body: BulkCreateRequest, current_user: CurrentUser):
    """Admin: queue a list of topics for sequential, one-at-a-time brainrot
    generation. Each topic becomes its own job — 2 random characters from
    BULK_CHARACTER_POOL by default (see _parse_topic_tag for the ". #1"/
    ". #2" per-line override), auto-assigned voices, a random selected
    gameplay background, sensible defaults everywhere else (turn_based
    motion, slide entry/exit, default caption style)."""
    _require_admin(current_user)
    if _bulk_gen["running"]:
        raise HTTPException(status_code=409, detail="Bulk generation already running")

    topics = [t.strip() for t in body.topics if t.strip()]
    if not topics:
        raise HTTPException(status_code=400, detail="No topics given")

    asyncio.create_task(_run_bulk_generation(topics, current_user.user_id), name="brainrot-bulk-gen")
    return {"status": "started", "total": len(topics)}


@router.get("/admin/bulk-create/status")
async def admin_bulk_create_status(current_user: CurrentUser):
    _require_admin(current_user)
    return _bulk_gen


async def _run_bulk_generation(topics: list[str], user_id: str) -> None:
    _bulk_gen.update({"running": True, "total": len(topics), "done": 0, "failed": 0, "current_topic": ""})
    logger.info(f"[bulk] starting {len(topics)} topics")
    try:
        gameplay_clips = await db.list_gameplay_clips(None, status="selected")
        music_assets = await db.list_audio_assets("music")
        roster = {c["id"]: c for c in await get_character_roster()}
        pool = [cid for cid in BULK_CHARACTER_POOL if cid in roster]

        for raw_topic in topics:
            topic, character_count = _parse_topic_tag(raw_topic)
            _bulk_gen["current_topic"] = topic
            try:
                job_id = await _create_bulk_job(
                    topic, character_count, user_id, roster, pool, gameplay_clips, music_assets,
                )
                final = await _wait_for_job_terminal(job_id)
                if final and final["status"] == "complete":
                    _bulk_gen["done"] += 1
                    logger.info(f"[bulk] {topic!r} -> {job_id} complete")
                else:
                    _bulk_gen["failed"] += 1
                    reason = final.get("error_message") if final else "job row missing"
                    logger.warning(f"[bulk] {topic!r} -> {job_id} did not complete: {reason}")
            except Exception as exc:
                _bulk_gen["failed"] += 1
                logger.exception(f"[bulk] {topic!r} failed to create/run: {exc}")
    finally:
        _bulk_gen["running"] = False
        _bulk_gen["current_topic"] = ""
        logger.info(f"[bulk] done: {_bulk_gen['done']} ok, {_bulk_gen['failed']} failed")


_TOPIC_TAG_RE = re.compile(r"^(?P<topic>.*\.)\s+#(?P<n>[12])\s*$")


def _parse_topic_tag(raw: str) -> tuple[str, int]:
    """A bulk-create topic line can end with ". #1" or ". #2" — a full stop
    (the topic sentence's own punctuation), a space, then the tag — to
    force a 1- or 2-character cast for that specific clip. Untagged lines
    default to 2 (the normal two-character argument format). The tag is
    stripped before the topic reaches the dialogue writer; it's a control
    signal for the bulk runner, not part of the actual topic text."""
    m = _TOPIC_TAG_RE.match(raw.strip())
    if not m:
        return raw.strip(), 2
    return m.group("topic").strip(), int(m.group("n"))


async def _wait_for_job_terminal(job_id: str, poll_seconds: float = 5.0) -> dict | None:
    """Blocks until the job reaches complete/failed — this is what makes
    the bulk run genuinely sequential (one render actually finishing
    before the next one starts), not just "dispatched one at a time"."""
    while True:
        job = await db.get_brainrot_job(job_id)
        if not job or job["status"] in ("complete", "failed"):
            return job
        await asyncio.sleep(poll_seconds)


async def _create_bulk_job(
    topic: str, character_count: int, user_id: str, roster: dict, pool: list[str],
    gameplay_clips: list[dict], music_assets: list[dict],
) -> str:
    if character_count not in (1, 2):
        character_count = 2
    if len(pool) < character_count:
        raise RuntimeError(f"Bulk character pool has fewer than {character_count} valid characters")
    if not gameplay_clips:
        raise RuntimeError("No selected gameplay clips available to pick a background from")

    picked_ids = random.sample(pool, character_count)
    gameplay_clip = random.choice(gameplay_clips)
    # Random background music per clip (from whatever's uploaded in the
    # Music & SFX admin library) — None/no music if nothing's uploaded yet,
    # same as a normal job with no music picked.
    music = random.choice(music_assets) if music_assets else None

    def _profile(character: dict, side: str) -> dict:
        return {
            "character_id": character["id"], "side": side,
            "x": 0.17 if side == "left" else 0.83, "y": 0.76, "scale": 1.0, "rotation": 0.0,
            "entry": "slide", "exit": "slide",
            "image_url": character["image_url"],
            "gender": character.get("gender", "neutral"),
            "name": character.get("name", ""),
            "archetype": character.get("archetype", ""),
            "role": character.get("role", ""),
            "voice": character.get("voice", ""),
        }

    if character_count == 1:
        # Single-character clips are always "left" (matches the normal
        # 1-character convention — brainrot_composite.py forces always_on
        # motion for a lone character, and voice_right stays empty).
        left = roster[picked_ids[0]]
        character_positions = [_profile(left, "left")]
        voice_left = default_voice_for_gender(left.get("gender", "neutral"), slot=0).voice_id
        voice_right = ""
    else:
        left, right = roster[picked_ids[0]], roster[picked_ids[1]]
        character_positions = [_profile(left, "left"), _profile(right, "right")]
        voice_left = default_voice_for_gender(left.get("gender", "neutral"), slot=0).voice_id
        voice_right = default_voice_for_gender(right.get("gender", "neutral"), slot=1).voice_id

    reserved_credits = await db.reserve_brainrot_credits(user_id, 1)
    if reserved_credits < 1:
        raise RuntimeError("Admin account is out of brainrot credits for this month")

    payload = {
        "reserved_credits": reserved_credits,
        "script_input": topic,
        "character_ids": picked_ids,
        "character_positions": character_positions,
        "gameplay_clip_id": str(gameplay_clip["id"]),
        "gameplay_clip_url": gameplay_clip["gcs_path"],
        "duration_seconds": 30,
        "caption_style": DEFAULT_CAPTION_STYLE,
        "caption_color": DEFAULT_CAPTION_COLOR,
        "caption_y": DEFAULT_CAPTION_Y,
        "voice_left": voice_left,
        "voice_right": voice_right,
        "motion_mode": "turn_based",
        "music_asset_id": str(music["id"]) if music else None,
        "music_volume": 0.3,
        "music_url": music["gcs_path"] if music else None,
        "post_title": "",
        "post_hashtags": [],
    }

    try:
        row = await db.insert_brainrot_job(user_id, payload)
    except Exception:
        await db.release_brainrot_credits(user_id, reserved_credits)
        raise
    job_id = str(row["job_id"])

    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        logger.info(f"[bulk:{job_id}] queued for watcher poll pickup")
    else:
        # Same race-closing claim as create_brainrot_job above — see that
        # function's comment. Without this, the watcher (a separate,
        # always-running service reacting to pg_notify on every insert
        # regardless of this service's own mode) can independently claim
        # and dispatch this same 'created' row before the background task
        # below gets scheduled.
        await db.update_brainrot_job_progress(job_id, 5, "Starting...", status="generating_script")
        # Bulk generation is meant to run fully unattended — no human
        # review step makes sense here, so this uses run_brainrot_full_auto
        # (script -> confirm -> render back to back) rather than the
        # review-gated run_brainrot_api_stage regular job creation now
        # dispatches. The credit is already reserved above (line ~1046),
        # matching what run_brainrot_full_auto expects of its caller.
        asyncio.create_task(run_brainrot_full_auto(job_id), name=f"brainrot-bulk-{job_id[:8]}")
        logger.info(f"[bulk:{job_id}] running in-process (single-service mode)")

    return job_id


# ── Audio library (music / SFX) ─────────────────────────────────

@router.post("/admin/audio-assets", status_code=201)
async def admin_upload_audio_asset(
    current_user: CurrentUser,
    file: UploadFile = File(...),
    asset_type: str = Form(...),
    name: str = Form(...),
    category: str | None = Form(default=None),
):
    """Admin: upload a music track or SFX one-shot into the shared library."""
    _require_admin(current_user)
    if asset_type not in ("music", "sfx"):
        raise HTTPException(status_code=400, detail="asset_type must be 'music' or 'sfx'")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _AUDIO_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {ext or '(none)'}")

    from app.pipeline.brainrot_gameplay import _ffprobe_duration
    from app.pipeline.uploader import upload_audio_asset

    asset_id = uuid.uuid4().hex[:12]
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)
    try:
        try:
            duration = await _ffprobe_duration(tmp_path)
        except Exception:
            duration = None
        gcs_url = await upload_audio_asset(tmp_path, asset_type, asset_id, ext, _AUDIO_CONTENT_TYPES[ext])
    finally:
        tmp_path.unlink(missing_ok=True)

    row = await db.insert_audio_asset(asset_type, category, name.strip() or file.filename, gcs_url, duration, current_user.user_id)
    logger.info(f"Admin {current_user.email} uploaded {asset_type} '{name}' → {gcs_url}")
    return {
        "id": str(row["id"]), "asset_type": row["asset_type"], "category": row.get("category"),
        "name": row["name"], "gcs_path": row["gcs_path"], "duration_seconds": row.get("duration_seconds"),
    }


class AudioAssetUpdate(BaseModel):
    name: str
    category: str | None = None


@router.patch("/admin/audio-assets/{asset_id}")
async def admin_update_audio_asset(asset_id: str, body: AudioAssetUpdate, current_user: CurrentUser):
    """Admin: correct a track's name/category after upload — added because
    music gets typed in with name and category swapped often enough
    (the two fields sit right next to each other on the upload form) that
    fixing it needs to not require re-uploading the file."""
    _require_admin(current_user)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name can't be empty")
    row = await db.update_audio_asset(asset_id, body.name.strip(), (body.category or "").strip() or None)
    if not row:
        raise HTTPException(status_code=404, detail="Audio asset not found")
    return {
        "id": str(row["id"]), "asset_type": row["asset_type"], "category": row.get("category"),
        "name": row["name"], "gcs_path": row["gcs_path"], "duration_seconds": row.get("duration_seconds"),
    }


@router.delete("/admin/audio-assets/{asset_id}")
async def admin_delete_audio_asset(asset_id: str, current_user: CurrentUser):
    _require_admin(current_user)
    await db.delete_audio_asset(asset_id)
    return {"success": True}


# ── Gameplay library (upload → auto trim/split/reframe) ─────────

class UploadUrlRequest(BaseModel):
    filename: str
    content_type: str

@router.post("/admin/gameplay/upload-url")
def get_gameplay_upload_url(
    current_user: CurrentUser,
    req: UploadUrlRequest,
):
    _require_admin(current_user)
    from app.pipeline.uploader import generate_upload_signed_url
    
    # Generate a unique path in the brainrot bucket for the raw upload
    ext = Path(req.filename).suffix or ".mp4"
    object_name = f"raw_uploads/{uuid.uuid4().hex}{ext}"
    bucket_name = settings.BRAINROT_GCS_BUCKET_NAME
    
    try:
        url = generate_upload_signed_url(bucket_name, object_name, req.content_type)
    except Exception as e:
        logger.exception("Failed to generate signed url")
        raise HTTPException(status_code=500, detail=str(e))
    
    return {
        "url": url,
        "gcs_path": f"gs://{bucket_name}/{object_name}"
    }


@router.post("/admin/gameplay", status_code=202)
async def admin_upload_gameplay(
    current_user: CurrentUser,
    youtube_url: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    direct_gcs_path: str | None = Form(default=None),
    category: str = Form(...),
    title: str | None = Form(default=None),
):
    """Admin: submit a gameplay recording. Can be a YouTube URL, direct file upload, or a GCS path to a file uploaded via signed URL."""
    logger.info(f"Admin upload gameplay request received. YouTube: {bool(youtube_url)}, File: {bool(file)}, GCS Path: {bool(direct_gcs_path)}")
    
    _require_admin(current_user)
    if not category.strip():
        raise HTTPException(status_code=400, detail="category is required")
        
    inputs = sum(bool(x) for x in [youtube_url, file, direct_gcs_path])
    if inputs != 1:
        raise HTTPException(status_code=400, detail="Provide exactly one of youtube_url, file, or direct_gcs_path")

    url = (youtube_url or "").strip()
    video_id = None
    if url:
        import re
        match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
        if match:
            video_id = match.group(1)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    from app.core.worker_routing import has_multi_region_workers
    from app.core.config import get_settings
    
    settings = get_settings()
    split_worker_mode = bool(settings.API_WORKER_URLS.strip() or settings.FFMPEG_WORKER_URLS.strip())
    multi_region = split_worker_mode or has_multi_region_workers()

    # For YouTube: insert as 'created' so the watcher trigger can dispatch it to the ffmpeg worker.
    # For file uploads / GCS paths: insert straight as 'processing' — the watcher must never see this row
    # because it would try to dispatch it as a YouTube job (needs video_id) and fail silently.
    # Determine initial status and upload raw file if needed
    # For YouTube URLs we keep the existing logic (status 'created' so watcher will handle)
    # For file uploads and direct GCS paths we now store the raw file in GCS and let the watcher process it.
    if file:
        # Upload the raw file to GCS directly
        ext = Path(file.filename or "").suffix or ".mp4"
        object_name = f"raw_uploads/{uuid.uuid4().hex}{ext}"
        bucket_name = settings.BRAINROT_GCS_BUCKET_NAME
        from app.pipeline.uploader import _get_gcs_client
        client = _get_gcs_client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)
        # Stream upload to avoid loading whole file into memory
        await file.seek(0)
        # Use a temporary file to stream upload (GCS Python lib expects file-like object)
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp_file.write(chunk)
            tmp_file_path = Path(tmp_file.name)
        # Off-loop upload — google-cloud-storage's upload_from_filename is
        # blocking, and calling it directly here would freeze the entire
        # FastAPI event loop for the duration of a multi-hundred-MB upload
        # (every other in-flight request stalls). Matches the run_in_executor
        # pattern used throughout app/pipeline/uploader.py.
        await asyncio.get_running_loop().run_in_executor(
            None, blob.upload_from_filename, str(tmp_file_path),
        )
        tmp_file_path.unlink(missing_ok=True)
        stored_gcs_path = f"gs://{bucket_name}/{object_name}"
        initial_status = "created"
    elif direct_gcs_path:
        stored_gcs_path = direct_gcs_path
        initial_status = "created"
    else:
        # YouTube case — store a sentinel so gcs_path NOT NULL is satisfied;
        # the watcher dispatches via video_id and ignores this sentinel.
        stored_gcs_path = f"youtube:{video_id}"
        initial_status = "created"

    row = await db.insert_gameplay_source(
        category=category.strip(),
        title=(title or "").strip() or None,
        gcs_path=stored_gcs_path,
        uploaded_by=str(current_user.user_id),
        video_id=video_id,
        initial_status=initial_status,
    )
    source_id = str(row["id"])

    # Decide how to process the source.
    # For YouTube URLs we rely on the watcher (multi‑region workers) to pick up the row.
    # For direct file uploads or GCS paths we have already stored the raw file in GCS and
    # set the status to "created". The watcher will process it, so no in‑process work here.
    if video_id and multi_region:
        logger.info(f"Admin {current_user.email} submitted gameplay youtube {video_id} ({category}) — dispatched to watcher")
    else:
        logger.info(f"Admin {current_user.email} submitted gameplay {'file upload' if file else 'GCS path'} ({category}) — queued for worker processing")



    return {"source_id": source_id, "status": "created" if (multi_region and video_id) else "processing"}


async def _probe_video_duration(url: str) -> float:
    """ffprobe against a public HTTPS URL — a metadata read, not "processing"
    (no trim/split/reframe). Backs the direct-upload path below, which
    otherwise never touches the watcher pipeline (app/pipeline/brainrot_gameplay.py)."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("ffprobe timed out")
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {err.decode()[-200:]}")
    return float(out.decode().strip())


class DirectGameplayClipRequest(BaseModel):
    category: str
    title: str | None = None
    direct_gcs_path: str   # gs://bucket/object — from POST /admin/gameplay/upload-url


@router.post("/admin/gameplay-clips/direct", status_code=201)
async def admin_direct_gameplay_clip(body: DirectGameplayClipRequest, current_user: CurrentUser):
    """
    Admin: register an already-finished gameplay clip with NO processing —
    no head-trim, no <=120s splitting, no 9:16 reframe. The admin uploads a
    file that's already the right shape (via POST /admin/gameplay/upload-url
    + a direct PUT to the signed URL); this just records it as a selectable
    clip, bypassing the watcher pipeline in brainrot_gameplay.py entirely.
    Still lands with status='pending' like every other clip — curation
    (Select/Reject in the admin Clips section) is unchanged.
    """
    _require_admin(current_user)
    category = body.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="category is required")
    if not body.direct_gcs_path.startswith("gs://"):
        raise HTTPException(status_code=400, detail="direct_gcs_path must be a gs:// URI from POST /admin/gameplay/upload-url")

    bucket_name, _, object_name = body.direct_gcs_path[len("gs://"):].partition("/")
    if not bucket_name or not object_name:
        raise HTTPException(status_code=400, detail="Malformed direct_gcs_path")
    public_url = f"{settings.GCS_PUBLIC_BASE_URL}/{bucket_name}/{object_name}"

    source_row = await db.insert_gameplay_source(
        category=category,
        title=(body.title or "").strip() or None,
        gcs_path=body.direct_gcs_path,
        uploaded_by=str(current_user.user_id),
        video_id=None,
        initial_status="ready",
    )
    source_id = str(source_row["id"])

    try:
        duration = await _probe_video_duration(public_url)
    except Exception as exc:
        logger.warning(f"[gameplay-direct {source_id}] ffprobe failed on {public_url}: {exc}")
        duration = 0.0

    clip_row = await db.insert_gameplay_clip(
        source_id=source_id, category=category, gcs_path=public_url,
        thumbnail_url=None, duration_seconds=duration,
    )
    logger.info(f"Admin {current_user.email} direct-uploaded gameplay clip {clip_row['id']} ({category}) — no processing")
    return {"clip_id": str(clip_row["id"]), "source_id": source_id, "duration_seconds": duration}


@router.get("/admin/gameplay/sources")
async def admin_list_gameplay_sources(current_user: CurrentUser):
    """Admin: all uploaded gameplay sources with clip counts + live progress."""
    _require_admin(current_user)
    from app.pipeline.brainrot_gameplay import get_status
    sources = await db.list_gameplay_sources()
    return {"sources": [
        {
            "id": str(s["id"]), "category": s["category"], "title": s.get("title"),
            "status": s["status"], "error_message": s.get("error_message"),
            "clip_count": s.get("clip_count", 0),
            "progress": get_status(str(s["id"])),
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
        }
        for s in sources
    ]}


@router.get("/admin/gameplay-clips")
async def admin_list_gameplay_clips(current_user: CurrentUser):
    """Admin: list all generated gameplay clips to curate (selected/rejected)."""
    _require_admin(current_user)
    clips = await db.admin_list_gameplay_clips()
    return {"clips": [
        {
            "id": str(c["id"]),
            "source_id": str(c["source_id"]),
            "category": c["category"],
            "source_title": c.get("source_title"),
            "gcs_path": c["gcs_path"],
            "thumbnail_url": c.get("thumbnail_url"),
            "duration_seconds": c["duration_seconds"],
            "status": c.get("status", "pending"),
            "created_at": c["created_at"].isoformat() if c.get("created_at") else None,
        }
        for c in clips
    ]}

class UpdateClipStatusRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("selected", "rejected", "pending"):
            raise ValueError("status must be selected, rejected, or pending")
        return v

@router.patch("/admin/gameplay-clips/{clip_id}")
async def admin_update_gameplay_clip_status(clip_id: str, body: UpdateClipStatusRequest, current_user: CurrentUser):
    """Admin: mark a clip as selected, rejected, or pending."""
    _require_admin(current_user)
    clip = await db.get_gameplay_clip(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    await db.update_gameplay_clip_status(clip_id, body.status)
    return {"success": True, "status": body.status}
