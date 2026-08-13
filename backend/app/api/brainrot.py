"""
brainrot.py — /brainrot endpoints for the Brainrot Clips Maker.

POST /brainrot/jobs               — validate → resolve assets → INSERT job → dispatch
GET  /brainrot/jobs/{job_id}      — single job
GET  /brainrot/jobs               — list user's jobs
GET  /brainrot/characters         — the 105-character roster (from GCS, see brainrot_characters.py)
GET  /brainrot/gameplay-clips     — selectable gameplay backgrounds (optional ?category=)
GET  /brainrot/audio-assets       — music/SFX library (optional ?type=music|sfx)

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
    voice_left: str = ""
    voice_right: str = ""
    tts_provider: str = "unrealspeech"
    motion_mode: str = "turn_based"
    music_asset_id: str | None = None
    music_volume: float = 0.3
    intro_sfx_id: str | None = None
    outro_sfx_id: str | None = None

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
            detail=f"You already have {active} brainrot clip(s) in progress. Wait for one to finish first.",
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

    payload = {
        "script_input": opts.script_input.strip(),
        "character_ids": [p["character_id"] for p in character_positions],
        "character_positions": character_positions,
        "gameplay_clip_id": opts.gameplay_clip_id,
        "gameplay_clip_url": gameplay_clip["gcs_path"],
        "duration_seconds": opts.duration_seconds,
        "caption_style": opts.caption_style,
        "caption_color": opts.caption_color,
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
    }

    row = await db.insert_brainrot_job(current_user.user_id, payload)
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
    return {
        "job_id": str(row["job_id"]),
        "status": row["status"],
        "progress": row["progress"],
        "current_step": row["current_step"],
        "output_url": row.get("output_url"),
        "error_message": row.get("error_message"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
    }


# ── GET /brainrot/characters ─────────────────────────────────────

@router.get("/characters")
async def list_characters():
    return {"characters": await get_character_roster()}


# ── GET /brainrot/gameplay-clips ─────────────────────────────────

@router.get("/gameplay-clips")
async def list_gameplay_clips(category: str | None = Query(default=None)):
    clips = await db.list_gameplay_clips(category)
    return {"clips": [
        {
            "id": str(c["id"]), "category": c["category"], "gcs_path": c["gcs_path"],
            "thumbnail_url": c.get("thumbnail_url"), "duration_seconds": c["duration_seconds"],
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
async def admin_generate_voice_samples(current_user: CurrentUser):
    """Admin: auto-generate a preview sample for every voice in the catalog.
    Runs in background — each voice gets a short TTS clip uploaded to GCS."""
    _require_admin(current_user)
    if _voice_gen["running"]:
        raise HTTPException(status_code=409, detail="Voice generation already running")

    asyncio.create_task(_generate_all_voice_samples(), name="voice-sample-gen")
    return {"status": "started", "total_voices": len(list_voices())}


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


async def _generate_all_voice_samples() -> None:
    from app.pipeline.tts import synthesize
    from app.pipeline.uploader import upload_voice_sample

    all_voices = list_voices()
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

@router.post("/admin/gameplay", status_code=202)
async def admin_upload_gameplay(
    current_user: CurrentUser,
    youtube_url: str = Form(...),
    category: str = Form(...),
    title: str | None = Form(default=None),
):
    """Admin: submit a YouTube gameplay recording. It's trimmed (first 30s dropped),
    split into ≤120s clips, reframed to 9:16, and thumbnailed in the background using DASH."""
    _require_admin(current_user)
    if not category.strip():
        raise HTTPException(status_code=400, detail="category is required")
    url = youtube_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="youtube_url is required")

    from app.pipeline.brainrot_gameplay import process_gameplay_source_youtube
    import re
    
    # Extract video ID
    video_id = None
    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
    if match:
        video_id = match.group(1)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    # We just store the youtube URL in the DB instead of a GCS source blob
    row = await db.insert_gameplay_source(category.strip(), (title or "").strip() or None, f"youtube:{video_id}", current_user.user_id)
    source_id = str(row["id"])

    tmp_dir = Path(tempfile.mkdtemp(prefix="gameplay_src_"))

    async def _task():
        try:
            await process_gameplay_source_youtube(source_id, video_id, category.strip(), tmp_dir)
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)

    asyncio.create_task(_task(), name=f"gameplay-{source_id[:8]}")
    logger.info(f"Admin {current_user.email} submitted gameplay youtube {video_id} ({category})")
    return {"source_id": source_id, "status": "processing"}


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
