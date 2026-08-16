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
# BRAINROT QUEUE — dialogue-driven character videos
#
# Mirrors the main pipeline's split-worker pattern exactly:
#
#   Stage 1 — API worker (shortclipr-api-worker):
#     'created' → claim → POST /internal/brainrot-api-stage/run
#     Worker: GPT script generation + TTS synthesis + GCS audio upload
#     On completion: worker updates status to 'api_done'
#
#   Stage 2 — Brainrot FFmpeg worker (shortclipr-brainrot-worker):
#     'api_done' → claim → POST /internal/brainrot-ffmpeg-stage/run
#     Worker: Download assets + composite render + upload final clip
#     On completion: worker updates status to 'complete'
#
# Uses a dedicated BRAINROT_WORKERS pool (separate from FFMPEG_WORKERS)
# so brainrot rendering never competes with YouTube Shorts encoding.
# Region-aware load balancing via _pick_region() with BRAINROT_REGION_SOFT_CAP.
# ═══════════════════════════════════════════════════════════════

async def get_brainrot_api_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    """Count active brainrot jobs in the API stage per region."""
    rows = await pool.fetch("""
        SELECT target_api_region, count(*) AS active
        FROM brainrot_jobs
        WHERE status IN ('generating_script', 'synthesizing_voice')
          AND target_api_region IS NOT NULL
        GROUP BY target_api_region
    """)
    return {r["target_api_region"]: r["active"] for r in rows}


async def get_brainrot_ffmpeg_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    """Count active brainrot jobs in FFmpeg rendering per region."""
    rows = await pool.fetch("""
        SELECT target_brainrot_region, count(*) AS active
        FROM brainrot_jobs
        WHERE status = 'rendering'
          AND target_brainrot_region IS NOT NULL
        GROUP BY target_brainrot_region
    """)
    return {r["target_brainrot_region"]: r["active"] for r in rows}


async def claim_brainrot_api_job(pool: asyncpg.Pool, region: str) -> dict | None:
    """Atomically claim the next 'created' brainrot job for the API stage."""
    row = await pool.fetchrow("""
        UPDATE brainrot_jobs
        SET status             = 'generating_script',
            target_api_region  = $1,
            updated_at         = NOW()
        WHERE job_id = (
            SELECT job_id FROM brainrot_jobs
            WHERE status = 'created'
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        ) RETURNING job_id
    """, region)
    return dict(row) if row else None


async def claim_brainrot_ffmpeg_job(pool: asyncpg.Pool, region: str) -> dict | None:
    """Atomically claim the next 'api_done' brainrot job for FFmpeg rendering."""
    row = await pool.fetchrow("""
        UPDATE brainrot_jobs
        SET status                  = 'rendering',
            target_brainrot_region  = $1,
            updated_at              = NOW()
        WHERE job_id = (
            SELECT job_id FROM brainrot_jobs
            WHERE status = 'api_done'
            ORDER BY updated_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        ) RETURNING job_id
    """, region)
    return dict(row) if row else None


async def release_brainrot_api_for_retry(pool: asyncpg.Pool, job_id: str) -> None:
    """Bounce a failed brainrot API dispatch back to 'created' for retry."""
    await pool.execute(
        "UPDATE brainrot_jobs SET status = 'created', target_api_region = NULL, updated_at = NOW() WHERE job_id = $1",
        job_id,
    )


async def release_brainrot_ffmpeg_for_retry(pool: asyncpg.Pool, job_id: str) -> None:
    """Bounce a failed brainrot FFmpeg dispatch back to 'api_done' for retry."""
    await pool.execute(
        "UPDATE brainrot_jobs SET status = 'api_done', target_brainrot_region = NULL, updated_at = NOW() WHERE job_id = $1",
        job_id,
    )


