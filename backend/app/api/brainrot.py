"""
brainrot.py — /brainrot endpoints for the Brainrot Clips Maker.

POST /brainrot/jobs               — validate → resolve assets → INSERT job → dispatch
GET  /brainrot/jobs/{job_id}      — single job
GET  /brainrot/jobs               — list user's jobs
GET  /brainrot/characters         — the 105-character roster (from GCS, see brainrot_characters.py)
GET  /brainrot/gameplay-clips     — selectable gameplay backgrounds (optional ?category=)
GET  /brainrot/audio-assets       — music/SFX library (optional ?type=music|sfx)
GET  /brainrot/admin/jobs         — admin: brainrot jobs across all users (parallel to /admin/jobs)

Same dispatch-mode split as jobs.py: split-worker mode (FFMPEG_WORKER_URLS
configured) inserts as 'created' and relies on the watcher's poll loop
(watcher/dispatcher.py::process_one_brainrot_job) — no pg_notify channel was
added for brainrot in Phase 1, so dispatch latency is bounded by
config.POLL_INTERVAL rather than instant. Single-service mode (no worker
URLs) runs the stage in-process via asyncio.create_task, same as jobs.py.
"""
import asyncio
import logging
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from pydantic import BaseModel, field_validator

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.brainrot_characters import get_character_by_id, get_character_roster
from app.pipeline.brainrot_stage import run_brainrot_stage
from app.pipeline.animation_catalog import DEFAULT_ENTRY, DEFAULT_EXIT, MOTIONS, valid_motion
from app.pipeline.captions import VALID_COLORS, VALID_STYLES
from app.pipeline.voice_catalog import SAMPLE_TEXT, default_voice_for, list_voices

router = APIRouter(prefix="/brainrot", tags=["brainrot"])
logger = logging.getLogger(__name__)
settings = get_settings()

VALID_TTS_PROVIDERS = ["unrealspeech", "lemonfox"]
VALID_MOTION_MODES = ["turn_based", "always_on"]
DEFAULT_CAPTION_STYLE = "brainrot"
DEFAULT_CAPTION_COLOR = "yellow_black"
DEFAULT_CAPTION_Y = 0.82


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
    tts_provider: str = "unrealspeech"
    motion_mode: str = "turn_based"
    music_asset_id: str | None = None
    music_volume: float = 0.3
    intro_sfx_id: str | None = None
    outro_sfx_id: str | None = None
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

    @field_validator("tts_provider")
    @classmethod
    def validate_tts_provider(cls, v: str) -> str:
        return v if v in VALID_TTS_PROVIDERS else "unrealspeech"

    @field_validator("motion_mode")
    @classmethod
    def validate_motion_mode(cls, v: str) -> str:
        return v if v in VALID_MOTION_MODES else "turn_based"

    @field_validator("music_volume")
    @classmethod
    def clamp_music_volume(cls, v: float) -> float:
        return max(0.2, min(0.4, v))


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
    # match the character's gender (female character -> female voice, etc.).
    # slot rotates left=0/right=1 so two same-gender characters differ.
    # With no character on a side (0-char narrator clips), fall back to a
    # neutral voice so the narrator still has a defined voice.
    voice_left = opts.voice_left
    if not voice_left:
        voice_left = default_voice_for(opts.tts_provider, gender_by_side.get("left", "neutral"), slot=0)
    voice_right = opts.voice_right
    if not voice_right and "right" in gender_by_side:
        voice_right = default_voice_for(opts.tts_provider, gender_by_side["right"], slot=1)

    gameplay_clip = await db.get_gameplay_clip(opts.gameplay_clip_id)
    if gameplay_clip is None:
        raise HTTPException(status_code=404, detail="Unknown gameplay_clip_id")

    music_url = None
    if opts.music_asset_id:
        music_asset = await db.get_audio_asset(opts.music_asset_id)
        if music_asset is None:
            raise HTTPException(status_code=404, detail="Unknown music_asset_id")
        music_url = music_asset["gcs_path"]

    intro_sfx_url = None
    if opts.intro_sfx_id:
        asset = await db.get_audio_asset(opts.intro_sfx_id)
        if asset is None:
            raise HTTPException(status_code=404, detail="Unknown intro_sfx_id")
        intro_sfx_url = asset["gcs_path"]

    outro_sfx_url = None
    if opts.outro_sfx_id:
        asset = await db.get_audio_asset(opts.outro_sfx_id)
        if asset is None:
            raise HTTPException(status_code=404, detail="Unknown outro_sfx_id")
        outro_sfx_url = asset["gcs_path"]

    # Reserve 1 brainrot credit atomically (FOR UPDATE row lock — same
    # primitive jobs.py uses for YT-Shorts, but against the fully separate
    # brainrot_credits_used/brainrot_credits_limit pool — see
    # reserve_brainrot_credits() in db/supabase.py and migration 016).
    # Deliberately placed AFTER every validation step above so a bad
    # character/gameplay/audio id 404s without ever touching the user's
    # balance. A brainrot job always produces exactly one clip, so this is
    # a flat reserve-1 rather than the variable clip_count YT-Shorts uses.
    #
    # The reservation is only ever kept if the clip actually finishes —
    # brainrot_stage.py refunds it in full on failure at either stage
    # (script generation, TTS, or FFmpeg render), and the insert below
    # refunds it too if the job row itself fails to write. Net effect for
    # the user: a credit is only ever truly spent on a clip that reached them.
    reserved_credits = await db.reserve_brainrot_credits(current_user.user_id, 1)
    if reserved_credits < 1:
        raise HTTPException(
            status_code=402,
            detail="Monthly brainrot clip limit reached for your plan. Resets next month — upgrade to continue.",
        )

    payload = {
        "reserved_credits": reserved_credits,
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
        "tts_provider": opts.tts_provider,
        "motion_mode": opts.motion_mode,
        "music_asset_id": opts.music_asset_id,
        "music_volume": opts.music_volume,
        "music_url": music_url,
        "intro_sfx_id": opts.intro_sfx_id,
        "intro_sfx_url": intro_sfx_url,
        "outro_sfx_id": opts.outro_sfx_id,
        "outro_sfx_url": outro_sfx_url,
        "post_title": opts.post_title.strip(),
        "post_hashtags": opts.post_hashtags,
    }

    try:
        row = await db.insert_brainrot_job(current_user.user_id, payload)
    except Exception:
        await db.release_brainrot_credits(current_user.user_id, reserved_credits)
        raise
    job_id = str(row["job_id"])

    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        # No pg_notify channel for brainrot yet (Phase 1 simplification) —
        # the watcher's poll loop picks up 'created' rows on its own cadence.
        logger.info(f"[{job_id}] Brainrot job created — queued for watcher poll pickup")
    else:
        asyncio.create_task(run_brainrot_stage(job_id), name=f"brainrot-{job_id[:8]}")
        logger.info(f"[{job_id}] Brainrot job created — running in-process (single-service mode)")

    return {"job_id": job_id, "status": row["status"]}


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


def _serialize_brainrot_job(row: dict) -> dict:
    payload = row.get("payload") or {}
    return {
        "job_id": str(row["job_id"]),
        "status": row["status"],
        "progress": row["progress"],
        "current_step": row["current_step"],
        "output_url": row.get("output_url"),
        "error_message": row.get("error_message"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "script_input": payload.get("script_input", ""),
        "post_title": payload.get("post_title", ""),
        "post_hashtags": payload.get("post_hashtags", []),
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
        "tts_provider": payload.get("tts_provider"),
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
