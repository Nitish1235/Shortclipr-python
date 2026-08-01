"""
dispatcher.py — Claim-and-dispatch logic for the pg-boss watcher.

Two dispatch flows, chosen at runtime based on config.SPLIT_MODE:

SPLIT-WORKER MODE:
  1. API queue drain:
     - Count active jobs per API region
     - Pick least-loaded API region under API_REGION_SOFT_CAP
     - Claim next 'created' job with pipeline_stage='api' via FOR UPDATE SKIP LOCKED
     - POST to {api_worker_url}/internal/api-stage/run
     - On success: API worker later flips status='api_done' → Postgres trigger
       fires pg_notify('api_done', job_id) → main.py wakes → FFmpeg dispatch
     - On HTTP failure: release job back to 'created' with exponential backoff

  2. FFmpeg queue drain:
     - Count active jobs per FFmpeg region
     - Pick least-loaded FFmpeg region under FFMPEG_REGION_SOFT_CAP
     - Claim next 'api_done' job via FOR UPDATE SKIP LOCKED
     - POST to {ffmpeg_worker_url}/internal/ffmpeg-stage/run
     - On HTTP failure: release job back to 'api_done' with backoff

LEGACY MODE:
  Single queue targeting /internal/pipeline/run — runs both stages in one call.
"""

import logging

import asyncpg
import httpx

from watcher import config

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════