async def process_one_brainrot_api_job(pool: asyncpg.Pool) -> bool:
    """Claim a 'created' brainrot job and dispatch it to the API worker (GPT + TTS)."""
    load   = await get_brainrot_api_region_load(pool)
    worker = _pick_region(load, config.API_WORKERS, config.API_REGION_SOFT_CAP)
    if not worker:
        return False

    job = await claim_brainrot_api_job(pool, worker["region"])
    if not job:
        return False

    job_id = str(job["job_id"])
    try:
        await _dispatch_to_worker(
            worker["url"], "/internal/brainrot-api-stage/run",
            config.INTERNAL_SECRET, {"job_id": job_id},
        )
        logger.info(f"[{job_id}] Dispatched brainrot API stage → {worker['region']}")
    except Exception as exc:
        logger.warning(f"[{job_id}] Brainrot API dispatch to {worker['region']} failed: {exc}")
        await release_brainrot_api_for_retry(pool, job_id)
    return True


async def process_one_brainrot_ffmpeg_job(pool: asyncpg.Pool) -> bool:
    """Claim an 'api_done' brainrot job and dispatch it to the brainrot FFmpeg worker (render)."""
    load   = await get_brainrot_ffmpeg_region_load(pool)
    worker = _pick_region(load, config.BRAINROT_WORKERS, config.BRAINROT_REGION_SOFT_CAP)
    if not worker:
        return False

    job = await claim_brainrot_ffmpeg_job(pool, worker["region"])
    if not job:
        return False

    job_id = str(job["job_id"])
    try:
        await _dispatch_to_worker(
            worker["url"], "/internal/brainrot-ffmpeg-stage/run",
            config.INTERNAL_SECRET, {"job_id": job_id},
        )
        logger.info(f"[{job_id}] Dispatched brainrot FFmpeg stage → {worker['region']}")
    except Exception as exc:
        logger.warning(f"[{job_id}] Brainrot FFmpeg dispatch to {worker['region']} failed: {exc}")
        await release_brainrot_ffmpeg_for_retry(pool, job_id)
    return True


# ═══════════════════════════════════════════════════════════════
# BRAINROT GAMEPLAY QUEUE
# ═══════════════════════════════════════════════════════════════

async def get_gameplay_region_load(pool: asyncpg.Pool) -> dict[str, int]:
    """Count active gameplay sources in processing state per region."""
    rows = await pool.fetch("""
        SELECT target_ffmpeg_region, count(*) AS active
        FROM brainrot_gameplay_sources
        WHERE status = 'processing'
          AND target_ffmpeg_region IS NOT NULL
        GROUP BY target_ffmpeg_region
    """)
    return {r["target_ffmpeg_region"]: r["active"] for r in rows}


async def claim_gameplay_job(pool: asyncpg.Pool, region: str) -> dict | None:
    """Atomically claim the next 'created' gameplay source."""
    row = await pool.fetchrow("""
        UPDATE brainrot_gameplay_sources
        SET status               = 'processing',
            target_ffmpeg_region = $1,
            dispatched_at        = NOW()
        WHERE id = (
            SELECT id
            FROM brainrot_gameplay_sources
            WHERE status = 'created'
              AND start_after <= NOW()
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING id, video_id, gcs_path, category_cached
    """, region)

    return dict(row) if row else None


async def release_gameplay_for_retry(pool: asyncpg.Pool, source_id: str) -> None:
    """Bounce a failed gameplay dispatch back to 'created' with exponential backoff,
    or mark it failed if MAX_RETRIES exceeded."""
    await pool.execute("""
        UPDATE brainrot_gameplay_sources
        SET status = CASE
                WHEN retry_count >= $2 THEN 'failed'
                ELSE 'created'
            END,
            error_message = CASE
                WHEN retry_count >= $2 THEN 'Gameplay dispatch failed after max retries'
                ELSE NULL
            END,
            retry_count = retry_count + 1,
            start_after = NOW() + make_interval(secs => power(2, LEAST(retry_count, 5)) * 3),
            target_ffmpeg_region = NULL,
            dispatched_at = NULL
        WHERE id = $1
    """, source_id, config.MAX_RETRIES)


