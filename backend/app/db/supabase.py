"""
Async Supabase client wrapper.
Provides:
  - Job CRUD operations
  - Clip insert + retrieve
  - Real-time progress broadcast (via Supabase REST update — frontend
    subscribes to table changes via Supabase Realtime channel)
  - User plan enforcement queries
"""

import logging
from datetime import datetime, timezone
from typing import Any
from supabase import AClient, acreate_client

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Singleton client ──────────────────────────────────────────
_client: AClient | None = None


async def get_client() -> AClient:
    global _client
    if _client is None:
        _client = await acreate_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,  # service key for worker operations
        )
    return _client


# ── Job operations ────────────────────────────────────────────

async def update_job_progress(
    job_id: str,
    progress: int,
    current_step: str,
    status: str = "processing",
    extra: dict | None = None,
) -> None:
    """
    Update job row — triggers Supabase Realtime event to frontend.
    Called after every pipeline step so the UI stays live.
    """
    client = await get_client()
    payload: dict[str, Any] = {
        "status": status,
        "progress": progress,
        "current_step": current_step,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        payload.update(extra)
    await client.table("jobs").update(payload).eq("job_id", job_id).execute()
    logger.info(f"Job {job_id} → {progress}% [{current_step}]")


async def fail_job(job_id: str, error_message: str) -> None:
    client = await get_client()
    await client.table("jobs").update({
        "status": "failed",
        "progress": 0,
        "error_message": error_message[:1000],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("job_id", job_id).execute()


async def complete_job(job_id: str, clip_count: int) -> None:
    client = await get_client()
    await client.table("jobs").update({
        "status": "completed",
        "progress": 100,
        "current_step": "Done",
        "clip_count": clip_count,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("job_id", job_id).execute()


async def get_job(job_id: str) -> dict | None:
    client = await get_client()
    result = await client.table("jobs").select("*").eq("job_id", job_id).single().execute()
    return result.data


async def update_job_metadata(job_id: str, video_title: str, video_duration: int) -> None:
    client = await get_client()
    await client.table("jobs").update({
        "video_title": video_title,
        "video_duration": video_duration,
    }).eq("job_id", job_id).execute()


# ── Clip operations ───────────────────────────────────────────

async def insert_clip(clip_data: dict) -> dict:
    """
    Insert a single clip record immediately after upload.
    This triggers a Supabase Realtime INSERT event →
    frontend renders the clip card as it arrives.
    """
    client = await get_client()
    result = await client.table("clips").insert(clip_data).execute()
    return result.data[0]


async def get_clips_for_job(job_id: str) -> list[dict]:
    client = await get_client()
    result = (
        await client.table("clips")
        .select("*")
        .eq("job_id", job_id)
        .order("viral_score", desc=True)
        .execute()
    )
    return result.data


# ── User operations ───────────────────────────────────────────

async def get_user(user_id: str) -> dict | None:
    client = await get_client()
    result = await client.table("users").select("*").eq("id", user_id).single().execute()
    return result.data


async def increment_credits_used(user_id: str) -> None:
    """Called after each job completes — enforces plan limits."""
    client = await get_client()
    await client.rpc("increment_credits_used", {"uid": user_id}).execute()


async def check_user_can_process(user_id: str) -> tuple[bool, str]:
    """
    Returns (allowed, reason).
    Enforced server-side — never rely on frontend checks alone.
    """
    user = await get_user(user_id)
    if not user:
        return False, "User not found"
    if user["credits_used"] >= user["credits_limit"]:
        plan = user["plan"]
        return False, f"Monthly limit reached for {plan} plan. Upgrade to continue."
    return True, "ok"
