"""
db.py — Direct PostgreSQL database layer using asyncpg.

Uses only SUPABASE_DB_URL (postgresql:// connection string).
No Supabase client SDK required — Supabase Realtime still fires
because it listens to WAL (database writes), not the client library.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Connection pool singleton ─────────────────────────────────
_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=settings.SUPABASE_DB_URL,
            min_size=1,
            max_size=10,
            command_timeout=30,
            statement_cache_size=0,
        )
    return _pool


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
    placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
    col_names = ", ".join(cols)
    values = [clip_data[c] for c in cols]

    row = await _fetchrow(
        f"INSERT INTO clips ({col_names}) VALUES ({placeholders}) RETURNING *",
        *values,
    )
    return row or {}


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
    row = await _fetchrow(
        """
        INSERT INTO users (id, email, full_name, avatar_url, google_sub,
                           plan, credits_used, credits_limit, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        user_data.get("plan", "free"),
        user_data.get("credits_used", 0),
        user_data.get("credits_limit", 3),
        user_data.get("created_at"),
    )
    return row or {}


async def increment_credits_used(user_id: str) -> None:
    await _execute(
        "UPDATE users SET credits_used = credits_used + 1 WHERE id=$1",
        user_id,
    )


async def check_user_can_process(user_id: str) -> tuple[bool, str]:
    user = await get_user(user_id)
    if not user:
        return False, "User not found"
    if user["credits_used"] >= user["credits_limit"]:
        return False, f"Monthly limit reached for {user['plan']} plan. Upgrade to continue."
    return True, "ok"
