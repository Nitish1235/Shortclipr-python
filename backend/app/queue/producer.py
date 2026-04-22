"""
producer.py — Push jobs into the Upstash Redis queue.
Called by the FastAPI /jobs endpoint after validating the request.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.redis import redis

logger = logging.getLogger(__name__)
settings = get_settings()


async def enqueue_job(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> str:
    """
    Serialise and push a job to the pending queue.
    Returns the job_id.
    """
    payload = json.dumps({
        "job_id": job_id,
        "user_id": user_id,
        "youtube_url": youtube_url,
        "options": options,
        "attempt": 1,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    })

    await redis.lpush(settings.REDIS_JOB_QUEUE, payload)
    logger.info(f"Enqueued job {job_id} (attempt 1)")
    return job_id


async def enqueue_retry(payload: dict, attempt: int, delay_seconds: int) -> None:
    """
    Re-enqueue a failed job with incremented attempt count.
    Uses a simple delayed re-push (Cloud Run can use scheduled checks
    or a separate delay queue if needed; here we use a sleep in consumer).
    """
    payload["attempt"] = attempt
    payload["retry_at"] = datetime.now(timezone.utc).isoformat()
    raw = json.dumps(payload)
    await redis.lpush(settings.REDIS_JOB_QUEUE, raw)
    logger.warning(f"Re-enqueued job {payload['job_id']} (attempt {attempt})")


async def send_to_dead_letter(payload: dict, all_errors: list[str]) -> None:
    """Push a permanently failed job to the dead-letter queue."""
    payload["failed_at"] = datetime.now(timezone.utc).isoformat()
    payload["errors"] = all_errors
    raw = json.dumps(payload)
    await redis.lpush(settings.REDIS_DEAD_QUEUE, raw)
    logger.error(
        f"Job {payload['job_id']} sent to DLQ after "
        f"{len(all_errors)} failures: {all_errors[-1]}"
    )
