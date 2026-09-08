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

