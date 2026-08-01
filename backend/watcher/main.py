"""
ShortClipr Watcher — pg-boss job queue consumer.

Replaces Google Cloud Tasks with Postgres LISTEN/NOTIFY + poll fallback.

Split-worker lifecycle:
  1. Connect to Supabase Postgres
  2. Startup catch-up: drain both queues (API + FFmpeg) for anything unclaimed
  3. Subscribe to LISTEN 'new_job' (API queue) and LISTEN 'api_done' (FFmpeg queue)
  4. Poll every POLL_INTERVAL seconds as a fallback for missed notifications
  5. Reconcile stuck jobs every 60s

Legacy single-pool mode uses the same loop but only LISTENs on 'new_job'
and drains only the legacy queue.
"""

import asyncio
import logging
import time

import asyncpg

from watcher import config
from watcher.dispatcher import (
    process_all_unclaimed,
    process_one_notification,
    reconcile_stuck,
)

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("watcher")

_pool: asyncpg.Pool | None = None
_last_reconcile: float = 0.0
RECONCILE_INTERVAL = 60.0


async def _ensure_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    for attempt in range(1, 4):
        try:
            logger.info(f"Connecting to Postgres (attempt {attempt}/3)...")
            _pool = await asyncpg.create_pool(
                dsn=config.DB_URL,
                min_size=2,
                max_size=5,
                command_timeout=30,
                statement_cache_size=0,
                ssl="require",
            )
            logger.info("DB pool ready")
            return _pool
        except Exception as e:
            logger.warning(f"DB connection attempt {attempt} failed: {e}")
            if attempt < 3:
                await asyncio.sleep(2)
    raise RuntimeError("Could not connect to Postgres after 3 attempts")


def _on_new_job_notification(conn, pid, channel, payload):
    """LISTEN callback for 'new_job' — job just entered the API/legacy queue."""
    logger.debug(f"LISTEN new_job payload={payload}")
    asyncio.ensure_future(_handle_notification("new_job"))


def _on_api_done_notification(conn, pid, channel, payload):
    """LISTEN callback for 'api_done' — API stage finished, FFmpeg stage due."""
    logger.debug(f"LISTEN api_done payload={payload}")
    asyncio.ensure_future(_handle_notification("api_done"))


async def _handle_notification(channel: str) -> None:
    """Dispatch one job in response to a notification on the given channel."""
    pool = await _ensure_pool()
    try:
        await process_one_notification(pool, channel)
    except Exception:
        logger.exception(f"Error processing notification on {channel}")


async def _maybe_reconcile(pool: asyncpg.Pool) -> None:
    """Run reconciliation if enough time has passed since the last sweep."""
    global _last_reconcile
    now = time.monotonic()
    if now - _last_reconcile >= RECONCILE_INTERVAL:
        _last_reconcile = now
        try:
            await reconcile_stuck(pool)
        except Exception:
            logger.exception("Reconciliation error")


async def _run() -> None:
    pool = await _ensure_pool()

    # 1. Startup catch-up — drain any unclaimed jobs left over from a prior
    #    watcher instance (both queues in split mode, legacy queue otherwise).
    count = await process_all_unclaimed(pool)
    if count:
        logger.info(f"Startup catch-up: dispatched {count} unclaimed job(s)")

    # 2. Subscribe to LISTEN channels
    listen_conn = await pool.acquire()
    await listen_conn.add_listener("new_job", _on_new_job_notification)
    if config.SPLIT_MODE:
        await listen_conn.add_listener("api_done", _on_api_done_notification)
        logger.info("LISTEN 'new_job' + 'api_done' active (split-worker mode)")
    else:
        logger.info("LISTEN 'new_job' active (legacy single-pool mode)")

    # 3. Poll loop + reconciliation
    while True:
        try:
            count = await process_all_unclaimed(pool)
            if count:
                logger.info(f"Poll: dispatched {count} job(s)")

            await _maybe_reconcile(pool)
        except Exception:
            logger.exception("Poll loop error")

        await asyncio.sleep(config.POLL_INTERVAL)


async def main() -> None:
    """Entrypoint — runs forever, with outer crash-recovery loop."""
    if config.SPLIT_MODE:
        logger.info(
            f"Watcher starting (SPLIT MODE) — "
            f"API workers={len(config.API_WORKERS)} (soft_cap={config.API_REGION_SOFT_CAP}), "
            f"FFmpeg workers={len(config.FFMPEG_WORKERS)} (soft_cap={config.FFMPEG_REGION_SOFT_CAP}), "
            f"poll={config.POLL_INTERVAL}s, reconcile={config.RECONCILE_MINUTES}min"
        )
    else:
        logger.info(
            f"Watcher starting (LEGACY MODE) — "
            f"{len(config.LEGACY_WORKERS)} worker(s), "
            f"soft_cap={config.LEGACY_REGION_SOFT_CAP}, "
            f"poll={config.POLL_INTERVAL}s, reconcile={config.RECONCILE_MINUTES}min"
        )

    while True:
        try:
            await _run()
        except Exception:
            logger.exception("Watcher crashed — restarting in 5s")
            global _pool
            if _pool:
                try:
                    await _pool.close()
                except Exception:
                    pass
                _pool = None
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
