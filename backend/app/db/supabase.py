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


async def find_stuck_queued_jobs(older_than_minutes: int) -> list[dict]:
    """
    Jobs that have sat at status='queued' longer than `older_than_minutes`
    — either Cloud Tasks exhausted every retry without a worker ever
    picking the task up, or the worker fleet was unreachable/down.
    Used by the reconciliation sweep (app/api/internal.py) to fail these
    jobs and refund their credits/video-minutes reservations, since
    orchestrator.py's own refund-on-failure logic never runs for a job
    whose pipeline never started.
    """
    return await _fetch(
        """
        SELECT job_id, user_id, clip_count, reserved_video_minutes
        FROM jobs
        WHERE status = 'queued'
          AND created_at < NOW() - ($1 || ' minutes')::interval
        """,
        str(older_than_minutes),
    )


async def update_job_metadata(job_id: str, video_title: str, video_duration: int) -> None:
    await _execute(
        "UPDATE jobs SET video_title=$1, video_duration=$2 WHERE job_id=$3",
        video_title, video_duration, job_id,
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
            values.append(json.dumps(v))
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
        json.dumps(captions_data) if captions_data is not None else None,
    )


async def get_clips_for_job(job_id: str) -> list[dict]:
    return await _fetch(
        "SELECT * FROM clips WHERE job_id=$1 ORDER BY viral_score DESC",
        job_id,
    )


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
    """Count jobs currently in processing state for this user."""
    row = await _fetchrow(
        "SELECT COUNT(*) AS cnt FROM jobs WHERE user_id=$1 AND status='processing'",
        user_id,
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
