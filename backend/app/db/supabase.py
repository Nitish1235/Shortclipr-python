"""
db.py — Direct PostgreSQL database layer using asyncpg.

Uses only SUPABASE_DB_URL (postgresql:// connection string).
No Supabase client SDK required — Supabase Realtime still fires
because it listens to WAL (database writes), not the client library.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg

from app.core.config import get_settings
from app.core.plan_limits import get_max_video_minutes, get_video_minutes_limit

logger = logging.getLogger(__name__)
settings = get_settings()

# Below this, clamping to "whatever's left" wouldn't yield anything a clip
# could actually be cut from — reject outright instead of reserving a
# near-zero sliver. Mirrors MIN_GATEWAY_SECONDS (60s) in jobs.py/orchestrator.py.
MIN_BILLABLE_MINUTES = 1.0

# ── Connection pool singleton ─────────────────────────────────
_pool: asyncpg.Pool | None = None

_DB_CONNECT_RETRIES = 3
_DB_CONNECT_DELAY   = 2.0   # seconds between retries


async def _init_connection(conn: asyncpg.Connection) -> None:
    # asyncpg returns JSONB columns as raw strings by default — without this,
    # payload dicts (e.g. ffmpeg_payload) come back as str and json_payload["x"]
    # does string indexing instead of dict lookup.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog",
    )


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    url = settings.SUPABASE_DB_URL
    if not url:
        raise RuntimeError(
            "SUPABASE_DB_URL is not set. "
            "For Cloud Run: add the env var in the service configuration. "
            "Use the Supabase connection-pooler URL (port 6543) for serverless."
        )

    # Mask credentials for safe logging
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        masked = url.replace(parsed.password or "", "****") if parsed.password else url
    except Exception:
        masked = url[:30] + "..."

    last_err: Exception | None = None
    for attempt in range(1, _DB_CONNECT_RETRIES + 1):
        try:
            logger.info(f"DB pool connecting (attempt {attempt}/{_DB_CONNECT_RETRIES}): {masked}")
            _pool = await asyncpg.create_pool(
                dsn=url,
                min_size=1,
                max_size=10,
                command_timeout=30,
                statement_cache_size=0,
                # Supabase requires SSL — enforce it even if not in URL
                ssl="require",
                init=_init_connection,
            )
            logger.info("DB pool ready")
            return _pool
        except Exception as e:
            last_err = e
            logger.warning(f"DB pool attempt {attempt} failed: {e}")
            if attempt < _DB_CONNECT_RETRIES:
                await asyncio.sleep(_DB_CONNECT_DELAY)

    raise RuntimeError(
        f"Could not connect to Supabase after {_DB_CONNECT_RETRIES} attempts. "
        f"URL tried: {masked}. "
        f"If using a direct URL (port 5432) switch to the connection-pooler URL "
        f"(port 6543) — Supabase → Project Settings → Database → Connection pooling. "
        f"Last error: {last_err}"
    ) from last_err


# ── Helpers ───────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _execute(query: str, *args) -> str:
    pool = await get_pool()
    return await pool.execute(query, *args)


async def _fetch(query: str, *args) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(query, *args)
    return [dict(r) for r in rows]


async def _fetchrow(query: str, *args) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(query, *args)
    return dict(row) if row else None


# ── Job operations ────────────────────────────────────────────

async def update_job_progress(
    job_id: str,
    progress: int,
    current_step: str,
    status: str = "processing",
    extra: dict | None = None,
) -> None:
    """Update job row — triggers Supabase Realtime event to frontend."""
    await _execute(
        """
        UPDATE jobs
        SET status=$1, progress=$2, current_step=$3, updated_at=$4
        WHERE job_id=$5
        """,
        status, progress, current_step, _now(), job_id,
    )
    logger.info(f"Job {job_id} → {progress}% [{current_step}]")


async def fail_job(job_id: str, error_message: str) -> None:
    await _execute(
        """
        UPDATE jobs
        SET status='failed', progress=0, error_message=$1, updated_at=$2
        WHERE job_id=$3
        """,
        error_message[:1000], _now(), job_id,
    )


async def complete_job(job_id: str, clip_count: int) -> None:
    await _execute(
        """
        UPDATE jobs
        SET status='completed', progress=100, current_step='Done',
            clip_count=$1, completed_at=$2, updated_at=$2
        WHERE job_id=$3
        """,
        clip_count, _now(), job_id,
    )


async def get_job(job_id: str) -> dict | None:
    return await _fetchrow("SELECT * FROM jobs WHERE job_id=$1", job_id)


async def find_stuck_jobs(older_than_minutes: int) -> list[dict]:
    """
    Jobs stuck longer than expected in any pre-terminal state:
      - 'created'          — watcher never claimed (API queue)
      - 'dispatched'       — legacy unified-worker dispatch stalled
      - 'api_processing'   — API worker crashed / never returned
      - 'api_done'         — watcher never claimed for FFmpeg queue
      - 'ffmpeg_processing'— FFmpeg worker crashed mid-encode (uses 3× the
                             timeout since it's the slow stage)

    Used by the reconciliation sweep to retry or fail+refund these jobs.
    """
    return await _fetch(
        """
        SELECT job_id, user_id, status, clip_count, reserved_video_minutes, retry_count
        FROM jobs
        WHERE (status = 'created'          AND start_after         < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'dispatched'       AND dispatched_at       < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_processing'   AND api_dispatched_at   < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_done'         AND api_completed_at    < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'ffmpeg_processing' AND ffmpeg_dispatched_at < NOW() - ($1::int * 3 || ' minutes')::interval)
        """,
        str(older_than_minutes),
    )


# ── Split-worker state transitions ─────────────────────────────
# Called by api_stage.py / ffmpeg_stage.py to move a job through the
# split-pipeline status flow. See migrations/005_split_workers.sql for
# the full flow diagram.

async def set_job_api_processing(job_id: str) -> None:
    """API worker has picked up the job and started the API stage."""
    await _execute(
        """
        UPDATE jobs
        SET status = 'api_processing',
            updated_at = NOW()
        WHERE job_id = $1
        """,
        job_id,
    )


async def set_job_api_done(job_id: str, ffmpeg_payload: dict) -> None:
    """
    API stage finished. Writes the FFmpeg-stage payload atomically with the
    status flip — the pg_notify('api_done') fires from the trigger, no
    separate call needed. FFmpeg worker will read ffmpeg_payload from the row.
    """
    await _execute(
        """
        UPDATE jobs
        SET status           = 'api_done',
            pipeline_stage   = 'ffmpeg',
            ffmpeg_payload   = $2::jsonb,
            api_completed_at = NOW(),
            updated_at       = NOW()
        WHERE job_id = $1
        """,
        job_id, ffmpeg_payload,
    )


async def set_job_ffmpeg_processing(job_id: str) -> None:
    """FFmpeg worker has picked up the job and started the encoding stage."""
    await _execute(
        """
        UPDATE jobs
        SET status = 'ffmpeg_processing',
            updated_at = NOW()
        WHERE job_id = $1
        """,
        job_id,
    )


async def get_job_with_ffmpeg_payload(job_id: str) -> dict | None:
    """
    Fetch just the columns FFmpeg stage needs — avoids pulling the full row
    with all reservation/status metadata that the FFmpeg stage doesn't touch.
    """
    return await _fetchrow(
        """
        SELECT job_id, user_id, youtube_url, ffmpeg_payload
        FROM jobs
        WHERE job_id = $1
        """,
        job_id,
    )


async def update_job_metadata(job_id: str, video_title: str, video_duration: int) -> None:
    await _execute(
        "UPDATE jobs SET video_title=$1, video_duration=$2 WHERE job_id=$3",
        video_title, video_duration, job_id,
    )


# ── Brainrot job operations ─────────────────────────────────────
# Parallel to the `jobs` functions above but scoped to `brainrot_jobs` — kept
# separate rather than parameterizing the existing functions by table name,
# since the two tables' columns diverge (payload/scene_plan vs.
# queue_payload/ffmpeg_payload) and mixing them would make both harder to read.

async def insert_brainrot_job(user_id: str, payload: dict) -> dict:
    row = await _fetchrow(
        """
        INSERT INTO brainrot_jobs (user_id, payload)
        VALUES ($1, $2::jsonb)
        RETURNING job_id, user_id, status, progress, created_at
        """,
        user_id, payload,
    )
    return row


async def get_brainrot_job(job_id: str) -> dict | None:
    return await _fetchrow("SELECT * FROM brainrot_jobs WHERE job_id=$1", job_id)


async def list_brainrot_jobs(user_id: str, limit: int = 50) -> list[dict]:
    return await _fetch(
        "SELECT * FROM brainrot_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
        user_id, limit,
    )


async def list_brainrot_clips_source(user_id: str, limit: int = 300) -> list[dict]:
    """Backs GET /brainrot/clips — the Studio "My clips" library's own
    endpoint, kept separate from list_brainrot_jobs (used for the create
    flow's job-status polling). Fetches a wider recent window than the
    jobs list; the endpoint itself does status filtering/pagination/counts
    in Python (see _serialize_brainrot_job's output_url-overrides-status
    rule, which a raw SQL count would have to duplicate to stay correct)."""
    return await _fetch(
        "SELECT * FROM brainrot_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
        user_id, limit,
    )


async def update_brainrot_job_progress(
    job_id: str, progress: int, current_step: str, status: str = "processing",
) -> None:
    await _execute(
        """
        UPDATE brainrot_jobs
        SET status=$1, progress=$2, current_step=$3, updated_at=$4
        WHERE job_id=$5
        """,
        status, progress, current_step, _now(), job_id,
    )
    logger.info(f"Brainrot job {job_id} → {progress}% [{current_step}]")


async def touch_brainrot_job(job_id: str) -> None:
    """Bumps updated_at only — no status/progress change. Called periodically
    while a long-running FFmpeg-stage step (asset downloads, the ffmpeg
    subprocess) is genuinely still alive, so the watcher's stuck-job
    reconciler doesn't mistake a slow-but-working job for a dead one."""
    await _execute("UPDATE brainrot_jobs SET updated_at=$1 WHERE job_id=$2", _now(), job_id)


async def set_brainrot_scene_plan(job_id: str, scene_plan: list[dict]) -> None:
    await _execute(
        "UPDATE brainrot_jobs SET scene_plan=$1::jsonb, updated_at=$2 WHERE job_id=$3",
        scene_plan, _now(), job_id,
    )


async def set_brainrot_post_meta(job_id: str, post_title: str, post_hashtags: list[str]) -> None:
    """
    Overwrites just post_title/post_hashtags inside the payload JSONB, once
    they've been (re)generated from the actual finished dialogue rather than
    the raw topic seed submitted at job creation. `payload || $1::jsonb`
    merges only these two keys — every other key in payload is left as-is.
    """
    patch = {"post_title": post_title, "post_hashtags": post_hashtags}
    await _execute(
        "UPDATE brainrot_jobs SET payload = payload || $1::jsonb, updated_at=$2 WHERE job_id=$3",
        patch, _now(), job_id,
    )


async def set_job_api_done_brainrot(job_id: str) -> None:
    """API stage finished for a brainrot job. Sets status to api_done to trigger FFmpeg dispatch."""
    await _execute(
        """
        UPDATE brainrot_jobs
        SET status = 'api_done',
            updated_at = NOW()
        WHERE job_id = $1
        """,
        job_id,
    )


async def complete_brainrot_job(job_id: str, output_url: str) -> None:
    await _execute(
        """
        UPDATE brainrot_jobs
        SET status='complete', progress=100, current_step='Done',
            output_url=$1, updated_at=$2
        WHERE job_id=$3
        """,
        output_url, _now(), job_id,
    )


async def fail_brainrot_job(job_id: str, error_message: str) -> None:
    """No-op if the job already reached 'complete'. Guards a real race: the
    render/upload can finish and call complete_brainrot_job at nearly the
    same instant the stage's outer BRAINROT_STAGE_TIMEOUT_SECONDS timeout
    fires and calls this too. Without this guard, a successfully-delivered
    clip gets silently flipped back to 'failed' (output_url/current_step
    stay from the completion since this UPDATE never touched them, but
    status and error_message get clobbered) — and _fail_and_refund would
    then refund a credit for a clip the user actually received."""
    await _execute(
        """
        UPDATE brainrot_jobs
        SET status='failed', error_message=$1, updated_at=$2
        WHERE job_id=$3 AND status != 'complete'
        """,
        error_message[:1000], _now(), job_id,
    )


# ── Brainrot signature casts ─────────────────────────────────────
# User-saved character pairs — see migration 013. Small, deliberately
# unopinionated: no per-cast voice/position overrides, just "these two
# characters, in this order" — the studio re-hydrates everything else
# (art, default voice, entry motion) from the live roster on load.

async def insert_signature_cast(user_id: str, character_ids: list[str], label: str | None) -> dict:
    return await _fetchrow(
        """
        INSERT INTO brainrot_signature_casts (user_id, character_ids, label)
        VALUES ($1, $2::text[], $3)
        RETURNING id, user_id, character_ids, label, created_at
        """,
        user_id, character_ids, label,
    )


async def list_signature_casts(user_id: str) -> list[dict]:
    return await _fetch(
        "SELECT * FROM brainrot_signature_casts WHERE user_id=$1 ORDER BY created_at DESC",
        user_id,
    )


async def count_signature_casts(user_id: str) -> int:
    row = await _fetchrow(
        "SELECT COUNT(*) AS n FROM brainrot_signature_casts WHERE user_id=$1", user_id,
    )
    return row["n"] if row else 0


async def delete_signature_cast(cast_id: str, user_id: str) -> bool:
    result = await _execute(
        "DELETE FROM brainrot_signature_casts WHERE id=$1 AND user_id=$2",
        cast_id, user_id,
    )
    return result.endswith(" 1")  # asyncpg returns "DELETE <n>"


# ── Brainrot gameplay + audio library ───────────────────────────
# Read-mostly lookup tables managed by the Phase 3 admin upload UI —
# Phase 1 only needs the read side (job creation resolves ids to gcs_path).

async def get_gameplay_clip(clip_id: str) -> dict | None:
    return await _fetchrow(
        "SELECT * FROM brainrot_gameplay_clips WHERE id=$1", clip_id,
    )


async def list_gameplay_clips(category: str | None = None, status: str | None = None) -> list[dict]:
    query = """SELECT c.*, s.title as source_title 
               FROM brainrot_gameplay_clips c
               LEFT JOIN brainrot_gameplay_sources s ON c.source_id = s.id
               WHERE 1=1"""
    args = []
    
    if category:
        args.append(category)
        query += f" AND c.category=${len(args)}"
    if status:
        args.append(status)
        query += f" AND c.status=${len(args)}"
        
    query += " ORDER BY c.category, c.created_at DESC"
    return await _fetch(query, *args)

async def admin_list_gameplay_clips() -> list[dict]:
    return await _fetch(
        """SELECT c.*, s.title as source_title 
           FROM brainrot_gameplay_clips c
           LEFT JOIN brainrot_gameplay_sources s ON c.source_id = s.id
           ORDER BY c.created_at DESC"""
    )

async def update_gameplay_clip_status(clip_id: str, status: str) -> None:
    await _execute(
        "UPDATE brainrot_gameplay_clips SET status=$1 WHERE id=$2",
        status, clip_id,
    )


async def get_audio_asset(asset_id: str) -> dict | None:
    return await _fetchrow(
        "SELECT * FROM brainrot_audio_assets WHERE id=$1", asset_id,
    )


async def get_audio_asset_by_category(asset_type: str, category: str) -> dict | None:
    """Motion-linked entry/exit stinger lookup — admin uploads one 'sfx'
    asset per motion id (category='slide', 'bounce', etc., see
    animation_catalog.MOTIONS) via the existing Music & SFX admin form, no
    new admin UI needed. Case-insensitive since category is free-typed."""
    return await _fetchrow(
        "SELECT * FROM brainrot_audio_assets WHERE asset_type=$1 AND lower(category)=lower($2) "
        "ORDER BY created_at DESC LIMIT 1",
        asset_type, category,
    )


async def list_audio_assets(asset_type: str | None = None) -> list[dict]:
    if asset_type:
        return await _fetch(
            "SELECT * FROM brainrot_audio_assets WHERE asset_type=$1 ORDER BY created_at DESC",
            asset_type,
        )
    return await _fetch("SELECT * FROM brainrot_audio_assets ORDER BY asset_type, created_at DESC")


# ── Brainrot admin: gameplay + audio library writes (Phase 3) ───

async def insert_gameplay_source(
    category: str,
    title: str | None,
    gcs_path: str,
    uploaded_by: str | None,
    video_id: str | None = None,
    initial_status: str = "created",
) -> dict:
    return await _fetchrow(
        """INSERT INTO brainrot_gameplay_sources (category, title, gcs_path, uploaded_by, video_id, category_cached, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
        category, title, gcs_path, uploaded_by, video_id, category, initial_status,
    )


async def set_gameplay_source_status(source_id: str, status: str, error_message: str | None = None) -> None:
    await _execute(
        "UPDATE brainrot_gameplay_sources SET status=$1, error_message=$2 WHERE id=$3",
        status, (error_message or None), source_id,
    )


async def insert_gameplay_clip(
    source_id: str, category: str, gcs_path: str, thumbnail_url: str | None, duration_seconds: float,
) -> dict:
    return await _fetchrow(
        """INSERT INTO brainrot_gameplay_clips (source_id, category, gcs_path, thumbnail_url, duration_seconds)
           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
        source_id, category, gcs_path, thumbnail_url, duration_seconds,
    )


async def list_gameplay_sources() -> list[dict]:
    return await _fetch(
        """SELECT s.*, (SELECT COUNT(*) FROM brainrot_gameplay_clips c WHERE c.source_id = s.id) AS clip_count
           FROM brainrot_gameplay_sources s ORDER BY s.created_at DESC""",
    )


async def insert_audio_asset(
    asset_type: str, category: str | None, name: str, gcs_path: str,
    duration_seconds: float | None, uploaded_by: str | None,
) -> dict:
    return await _fetchrow(
        """INSERT INTO brainrot_audio_assets (asset_type, category, name, gcs_path, duration_seconds, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        asset_type, category, name, gcs_path, duration_seconds, uploaded_by,
    )


async def delete_audio_asset(asset_id: str) -> None:
    await _execute("DELETE FROM brainrot_audio_assets WHERE id=$1", asset_id)


# ── Voice samples ────────────────────────────────────────────

async def upsert_voice_sample(
    provider: str, voice_id: str, locale: str, gcs_url: str, duration_seconds: float | None,
) -> dict:
    return await _fetchrow(
        """INSERT INTO brainrot_voice_samples (provider, voice_id, locale, gcs_url, duration_seconds)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (provider, voice_id)
           DO UPDATE SET gcs_url=$4, duration_seconds=$5, locale=$3, created_at=now()
           RETURNING *""",
        provider, voice_id, locale, gcs_url, duration_seconds,
    )


async def list_voice_samples() -> list[dict]:
    return await _fetch(
        "SELECT * FROM brainrot_voice_samples ORDER BY provider, voice_id",
    )


# ── Clip operations ───────────────────────────────────────────

async def insert_clip(clip_data: dict) -> dict:
    """
    Insert clip row immediately after upload.
    Triggers Supabase Realtime INSERT event → frontend card appears.
    """
    cols = list(clip_data.keys())
    placeholders = []
    values = []
    for i, c in enumerate(cols):
        v = clip_data[c]
        if isinstance(v, (list, dict)):
            placeholders.append(f"${i+1}::jsonb")
            values.append(v)
        else:
            placeholders.append(f"${i+1}")
            values.append(v)
    col_names = ", ".join(cols)

    row = await _fetchrow(
        f"INSERT INTO clips ({col_names}) VALUES ({', '.join(placeholders)}) RETURNING *",
        *values,
    )
    return row or {}


async def update_clip_final_url(
    clip_id: str,
    video_url: str,
    raw_video_url: str,
    thumbnail_url: str,
    captions_data: list | None = None,
) -> None:
    """
    Called after the full vertical encode + upload completes.
    Marks clip as ready (clip_ready=TRUE) and sets final URLs.
    Supabase Realtime fires UPDATE event → frontend card swaps from
    360p preview to full HD vertical clip.
    """
    await _execute(
        """UPDATE clips
           SET video_url=$2, raw_video_url=$3, thumbnail_url=$4,
               captions_data=COALESCE($5::jsonb, captions_data),
               clip_ready=TRUE
           WHERE clip_id=$1""",
        clip_id, video_url, raw_video_url, thumbnail_url,
        captions_data,
    )


async def delete_clip(clip_id: str) -> None:
    """Remove a clip row that never finished encoding/uploading — called
    when _process_one_clip fails after insert_clip() so a permanent
    clip_ready=FALSE orphan row isn't left behind (see ffmpeg_stage.py)."""
    await _execute("DELETE FROM clips WHERE clip_id=$1 AND clip_ready=FALSE", clip_id)


async def get_clips_for_job(job_id: str) -> list[dict]:
    return await _fetch(
        "SELECT * FROM clips WHERE job_id=$1 ORDER BY viral_score DESC",
        job_id,
    )


# ── Showcase protection ────────────────────────────────────────
# Clips added to the public admin showcase (see admin.py) get is_showcased=TRUE
# so the delete-job path in jobs.py can skip them + their GCS files. See
# migrations/006_clip_retention.sql for the schema.

async def mark_clip_showcased(clip_id: str) -> None:
    """Flag a clip as showcased so it survives its job's deletion."""
    await _execute(
        "UPDATE clips SET is_showcased = TRUE WHERE clip_id = $1",
        clip_id,
    )


async def unmark_clip_showcased(clip_id: str) -> None:
    """Called when an admin removes a clip from the showcase — restores
    normal delete behaviour on that clip's job."""
    await _execute(
        "UPDATE clips SET is_showcased = FALSE WHERE clip_id = $1",
        clip_id,
    )


async def get_showcased_clip_ids_for_job(job_id: str) -> list[str]:
    """
    Return the clip_ids of showcased clips in a job. Used by DELETE /jobs/{id}
    to (a) skip them in the DELETE FROM clips, and (b) tell the GCS cleanup
    task which blob paths to leave in place.
    """
    rows = await _fetch(
        "SELECT clip_id FROM clips WHERE job_id = $1 AND is_showcased = TRUE",
        job_id,
    )
    return [str(r["clip_id"]) for r in rows]


# ── Post-queue feedback survey (migration 007) ─────────────────

async def has_submitted_feedback(user_id: str) -> bool:
    """True if this user has already submitted the feedback survey —
    UNIQUE(user_id) on job_feedback means at most one row ever exists."""
    row = await _fetchrow("SELECT 1 FROM job_feedback WHERE user_id = $1", user_id)
    return row is not None


async def insert_job_feedback(
    job_id: str,
    user_id: str,
    source: str | None,
    source_other: str | None,
    visit_reason: str | None,
    visit_reason_other: str | None,
    blocker: str | None,
    blocker_other: str | None,
    comment: str | None,
) -> dict:
    """Record a feedback submission. Raises asyncpg.UniqueViolationError if
    this user already has one — callers should catch that and return a
    friendly "already submitted" response rather than a raw 500."""
    return await _fetchrow(
        """
        INSERT INTO job_feedback
            (job_id, user_id, source, source_other, visit_reason,
             visit_reason_other, blocker, blocker_other, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        """,
        job_id, user_id, source, source_other, visit_reason,
        visit_reason_other, blocker, blocker_other, comment,
    )


async def get_user_feedback(user_id: str) -> dict | None:
    """The single feedback row for this user, if they've submitted one —
    used by the download endpoint to check for an unused reward."""
    return await _fetchrow("SELECT * FROM job_feedback WHERE user_id = $1", user_id)


async def get_feedback_for_job(job_id: str) -> dict | None:
    """Feedback row for a job, if any — used by the admin panel."""
    return await _fetchrow("SELECT * FROM job_feedback WHERE job_id = $1", job_id)


async def consume_feedback_reward(feedback_id: str, clip_id: str) -> None:
    """Mark this user's one-time free-download reward as used, pinned to
    the specific clip they chose. Only fires once — see the download
    endpoint's NULL check before calling this."""
    await _execute(
        "UPDATE job_feedback SET reward_clip_id = $1 WHERE feedback_id = $2",
        clip_id, feedback_id,
    )


# ── Fake TikTok account mockups (migration 015) ────────────────
# Admin-only tool for staging generated clips (from either product) into
# mock TikTok profiles rendered in the admin panel. See admin_tiktok.py.

async def create_tiktok_account(
    handle: str, display_name: str, bio: str, avatar_url: str, verified: bool = False,
) -> dict:
    return await _fetchrow(
        """
        INSERT INTO fake_tiktok_accounts (handle, display_name, bio, avatar_url, verified)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        handle, display_name, bio, avatar_url, verified,
    )


async def list_tiktok_accounts() -> list[dict]:
    return await _fetch(
        """
        SELECT a.*, COUNT(c.id) AS clip_count
        FROM fake_tiktok_accounts a
        LEFT JOIN fake_tiktok_account_clips c ON c.account_id = a.id
        GROUP BY a.id
        ORDER BY a.created_at DESC
        """
    )


async def get_tiktok_account(account_id: str) -> dict | None:
    return await _fetchrow("SELECT * FROM fake_tiktok_accounts WHERE id = $1", account_id)


async def update_tiktok_account(
    account_id: str, handle: str, display_name: str, bio: str, avatar_url: str,
    followers: str, following: str, likes: str, verified: bool,
) -> dict | None:
    return await _fetchrow(
        """
        UPDATE fake_tiktok_accounts
        SET handle=$2, display_name=$3, bio=$4, avatar_url=$5,
            followers=$6, following=$7, likes=$8, verified=$9, updated_at=now()
        WHERE id=$1
        RETURNING *
        """,
        account_id, handle, display_name, bio, avatar_url,
        followers, following, likes, verified,
    )


async def delete_tiktok_account(account_id: str) -> None:
    """Cascades to fake_tiktok_account_clips via FK — see migration 015."""
    await _execute("DELETE FROM fake_tiktok_accounts WHERE id = $1", account_id)


async def add_tiktok_account_clip(
    account_id: str, source: str, job_id: str, clip_id: str | None, title: str,
    video_url: str, thumbnail_url: str, caption: str, likes: str, comments: str,
) -> dict:
    return await _fetchrow(
        """
        INSERT INTO fake_tiktok_account_clips
            (account_id, source, job_id, clip_id, title, video_url, thumbnail_url, caption, likes, comments)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        """,
        account_id, source, job_id, clip_id, title, video_url, thumbnail_url, caption, likes, comments,
    )


async def list_tiktok_account_clips(account_id: str) -> list[dict]:
    return await _fetch(
        "SELECT * FROM fake_tiktok_account_clips WHERE account_id = $1 ORDER BY added_at DESC",
        account_id,
    )


async def delete_tiktok_account_clip(clip_row_id: str) -> None:
    await _execute("DELETE FROM fake_tiktok_account_clips WHERE id = $1", clip_row_id)


# ── User operations ───────────────────────────────────────────

async def get_user(user_id: str) -> dict | None:
    return await _fetchrow("SELECT * FROM users WHERE id=$1", user_id)


async def get_user_by_email(email: str) -> dict | None:
    return await _fetchrow("SELECT * FROM users WHERE email=$1", email)


async def upsert_user(user_data: dict) -> dict:
    """Insert or update user on Google login using atomic upsert."""
    from app.core.plan_limits import get_plan_limits  # local import avoids circular dependency at module init
    plan = user_data.get("plan", "free")
    limits = get_plan_limits(plan)

    row = await _fetchrow(
        """
        INSERT INTO users (id, email, full_name, avatar_url, google_sub,
                           plan, credits_used, credits_limit,
                           video_minutes_used, video_minutes_limit,
                           created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (email) DO UPDATE SET
            full_name  = EXCLUDED.full_name,
            avatar_url = EXCLUDED.avatar_url,
            google_sub = EXCLUDED.google_sub,
            updated_at = NOW()
        RETURNING *
        """,
        user_data["id"],
        user_data["email"],
        user_data.get("full_name", ""),
        user_data.get("avatar_url", ""),
        user_data.get("google_sub", ""),
        plan,
        user_data.get("credits_used", 0),
        user_data.get("credits_limit", limits["credits_limit"]),
        user_data.get("video_minutes_used", 0),
        user_data.get("video_minutes_limit", limits["video_minutes_limit"]),
        user_data.get("created_at"),
    )
    return row or {}


async def count_active_jobs(user_id: str) -> int:
    """
    Count jobs in any active (non-terminal) state for this user. Used to
    gate MAX_CONCURRENT_JOBS_PER_USER in jobs.py. Terminal states are
    'completed', 'failed', 'cancelled' — anything else counts as active.
    """
    row = await _fetchrow(
        """SELECT COUNT(*) AS cnt FROM jobs
           WHERE user_id=$1
             AND status IN (
               'created', 'dispatched', 'processing',
               'api_processing', 'api_done', 'ffmpeg_processing'
             )""",
        user_id,
    )
    return int(row["cnt"]) if row else 0


async def count_active_brainrot_jobs(user_id: str) -> int:
    """Brainrot equivalent of count_active_jobs — gates
    MAX_CONCURRENT_BRAINROT_JOBS_PER_USER in app/api/brainrot.py. Terminal
    states are 'complete', 'failed'; anything else counts as active."""
    row = await _fetchrow(
        """SELECT COUNT(*) AS cnt FROM brainrot_jobs
           WHERE user_id=$1
             AND status NOT IN ('complete', 'failed')""",
        user_id,
    )
    return int(row["cnt"]) if row else 0


async def count_recent_brainrot_jobs(user_id: str, since: datetime) -> int:
    """Gates MAX_BRAINROT_JOBS_PER_HOUR in app/api/brainrot.py — every job
    created since `since`, regardless of outcome (a failed/refunded job still
    burned a GPT call + TTS + an ffmpeg pass, so it counts against the hourly
    ceiling same as a successful one)."""
    row = await _fetchrow(
        "SELECT COUNT(*) AS cnt FROM brainrot_jobs WHERE user_id=$1 AND created_at >= $2",
        user_id, since,
    )
    return int(row["cnt"]) if row else 0


async def _maybe_reset_monthly(user_id: str) -> None:
    """
    Resets BOTH credits_used AND video_minutes_used to 0 when the billing
    month rolls over (tracked by credits_reset_at). Shared by both
    reserve_credits() and reserve_video_minutes() so either one being
    called first triggers the reset correctly.
    """
    user = await get_user(user_id)
    if not user:
        return
    now = _now()
    reset_at = user.get("credits_reset_at")
    needs_reset = (
        reset_at is None
        or reset_at.year < now.year
        or (reset_at.year == now.year and reset_at.month < now.month)
    )
    if needs_reset:
        await _execute(
            """
            UPDATE users
            SET credits_used       = 0,
                video_minutes_used = 0,
                credits_reset_at   = date_trunc('month', NOW())
            WHERE id = $1
            """,
            user_id,
        )


async def reserve_credits(user_id: str, requested: int) -> int:
    """
    Atomically reserve up to `requested` credits (clips) against the user's
    remaining monthly allowance, RIGHT NOW — not "check then bill later".

    Why atomic: credits are billed per clip, and a plan's `credits_limit` is
    advertised as "N shorts/month". If two requests from the same user both
    read "remaining = 50" and proceed before either's usage lands, both
    could reserve up to 50 — actual usage doubles past the plan's limit.
    The `FOR UPDATE` row lock inside a transaction makes the read-then-write
    atomic per user: a second concurrent call blocks until the first
    transaction commits, then sees the updated (already-reserved) total.

    Returns the number of credits ACTUALLY reserved (may be less than
    `requested`, or 0 if none remain) — caller must clamp clip_count to this
    and, if fewer clips are delivered than reserved, call release_credits()
    for the unused portion (see orchestrator.py).
    """
    if requested <= 0:
        return 0
    await _maybe_reset_monthly(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT credits_used, credits_limit FROM users WHERE id=$1 FOR UPDATE",
                user_id,
            )
            if not row:
                return 0
            remaining = row["credits_limit"] - row["credits_used"]
            reserve = max(0, min(requested, remaining))
            if reserve > 0:
                await conn.execute(
                    "UPDATE users SET credits_used = credits_used + $2 WHERE id=$1",
                    user_id, reserve,
                )
            return reserve


async def release_credits(user_id: str, amount: int) -> None:
    """
    Refund `amount` previously-reserved credits — e.g. a job reserved 10
    (clip_count) but only delivered 7 (some clips failed), so 3 are
    refunded; or a job failed/timed out entirely, so its full reservation
    is refunded. GREATEST(0, ...) guards against ever going negative.
    """
    if amount <= 0:
        return
    await _execute(
        "UPDATE users SET credits_used = GREATEST(0, credits_used - $2) WHERE id=$1",
        user_id, amount,
    )


# ── Brainrot credits — fully separate pool from the functions above ─
# Same atomic reserve/release contract as reserve_credits()/release_credits()
# just above, just against brainrot_credits_used/brainrot_credits_limit/
# brainrot_credits_reset_at (migration 016) instead of the YT-Shorts columns.
# Nothing here is called from any YT-Shorts code path (jobs.py, api_stage.py,
# ffmpeg_stage.py, internal.py never reference these). Brainrot always
# reserves exactly 1 (one credit = one clip — see POST /brainrot/jobs), but
# this still takes `requested` for symmetry with the YT-Shorts version.

async def _maybe_reset_brainrot_monthly(user_id: str) -> None:
    user = await get_user(user_id)
    if not user:
        return
    now = _now()
    reset_at = user.get("brainrot_credits_reset_at")
    needs_reset = (
        reset_at is None
        or reset_at.year < now.year
        or (reset_at.year == now.year and reset_at.month < now.month)
    )
    if needs_reset:
        await _execute(
            """
            UPDATE users
            SET brainrot_credits_used     = 0,
                brainrot_credits_reset_at = date_trunc('month', NOW())
            WHERE id = $1
            """,
            user_id,
        )


async def reserve_brainrot_credits(user_id: str, requested: int) -> int:
    """Atomically reserve up to `requested` brainrot credits — see
    reserve_credits() above for why this needs to be atomic (FOR UPDATE)."""
    if requested <= 0:
        return 0
    await _maybe_reset_brainrot_monthly(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT brainrot_credits_used, brainrot_credits_limit FROM users WHERE id=$1 FOR UPDATE",
                user_id,
            )
            if not row:
                return 0
            remaining = row["brainrot_credits_limit"] - row["brainrot_credits_used"]
            reserve = max(0, min(requested, remaining))
            if reserve > 0:
                await conn.execute(
                    "UPDATE users SET brainrot_credits_used = brainrot_credits_used + $2 WHERE id=$1",
                    user_id, reserve,
                )
            return reserve


async def release_brainrot_credits(user_id: str, amount: int) -> None:
    """Refund `amount` previously-reserved brainrot credits."""
    if amount <= 0:
        return
    await _execute(
        "UPDATE users SET brainrot_credits_used = GREATEST(0, brainrot_credits_used - $2) WHERE id=$1",
        user_id, amount,
    )


async def reserve_video_minutes(
    user_id: str,
    duration_seconds: int,
    plan: str,
) -> tuple[bool, str, float]:
    """
    Atomically check AND reserve video-minutes quota in one step — replaces
    the old check-then-bill-later pattern (which had the same TOCTOU race as
    credits: two concurrent submissions could both read "remaining" before
    either's usage landed, and both pass).

    Gate 1 — per-video maximum: is this single video too long for the plan?
              Hard reject if so (this is a structural plan limit, not a
              balance — there's nothing to clamp to without the caller
              choosing a shorter video/window themselves).
    Gate 2 — monthly hours quota: CLAMPS rather than rejects. If less than
              `duration_minutes` remains this month, reserve whatever IS
              left (down to MIN_BILLABLE_MINUTES) instead of rejecting the
              whole job — mirrors reserve_credits()'s "give them what's
              left" behavior instead of an all-or-nothing wall. Only
              rejects outright if essentially nothing is left.

    Returns (ok, reason, reserved_minutes). `reserved_minutes` is the exact
    amount reserved (0.0 if not ok) — may be LESS than `duration_seconds`
    if Gate 2 clamped it; callers MUST shrink whatever window they're
    about to process (e.g. the minutes-gateway end) to match, so billing
    and actual processing stay in sync. IS the final bill on job success
    (don't increment again), and must be refunded via release_video_minutes
    if the job fails/times out before delivering anything.
    """
    duration_minutes = duration_seconds / 60

    # Gate 1: per-video cap (doesn't touch the DB, no reservation needed)
    max_mins = get_max_video_minutes(plan)
    if duration_minutes > max_mins:
        return False, (
            f"Video is {int(duration_minutes)} min — your {plan} plan allows "
            f"a maximum of {max_mins} min per video. "
            f"Try a shorter video or upgrade your plan."
        ), 0.0

    await _maybe_reset_monthly(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT video_minutes_used, video_minutes_limit FROM users WHERE id=$1 FOR UPDATE",
                user_id,
            )
            if not row:
                return False, "User not found", 0.0

            used  = float(row["video_minutes_used"] or 0)
            limit = float(row["video_minutes_limit"] or get_video_minutes_limit(plan))
            remaining = limit - used

            if remaining < MIN_BILLABLE_MINUTES:
                used_hrs  = round(used  / 60, 1)
                limit_hrs = round(limit / 60, 1)
                return False, (
                    f"Monthly video-hours quota reached ({used_hrs} / {limit_hrs} hrs used). "
                    f"Resets on the 1st — or upgrade for more hours."
                ), 0.0

            # Clamp to whatever's left instead of rejecting outright — same
            # "give them what's left" pattern as reserve_credits(). Caller
            # MUST shrink the actual window it processes to match this
            # returned amount if it's less than what was requested.
            billable_minutes = min(duration_minutes, remaining)
            await conn.execute(
                "UPDATE users SET video_minutes_used = video_minutes_used + $2 WHERE id=$1",
                user_id, billable_minutes,
            )
            return True, "ok", billable_minutes


async def release_video_minutes(user_id: str, minutes: float) -> None:
    """Refund previously-reserved video-minutes — e.g. a job failed/timed
    out before delivering any clips, so its reservation shouldn't count."""
    if minutes <= 0:
        return
    await _execute(
        "UPDATE users SET video_minutes_used = GREATEST(0, video_minutes_used - $2) WHERE id=$1",
        user_id, minutes,
    )