async def process_one_gameplay_job(pool: asyncpg.Pool) -> bool:
    """Claim a gameplay source and dispatch it to the FFmpeg worker."""
    load = await get_gameplay_region_load(pool)

    workers = (
        config.FFMPEG_WORKERS
        if config.SPLIT_MODE
        else config.LEGACY_WORKERS
    )

    soft_cap = (
        config.FFMPEG_REGION_SOFT_CAP
        if config.SPLIT_MODE
        else config.LEGACY_REGION_SOFT_CAP
    )

    worker = _pick_region(load, workers, soft_cap)

    if not worker:
        return False

    job = await claim_gameplay_job(pool, worker["region"])

    if not job:
        return False

    source_id = str(job["id"])
    video_id = job["video_id"]
    gcs_path = job["gcs_path"]
    category = job["category_cached"]

    # A gameplay source must have exactly one source type.
    if not video_id and not gcs_path:
        logger.error(
            f"[gameplay:{source_id}] No video_id or gcs_path — cannot dispatch"
        )

        await pool.execute("""
            UPDATE brainrot_gameplay_sources
            SET status = 'failed',
                error_message = 'Gameplay source has neither video_id nor gcs_path'
            WHERE id = $1
        """, source_id)

        return True

    if video_id and gcs_path:
        logger.error(
            f"[gameplay:{source_id}] Both video_id and gcs_path are set"
        )

        await pool.execute("""
            UPDATE brainrot_gameplay_sources
            SET status = 'failed',
                error_message = 'Gameplay source has both video_id and gcs_path'
            WHERE id = $1
        """, source_id)

        return True

    payload = {
        "source_id": source_id,
        "category": category,
    }

    if video_id:
        payload["video_id"] = str(video_id)
    else:
        payload["gcs_path"] = str(gcs_path)

    try:
        await _dispatch_to_worker(
            worker["url"],
            "/internal/gameplay-process/run",
            config.INTERNAL_SECRET,
            payload,
        )

        logger.info(
            f"[gameplay:{source_id}] Dispatched gameplay "
            f"({'youtube' if video_id else 'gcs'}) → {worker['region']}"
        )

    except Exception as exc:
        logger.warning(
            f"[gameplay:{source_id}] Gameplay dispatch to "
            f"{worker['region']} failed: {exc}"
        )
        await release_gameplay_for_retry(pool, source_id)

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
    Drain all queues. Returns total dispatched count.
    Called by the poll fallback in main.py.

    Drain order:
      1. Main API queue  — feeds the main FFmpeg queue
      2. Main FFmpeg queue
      3. Brainrot API queue  — GPT + TTS, feeds brainrot FFmpeg queue
      4. Brainrot FFmpeg queue  — compositing on dedicated brainrot worker pool
    """
    dispatched = 0
    if config.SPLIT_MODE:
        while await process_one_api_job(pool):
            dispatched += 1
        while await process_one_ffmpeg_job(pool):
            dispatched += 1
    else:
        while await process_one_legacy_job(pool):
            dispatched += 1

    # Brainrot: Stage 1 (API worker — GPT + TTS)
    while await process_one_brainrot_api_job(pool):
        dispatched += 1
    # Brainrot: Stage 2 (Brainrot FFmpeg worker — render)
    while await process_one_brainrot_ffmpeg_job(pool):
        dispatched += 1
    
    # Gameplay sources (Main FFmpeg worker)
    while await process_one_gameplay_job(pool):
        dispatched += 1

    return dispatched


async def process_one_notification(pool: asyncpg.Pool, channel: str) -> bool:
    """
    Handle a single LISTEN notification. Channel tells us which queue to
    dispatch from:
      - 'new_job'            → Main API queue (or legacy queue)
      - 'api_done'           → Main FFmpeg queue
      - 'brainrot_new'       → Brainrot API queue (GPT + TTS)
      - 'brainrot_api_done'  → Brainrot FFmpeg queue (render)
      - 'gameplay_new'       → Gameplay FFmpeg queue
    """
    if channel == "new_job":
        if config.SPLIT_MODE:
            return await process_one_api_job(pool)
        return await process_one_legacy_job(pool)
    if channel == "api_done":
        return await process_one_ffmpeg_job(pool)
    if channel == "brainrot_new":
        return await process_one_brainrot_api_job(pool)
    if channel == "brainrot_api_done":
        return await process_one_brainrot_ffmpeg_job(pool)
    if channel == "gameplay_new":
        return await process_one_gameplay_job(pool)
    logger.warning(f"Unknown LISTEN channel: {channel}")
    return False


# ═══════════════════════════════════════════════════════════════
# Reconciliation — catch stuck jobs
# ═══════════════════════════════════════════════════════════════

async def reconcile_stuck(pool: asyncpg.Pool) -> int:
    """
    Sweep for jobs stuck past the timeout in any pre-terminal state.
    Handles both main pipeline jobs and brainrot jobs independently.
    """
    minutes = config.RECONCILE_MINUTES
    reconciled = 0

    # ── Main pipeline jobs ────────────────────────────────────────
    stuck = await pool.fetch("""
        SELECT job_id, status, retry_count
        FROM jobs
        WHERE (status = 'created'          AND start_after         < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'dispatched'       AND dispatched_at       < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_processing'   AND api_dispatched_at   < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'api_done'         AND api_completed_at    < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'ffmpeg_processing' AND ffmpeg_dispatched_at < NOW() - ($1::int * 3 || ' minutes')::interval)
    """, str(minutes))

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
            if status in ("api_processing", "created", "dispatched"):
                if config.SPLIT_MODE and status != "dispatched":
                    await release_api_for_retry(pool, job_id)
                else:
                    await release_legacy_for_retry(pool, job_id)
            elif status in ("ffmpeg_processing", "api_done"):
                await release_ffmpeg_for_retry(pool, job_id)
        reconciled += 1

    # ── Brainrot jobs ─────────────────────────────────────────────
    stuck_brainrot = await pool.fetch("""
        SELECT job_id, status
        FROM brainrot_jobs
        WHERE (status IN ('created', 'generating_script', 'synthesizing_voice')
               AND updated_at < NOW() - ($1 || ' minutes')::interval)
           OR (status IN ('api_done', 'rendering')
               AND updated_at < NOW() - ($1::int * 3 || ' minutes')::interval)
    """, str(minutes))

    for job in stuck_brainrot:
        job_id = str(job["job_id"])
        status = job["status"]
        logger.warning(f"[brainrot:{job_id}] Stuck in '{status}' — releasing for retry")
        if status in ("created", "generating_script", "synthesizing_voice"):
            await release_brainrot_api_for_retry(pool, job_id)
        elif status in ("api_done", "rendering"):
            await release_brainrot_ffmpeg_for_retry(pool, job_id)
        reconciled += 1

    # ── Gameplay sources ──────────────────────────────────────────
    stuck_gameplay = await pool.fetch("""
        SELECT id, status, retry_count
        FROM brainrot_gameplay_sources
        WHERE (status = 'created'    AND start_after   < NOW() - ($1 || ' minutes')::interval)
           OR (status = 'processing' AND dispatched_at < NOW() - ($1::int * 3 || ' minutes')::interval)
    """, str(minutes))

    for source in stuck_gameplay:
        source_id = str(source["id"])
        status = source["status"]
        retries = source["retry_count"] or 0

        if retries >= config.MAX_RETRIES:
            logger.error(f"[gameplay:{source_id}] Stuck in '{status}' with max retries — failing")
            await pool.execute(
                "UPDATE brainrot_gameplay_sources SET status='failed', error_message='Gameplay dispatch stuck beyond timeout' WHERE id=$1",
                source_id,
            )
        else:
            logger.warning(f"[gameplay:{source_id}] Stuck in '{status}' — retrying")
            await release_gameplay_for_retry(pool, source_id)
        reconciled += 1

    if reconciled:
        logger.info(f"Reconciled {reconciled} stuck job(s) (main + brainrot + gameplay)")
    return reconciled