async def _dispatch_to_worker(worker_url: str, path: str, secret: str, payload: dict) -> None:
    """POST `payload` to `{worker_url}{path}` with the internal-secret header."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{worker_url}{path}",
            json=payload,
            headers={
                "X-Internal-Secret": secret,
                "Content-Type":      "application/json",
            },
        )
        resp.raise_for_status()


def _pick_region(load: dict[str, int], pool: list[dict], soft_cap: int) -> dict | None:
    """Pick least-loaded worker in `pool` whose active-job count is under `soft_cap`.
    Returns None if all pool members are at or above cap (job stays queued)."""
    if not pool:
        return None
    for worker in sorted(pool, key=lambda w: load.get(w["region"], 0)):
        if load.get(worker["region"], 0) < soft_cap:
            return worker
    return None


async def _refund_job(pool: asyncpg.Pool, job_id: str) -> None:
    """Refund reserved credits + video-minutes for a job that will never run."""
    row = await pool.fetchrow(
        "SELECT user_id, clip_count, reserved_video_minutes FROM jobs WHERE job_id = $1",
        job_id,
    )
    if not row:
        return
    user_id = str(row["user_id"])
    if row["clip_count"] and row["clip_count"] > 0:
        await pool.execute(
            "UPDATE users SET credits_used = GREATEST(0, credits_used - $2) WHERE id = $1",
            user_id, row["clip_count"],
        )
        logger.info(f"[{job_id}] Refunded {row['clip_count']} credits to {user_id}")
    if row["reserved_video_minutes"] and float(row["reserved_video_minutes"]) > 0:
        await pool.execute(
            "UPDATE users SET video_minutes_used = GREATEST(0, video_minutes_used - $2) WHERE id = $1",
            user_id, float(row["reserved_video_minutes"]),
        )
        logger.info(f"[{job_id}] Refunded {row['reserved_video_minutes']} video-minutes to {user_id}")


# ═══════════════════════════════════════════════════════════════
# SPLIT-WORKER MODE — API stage
# ═══════════════════════════════════════════════════════════════

async def get_api_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    """Count active API jobs per region (dispatched OR running the API stage)."""
    rows = await pool.fetch("""
        SELECT target_api_region, count(*) AS active
        FROM jobs
        WHERE status = 'api_processing'
          AND target_api_region IS NOT NULL
        GROUP BY target_api_region
    """)
    return {r["target_api_region"]: r["active"] for r in rows}


async def claim_api_job(pool: asyncpg.Pool, region: str) -> dict | None:
    """Atomically claim next 'created' job with pipeline_stage='api'."""
    row = await pool.fetchrow("""
        UPDATE jobs
        SET status              = 'api_processing',
            target_api_region   = $1,
            api_dispatched_at   = NOW(),
            updated_at          = NOW()
        WHERE job_id = (
            SELECT job_id FROM jobs
            WHERE status = 'created'
              AND pipeline_stage = 'api'
              AND start_after <= NOW()
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        ) RETURNING job_id, user_id, youtube_url, queue_payload
    """, region)
    return dict(row) if row else None


async def release_api_for_retry(pool: asyncpg.Pool, job_id: str) -> None:
    """Bounce a failed API dispatch back to 'created' with exponential backoff,
    or mark it failed + refund if MAX_RETRIES exceeded."""
    await pool.execute("""
        UPDATE jobs
        SET status = CASE
                WHEN retry_count >= $2 THEN 'failed'
                ELSE 'created'
            END,
            error_message = CASE
                WHEN retry_count >= $2 THEN 'API dispatch failed after max retries'
                ELSE ''
            END,
            retry_count       = retry_count + 1,
            start_after       = NOW() + make_interval(secs => power(2, LEAST(retry_count, 5)) * 3),
            target_api_region = NULL,
            api_dispatched_at = NULL,
            updated_at        = NOW()
        WHERE job_id = $1
    """, job_id, config.MAX_RETRIES)

    row = await pool.fetchrow(
        "SELECT status, retry_count FROM jobs WHERE job_id = $1", job_id,
    )
    if row and row["status"] == "failed":
        logger.error(f"[{job_id}] Max API retries exceeded — marked as failed")
        await _refund_job(pool, job_id)
    elif row:
        logger.warning(
            f"[{job_id}] API dispatch failed — retry {row['retry_count']}, "
            f"backoff {2 ** min(row['retry_count'] - 1, 5) * 3}s"
        )


async def process_one_api_job(pool: asyncpg.Pool) -> bool:
    """Try to claim and dispatch one API job. Returns True if one was handled."""
    load   = await get_api_region_load(pool)
    worker = _pick_region(load, config.API_WORKERS, config.API_REGION_SOFT_CAP)
    if not worker:
        return False

    job = await claim_api_job(pool, worker["region"])
    if not job:
        return False

    job_id  = str(job["job_id"])
    payload = job["queue_payload"]
    if not payload:
        logger.error(f"[{job_id}] No queue_payload — cannot dispatch API stage")
        await pool.execute(
            "UPDATE jobs SET status='failed', error_message='Missing queue payload' WHERE job_id=$1",
            job_id,
        )
        await _refund_job(pool, job_id)
        return True

    try:
        await _dispatch_to_worker(
            worker["url"], "/internal/api-stage/run",
            config.INTERNAL_SECRET, payload,
        )
        logger.info(f"[{job_id}] Dispatched API stage → {worker['region']}")
    except Exception as exc:
        logger.warning(f"[{job_id}] API dispatch to {worker['region']} failed: {exc}")
        await release_api_for_retry(pool, job_id)
    return True


# ═══════════════════════════════════════════════════════════════
# SPLIT-WORKER MODE — FFmpeg stage
# ═══════════════════════════════════════════════════════════════

async def get_ffmpeg_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    """Count active FFmpeg jobs per region."""
    rows = await pool.fetch("""
        SELECT target_ffmpeg_region, count(*) AS active
        FROM jobs
        WHERE status = 'ffmpeg_processing'
          AND target_ffmpeg_region IS NOT NULL
        GROUP BY target_ffmpeg_region
    """)
    return {r["target_ffmpeg_region"]: r["active"] for r in rows}


async def claim_ffmpeg_job(pool: asyncpg.Pool, region: str) -> dict | None:
    """Atomically claim next 'api_done' job for FFmpeg processing."""
    row = await pool.fetchrow("""
        UPDATE jobs
        SET status               = 'ffmpeg_processing',
            target_ffmpeg_region = $1,
            ffmpeg_dispatched_at = NOW(),
            updated_at           = NOW()
        WHERE job_id = (
            SELECT job_id FROM jobs
            WHERE status = 'api_done'
              AND start_after <= NOW()
            ORDER BY api_completed_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        ) RETURNING job_id
    """, region)
    return dict(row) if row else None


async def release_ffmpeg_for_retry(pool: asyncpg.Pool, job_id: str) -> None:
    """Bounce a failed FFmpeg dispatch back to 'api_done' with exponential backoff,
    or fail + refund if MAX_RETRIES exceeded."""
    await pool.execute("""
        UPDATE jobs
        SET status = CASE
                WHEN retry_count >= $2 THEN 'failed'
                ELSE 'api_done'
            END,
            error_message = CASE
                WHEN retry_count >= $2 THEN 'FFmpeg dispatch failed after max retries'
                ELSE ''
            END,
            retry_count          = retry_count + 1,
            start_after          = NOW() + make_interval(secs => power(2, LEAST(retry_count, 5)) * 3),
            target_ffmpeg_region = NULL,
            ffmpeg_dispatched_at = NULL,
            updated_at           = NOW()
        WHERE job_id = $1
    """, job_id, config.MAX_RETRIES)

    row = await pool.fetchrow(
        "SELECT status, retry_count FROM jobs WHERE job_id = $1", job_id,
    )
    if row and row["status"] == "failed":
        logger.error(f"[{job_id}] Max FFmpeg retries exceeded — marked as failed")
        await _refund_job(pool, job_id)
    elif row:
        logger.warning(
            f"[{job_id}] FFmpeg dispatch failed — retry {row['retry_count']}, "
            f"backoff {2 ** min(row['retry_count'] - 1, 5) * 3}s"
        )


async def process_one_ffmpeg_job(pool: asyncpg.Pool) -> bool:
    """Try to claim and dispatch one FFmpeg job. Returns True if one was handled."""
    load   = await get_ffmpeg_region_load(pool)
    worker = _pick_region(load, config.FFMPEG_WORKERS, config.FFMPEG_REGION_SOFT_CAP)
    if not worker:
        return False

    job = await claim_ffmpeg_job(pool, worker["region"])
    if not job:
        return False

    job_id = str(job["job_id"])
    try:
        await _dispatch_to_worker(
            worker["url"], "/internal/ffmpeg-stage/run",
            config.INTERNAL_SECRET, {"job_id": job_id},
        )
        logger.info(f"[{job_id}] Dispatched FFmpeg stage → {worker['region']}")
    except Exception as exc:
        logger.warning(f"[{job_id}] FFmpeg dispatch to {worker['region']} failed: {exc}")
        await release_ffmpeg_for_retry(pool, job_id)
    return True


# ═══════════════════════════════════════════════════════════════
# LEGACY MODE — single unified pool
# ═══════════════════════════════════════════════════════════════

async def get_legacy_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    rows = await pool.fetch("""
        SELECT target_region, count(*) AS active
        FROM jobs
        WHERE status IN ('dispatched', 'processing')
          AND target_region IS NOT NULL
        GROUP BY target_region
    """)
    return {r["target_region"]: r["active"] for r in rows}


async def claim_legacy_job(pool: asyncpg.Pool, region: str) -> dict | None:
    row = await pool.fetchrow("""
        UPDATE jobs
        SET status = 'dispatched',
            target_region = $1,
            dispatched_at = NOW(),
            updated_at = NOW()
        WHERE job_id = (
            SELECT job_id FROM jobs
            WHERE status = 'created'
              AND start_after <= NOW()
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        ) RETURNING job_id, user_id, youtube_url, queue_payload
    """, region)
    return dict(row) if row else None


async def release_legacy_for_retry(pool: asyncpg.Pool, job_id: str) -> None:
    await pool.execute("""
        UPDATE jobs
        SET status = CASE
                WHEN retry_count >= $2 THEN 'failed'
                ELSE 'created'
            END,
            error_message = CASE
                WHEN retry_count >= $2 THEN 'Dispatch failed after max retries'
                ELSE ''
            END,
            retry_count = retry_count + 1,
            start_after = NOW() + make_interval(secs => power(2, LEAST(retry_count, 5)) * 3),
            target_region = NULL,
            dispatched_at = NULL,
            updated_at = NOW()
        WHERE job_id = $1
    """, job_id, config.MAX_RETRIES)

    row = await pool.fetchrow(
        "SELECT status, retry_count FROM jobs WHERE job_id = $1", job_id,
    )
    if row and row["status"] == "failed":
        logger.error(f"[{job_id}] Max retries exceeded — marked as failed")
        await _refund_job(pool, job_id)


async def process_one_legacy_job(pool: asyncpg.Pool) -> bool:
    load   = await get_legacy_region_load(pool)
    worker = _pick_region(load, config.LEGACY_WORKERS, config.LEGACY_REGION_SOFT_CAP)
    if not worker:
        return False
    job = await claim_legacy_job(pool, worker["region"])
    if not job:
        return False

    job_id  = str(job["job_id"])
    payload = job["queue_payload"]
    if not payload:
        logger.error(f"[{job_id}] No queue_payload — cannot dispatch")
        await pool.execute(
            "UPDATE jobs SET status='failed', error_message='Missing queue payload' WHERE job_id=$1",
            job_id,
        )
        await _refund_job(pool, job_id)
        return True

    try:
        await _dispatch_to_worker(
            worker["url"], "/internal/pipeline/run",
            config.INTERNAL_SECRET, payload,
        )
        logger.info(f"[{job_id}] Dispatched (legacy) → {worker['region']}")
    except Exception as exc:
        logger.warning(f"[{job_id}] Legacy dispatch to {worker['region']} failed: {exc}")
        await release_legacy_for_retry(pool, job_id)
    return True


# ═══════════════════════════════════════════════════════════════
# Public drain functions — called by main.py
# ═══════════════════════════════════════════════════════════════

async def process_all_unclaimed(pool: asyncpg.Pool) -> int:
    """
    Drain both queues (or the legacy queue). Returns total dispatched count.
    Called by the poll fallback in main.py.
    """
    dispatched = 0
    if config.SPLIT_MODE:
        # Drain API queue first — FFmpeg queue is fed by API completions,
        # so hitting API first minimises time-to-completion when both are hot.
        while await process_one_api_job(pool):
            dispatched += 1
        while await process_one_ffmpeg_job(pool):
            dispatched += 1
    else:
        while await process_one_legacy_job(pool):
            dispatched += 1
    return dispatched


async def process_one_notification(pool: asyncpg.Pool, channel: str) -> bool:
    """
    Handle a single LISTEN notification. Channel tells us which queue to
    dispatch from:
      - 'new_job'   → API queue (or legacy queue)
      - 'api_done'  → FFmpeg queue
    """
    if channel == "new_job":
        if config.SPLIT_MODE:
            return await process_one_api_job(pool)
        return await process_one_legacy_job(pool)
    if channel == "api_done":
        return await process_one_ffmpeg_job(pool)
    logger.warning(f"Unknown LISTEN channel: {channel}")
    return False


# ═══════════════════════════════════════════════════════════════
# Reconciliation — catch stuck jobs
# ═══════════════════════════════════════════════════════════════

async def reconcile_stuck(pool: asyncpg.Pool) -> int:
    """
    Sweep for jobs stuck past the timeout in any pre-terminal state:
      - 'created'          — API queue never claimed (watcher down / missed notify)
      - 'api_processing'   — API worker crashed / never returned
      - 'api_done'         — FFmpeg queue never claimed
      - 'ffmpeg_processing' — FFmpeg worker crashed (3× timeout since it's slow)
      - 'dispatched'       — legacy unified dispatch stalled

    For each: if retry budget remains → release for retry with backoff;
              else → fail + refund.
    """
    minutes = config.RECONCILE_MINUTES
    stuck = await pool.fetch("""
        SELECT job_id, status, retry_count
        FROM jobs
        WHERE (status = 'created'          AND start_after         < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'dispatched'       AND dispatched_at       < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_processing'   AND api_dispatched_at   < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_done'         AND api_completed_at    < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'ffmpeg_processing' AND ffmpeg_dispatched_at < NOW() - ($1::int * 3 || ' minutes')::interval)
    """, str(minutes))

    reconciled = 0
    for job in stuck:
        job_id = str(job["job_id"])
        status = job["status"]
        retries = job["retry_count"] or 0

        if retries >= config.MAX_RETRIES:
            logger.error(f"[{job_id}] Stuck in '{status}' with max retries — failing + refunding")
            await pool.execute(
                "UPDATE jobs SET status='failed', error_message='Job stuck beyond timeout — refunded' WHERE job_id=$1",
                job_id,
            )
            await _refund_job(pool, job_id)
        else:
            logger.warning(f"[{job_id}] Stuck in '{status}' — retrying")
            # Route to the correct retry path based on which stage got stuck.
            if status in ("api_processing", "created", "dispatched"):
                if config.SPLIT_MODE and status != "dispatched":
                    await release_api_for_retry(pool, job_id)
                else:
                    await release_legacy_for_retry(pool, job_id)
            elif status in ("ffmpeg_processing", "api_done"):
                await release_ffmpeg_for_retry(pool, job_id)
        reconciled += 1

    if reconciled:
        logger.info(f"Reconciled {reconciled} stuck job(s)")
    return reconciled
