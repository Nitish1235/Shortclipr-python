"""
factloop.py — /factloop endpoints for Factloop (AI data/fact video renderer).

Replaces the old /brainrot router. New product concept: one structured data
record (title + fact list + optional context) in → narrated data-recap
video out over gameplay footage. No character roster, no dialogue script
review, no confirm gate — one credit is reserved at job creation and the
pipeline runs script → image → TTS → render straight through.

  POST /factloop/jobs               — validate → reserve credit → INSERT job → dispatch
  GET  /factloop/jobs/{job_id}      — single job (create-flow live status polling)
  GET  /factloop/jobs               — list user's jobs (unfiltered)
  GET  /factloop/clips              — Studio "My clips" library: status filter + pagination
  POST /factloop/generate-post-meta — one-off title/hashtags for a candidate script
  GET  /factloop/gameplay-clips     — selectable gameplay backgrounds
  GET  /factloop/audio-assets       — music library
  GET  /factloop/voices             — voice picker options + preview URLs

Kill switch: FACTLOOP_OFFLINE gates every route with 503, mirroring the
frontend's src/App.jsx FACTLOOP_OFFLINE flag. Flip both together — one
without the other leaves either a dead UI or a UI whose calls all 503.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.captions import VALID_COLORS, VALID_STYLES
from app.pipeline.factloop_stage import run_factloop_api_stage
from app.pipeline.voice_catalog import default_voice_for_gender, find_voice, list_voices

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Kill switch ──────────────────────────────────────────────────
# Factloop is offline by default until the pivot is verified end-to-end;
# flip to False here AND in src/App.jsx's FACTLOOP_OFFLINE together to
# bring it online. Same paired-flag pattern the retired Brainrot router used.
FACTLOOP_OFFLINE = True


def _check_offline() -> None:
    if FACTLOOP_OFFLINE:
        raise HTTPException(status_code=503, detail="Factloop is temporarily unavailable.")


router = APIRouter(prefix="/factloop", tags=["factloop"], dependencies=[Depends(_check_offline)])

DEFAULT_CAPTION_STYLE = "brainrot"     # reuse the loud caption preset — reads well on gameplay bg
DEFAULT_CAPTION_COLOR = "yellow_black"
DEFAULT_CAPTION_Y = 0.82

MAX_FACTS_PER_JOB = 8
MIN_FACTS_PER_JOB = 1
MAX_TITLE_CHARS = 120
MAX_CONTEXT_CHARS = 400
MAX_FACT_LABEL_CHARS = 60
MAX_FACT_VALUE_CHARS = 40
MAX_FACT_UNIT_CHARS = 20

# Statuses shown as "in progress" in the Studio — mirrors the frontend's
# ACTIVE_STATUSES. No 'awaiting_review' here (there's no review step in
# Factloop — the whole reason the pipeline collapsed to 2 stages).
ACTIVE_JOB_STATUSES = {"created", "generating_script", "synthesizing_voice", "rendering"}
CLIPS_FETCH_CAP = 300


# ── Request schema ──────────────────────────────────────────────

class FactloopFact(BaseModel):
    key: str          # stable identifier the narration script references (script_stage.stat_key)
    label: str        # human label — displayed under the number in the callout ("Runs", "Matches")
    value: str        # the raw value as a string — parsed for count-up if numeric, shown as-is otherwise
    unit: str | None = None   # optional suffix ("kg", "km", "$" — appended after the number)

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("fact.key can't be empty")
        return v[:40]

    @field_validator("label")
    @classmethod
    def validate_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("fact.label can't be empty")
        return v[:MAX_FACT_LABEL_CHARS]

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("fact.value can't be empty")
        return v[:MAX_FACT_VALUE_CHARS]

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v[:MAX_FACT_UNIT_CHARS] if v else None


class FactloopJobOptions(BaseModel):
    title: str
    facts: list[FactloopFact]
    context: str = ""
    gameplay_clip_id: str
    duration_seconds: int = 30
    caption_style: str = DEFAULT_CAPTION_STYLE
    caption_color: str = DEFAULT_CAPTION_COLOR
    caption_y: float = DEFAULT_CAPTION_Y
    voice_id: str = ""                  # empty = auto-assign (see create_factloop_job)
    music_asset_id: str | None = None
    music_volume: float = 0.3
    post_title: str = ""
    post_hashtags: list[str] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title is required")
        return v[:MAX_TITLE_CHARS]

    @field_validator("context")
    @classmethod
    def clamp_context(cls, v: str) -> str:
        return (v or "").strip()[:MAX_CONTEXT_CHARS]

    @field_validator("facts")
    @classmethod
    def validate_facts(cls, v: list[FactloopFact]) -> list[FactloopFact]:
        if len(v) < MIN_FACTS_PER_JOB:
            raise ValueError(f"at least {MIN_FACTS_PER_JOB} fact is required")
        v = v[:MAX_FACTS_PER_JOB]
        keys = [f.key for f in v]
        if len(set(keys)) != len(keys):
            raise ValueError("fact keys must be unique")
        return v

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

    @field_validator("music_volume")
    @classmethod
    def clamp_music_volume(cls, v: float) -> float:
        return max(0.2, min(0.6, v))


class CreateFactloopJobRequest(BaseModel):
    options: FactloopJobOptions


# ── POST /factloop/jobs ──────────────────────────────────────────

@router.post("/jobs", status_code=201)
async def create_factloop_job(body: CreateFactloopJobRequest, current_user: CurrentUser):
    opts = body.options

    active = await db.count_active_brainrot_jobs(current_user.user_id)
    if active >= settings.MAX_CONCURRENT_BRAINROT_JOBS_PER_USER:
        raise HTTPException(
            status_code=429,
            detail="You already have a Factloop clip generating. Wait for it to finish before starting another.",
        )

    recent = await db.count_recent_brainrot_jobs(current_user.user_id, datetime.now(timezone.utc) - timedelta(hours=1))
    if recent >= settings.MAX_BRAINROT_JOBS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail=f"Only {settings.MAX_BRAINROT_JOBS_PER_HOUR} Factloop clips allowed per hour. Try again in a bit.",
        )

    gameplay_clip = await db.get_gameplay_clip(opts.gameplay_clip_id)
    if gameplay_clip is None:
        raise HTTPException(status_code=404, detail="Unknown gameplay_clip_id")

    music_url = None
    if opts.music_asset_id:
        music_asset = await db.get_audio_asset(opts.music_asset_id)
        if music_asset is None:
            raise HTTPException(status_code=404, detail="Unknown music_asset_id")
        music_url = music_asset["gcs_path"]

    # Resolve voice: user pick, else a sensible neutral default. No
    # left/right split — Factloop has one narrator, always.
    voice_id = opts.voice_id.strip()
    if voice_id and find_voice(voice_id) is None:
        raise HTTPException(status_code=400, detail=f"Unknown voice_id: {voice_id}")
    if not voice_id:
        voice_id = default_voice_for_gender("neutral", slot=0).voice_id

    # Reserve the credit UP FRONT (no review gate — the pipeline runs
    # straight through). Refund happens automatically on any stage failure
    # via _fail_and_refund in factloop_stage.py.
    reserved_credits = await db.reserve_brainrot_credits(current_user.user_id, 1)
    if reserved_credits < 1:
        raise HTTPException(
            status_code=402,
            detail="Monthly Factloop clip limit reached for your plan. Resets next month — upgrade to continue.",
        )

    payload = {
        "reserved_credits": reserved_credits,
        "title": opts.title,
        "facts": [f.model_dump() for f in opts.facts],
        "context": opts.context,
        "gameplay_clip_id": opts.gameplay_clip_id,
        "gameplay_clip_url": gameplay_clip["gcs_path"],
        "duration_seconds": opts.duration_seconds,
        "caption_style": opts.caption_style,
        "caption_color": opts.caption_color,
        "caption_y": opts.caption_y,
        "voice_id": voice_id,
        "music_asset_id": opts.music_asset_id,
        "music_volume": opts.music_volume,
        "music_url": music_url,
        "post_title": opts.post_title.strip(),
        "post_hashtags": opts.post_hashtags,
    }

    try:
        row = await db.insert_brainrot_job(current_user.user_id, payload)
    except Exception:
        # Unwind the just-taken credit if the insert itself fails, so the
        # user isn't billed for a job that never existed.
        with __import__("contextlib").suppress(Exception):
            await db.release_brainrot_credits(current_user.user_id, reserved_credits)
        raise
    job_id = str(row["job_id"])

    split_worker_mode = bool(settings.FFMPEG_WORKER_URLS.strip())
    if split_worker_mode:
        # The watcher's existing claim_brainrot_api_job query
        # (backend/watcher/dispatcher.py) picks up status='created' rows on
        # its pg_notify + poll cadence — same claim path the old script
        # stage used, still works verbatim.
        logger.info(f"[{job_id}] Factloop job created — queued for watcher poll pickup")
    else:
        # Same race-closing pattern brainrot.py used: flip status BEFORE
        # firing the background task, since the always-running watcher
        # listens for pg_notify on every brainrot_jobs insert regardless
        # of this service's own mode.
        await db.update_brainrot_job_progress(job_id, 5, "Starting...", status="generating_script")
        asyncio.create_task(run_factloop_api_stage(job_id), name=f"factloop-{job_id[:8]}")
        logger.info(f"[{job_id}] Factloop job created — running in-process (single-service mode)")

    return {"job_id": job_id, "status": row["status"] if split_worker_mode else "generating_script"}


# ── GET /factloop/jobs/{id} ─────────────────────────────────────

@router.get("/jobs/{job_id}")
async def get_factloop_job(job_id: str, current_user: CurrentUser):
    job = await db.get_brainrot_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _serialize_job(job)


@router.get("/jobs")
async def list_factloop_jobs(current_user: CurrentUser):
    rows = await db.list_brainrot_jobs(current_user.user_id)
    return {"jobs": [_serialize_job(r) for r in rows]}


# ── GET /factloop/clips ─────────────────────────────────────────

@router.get("/clips")
async def list_factloop_clips(
    current_user: CurrentUser,
    status: str = Query("all", pattern="^(all|active|complete)$"),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    rows = await db.list_brainrot_clips_source(current_user.user_id, limit=CLIPS_FETCH_CAP)
    all_clips = [c for c in (_serialize_job(r) for r in rows) if c["status"] != "failed"]

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


def _serialize_job(row: dict) -> dict:
    payload = row.get("payload") or {}
    status = row["status"]
    output_url = row.get("output_url")
    error_message = row.get("error_message")
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
        "title": payload.get("title", ""),
        "facts": payload.get("facts", []),
        # {stat_key: {"url": ..., "source": "pexels"|"unsplash"|"pixabay"|"ai"}} —
        # one entry per fact (see factloop_image.generate_images_for_lines).
        "generated_images": payload.get("generated_images", {}),
        "post_title": payload.get("post_title", ""),
        "post_hashtags": payload.get("post_hashtags", []),
        "scene_plan": row.get("scene_plan") or [],
    }


# ── POST /factloop/generate-post-meta ────────────────────────────

class PostMetaRequest(BaseModel):
    script_input: str


@router.post("/generate-post-meta")
async def generate_post_meta(body: PostMetaRequest, current_user: CurrentUser):
    """Optional preview call — mostly used for hooking title/hashtags into
    the frontend's compose step before a job runs. Same GPT client the
    factloop_script.py narrator uses."""
    from app.pipeline.factloop_script import _client as _openai, SCRIPT_MODEL
    import json as _json

    script = body.script_input.strip()[:600]
    if not script:
        return {"title": "", "hashtags": []}

    prompt = (
        "You write viral social media metadata for short-form video (TikTok / YouTube Shorts).\n\n"
        f"Video subject / draft:\n{script}\n\n"
        "Return ONLY valid JSON with exactly two keys:\n"
        "  \"title\"     — one punchy post title under 80 characters, no hashtags inside it\n"
        "  \"hashtags\"  — array of 6-8 relevant hashtags WITH the # sign, e.g. [\"#stats\", \"#fyp\"]\n\n"
        "Rules: title must grab attention in < 5 words; hashtags mix trending (#fyp #viral) "
        "with subject-specific ones. Return nothing except the JSON object."
    )
    try:
        resp = await _openai.chat.completions.create(
            model=SCRIPT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
            response_format={"type": "json_object"},
        )
        data = _json.loads(resp.choices[0].message.content or "{}")
        title = str(data.get("title", "")).strip()[:100]
        hashtags = [str(h).strip() for h in data.get("hashtags", []) if h][:10]
        return {"title": title, "hashtags": hashtags}
    except Exception as exc:
        logger.warning(f"generate-post-meta failed: {exc}")
        return {"title": "", "hashtags": []}


# ── GET /factloop/gameplay-clips ─────────────────────────────────

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


# ── GET /factloop/audio-assets ───────────────────────────────────

@router.get("/audio-assets")
async def list_audio_assets(asset_type: str | None = Query(default=None, alias="type")):
    if asset_type and asset_type not in ("music", "sfx"):
        raise HTTPException(status_code=400, detail="type must be 'music' or 'sfx'")
    # Factloop's Studio only exposes music (no per-motion SFX exists in
    # this product anymore), but the endpoint still forwards `type` so an
    # admin/curation tool can still filter.
    assets = await db.list_audio_assets(asset_type)
    return {"assets": [
        {
            "id": str(a["id"]), "asset_type": a["asset_type"], "category": a.get("category"),
            "name": a["name"], "gcs_path": a["gcs_path"], "duration_seconds": a.get("duration_seconds"),
        }
        for a in assets
    ]}


# ── GET /factloop/voices ─────────────────────────────────────────

@router.get("/voices")
async def get_voices(
    provider: str | None = Query(default=None),
    locale: str | None = Query(default=None),
):
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
