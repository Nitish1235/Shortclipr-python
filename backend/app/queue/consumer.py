"""
consumer.py — Async worker that polls Redis queue and runs the pipeline.

Retry policy:
  Attempt 1 failure → wait 30s  → re-enqueue
  Attempt 2 failure → wait 120s → re-enqueue
  Attempt 3 failure → dead-letter queue + mark job failed in Supabase

Run this as a standalone process:
  python -m app.queue.consumer

On Cloud Run: deploy as a separate "worker" service with min-instances=1.
"""

import asyncio
import json
import logging
import signal
import sys
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.redis import redis
from app.db import supabase as db
from app.pipeline.orchestrator import run_pipeline
from app.queue.producer import enqueue_retry, send_to_dead_letter

logger = logging.getLogger(__name__)
settings = get_settings()

# Retry delays per attempt number (seconds)
RETRY_DELAYS = {
    1: 30,
    2: 120,
}
MAX_RETRIES = settings.MAX_JOB_RETRIES

_running = True


# ── Signal handling for graceful shutdown ─────────────────────

def _handle_shutdown(signum, frame):
    global _running
    logger.info("Worker shutting down gracefully...")
    _running = False


signal.signal(signal.SIGTERM, _handle_shutdown)
signal.signal(signal.SIGINT, _handle_shutdown)


# ── Core poll-and-execute loop ─────────────────────────────────

async def run_worker() -> None:
    """
    Main worker loop. Polls Redis queue with a short sleep interval.
    Each job runs in its own asyncio task so the worker can pick up
    the next job without waiting (up to MAX_CONCURRENT_CLIPS limit
    which is enforced inside the pipeline's extraction semaphore).
    """
    logger.info(f"Worker started. Polling queue: {settings.REDIS_JOB_QUEUE}")

    active_tasks: set[asyncio.Task] = set()

    while _running:
        raw = await redis.rpop(settings.REDIS_JOB_QUEUE)

        if raw is None:
            await asyncio.sleep(settings.WORKER_POLL_INTERVAL)
            continue

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Malformed job payload: {e} — skipping")
            continue

        job_id = payload.get("job_id", "unknown")
        attempt = payload.get("attempt", 1)
        logger.info(f"Picked up job {job_id} (attempt {attempt})")

        task = asyncio.create_task(
            _process_job(payload),
            name=f"job-{job_id}",
        )
        active_tasks.add(task)
        task.add_done_callback(active_tasks.discard)

    # Wait for active tasks before exiting
    if active_tasks:
        logger.info(f"Waiting for {len(active_tasks)} active tasks to complete...")
        await asyncio.gather(*active_tasks, return_exceptions=True)

    logger.info("Worker stopped.")


async def _process_job(payload: dict) -> None:
    """Execute a single job with retry/DLQ logic."""
    job_id = payload["job_id"]
    user_id = payload["user_id"]
    youtube_url = payload["youtube_url"]
    options = payload.get("options", {})
    attempt = payload.get("attempt", 1)
    errors: list[str] = payload.get("errors", [])

    try:
        await run_pipeline(job_id, user_id, youtube_url, options)
        logger.info(f"[{job_id}] ✅ Completed on attempt {attempt}")

    except Exception as e:
        error_str = f"Attempt {attempt}: {type(e).__name__}: {str(e)[:300]}"
        errors.append(error_str)
        logger.error(f"[{job_id}] ❌ Failed attempt {attempt}: {e}")

        if attempt < MAX_RETRIES:
            delay = RETRY_DELAYS.get(attempt, 120)
            logger.info(f"[{job_id}] Retrying in {delay}s (attempt {attempt + 1})")
            await db.update_job_progress(
                job_id, 0,
                f"Retrying... (attempt {attempt + 1}/{MAX_RETRIES})",
                status="queued",
            )
            await asyncio.sleep(delay)
            payload["errors"] = errors
            await enqueue_retry(payload, attempt + 1, delay)
        else:
            # All retries exhausted → dead-letter queue
            logger.error(f"[{job_id}] All {MAX_RETRIES} attempts failed → DLQ")
            await send_to_dead_letter(payload, errors)
            await db.fail_job(
                job_id,
                f"Processing failed after {MAX_RETRIES} attempts. "
                f"Our team has been notified. Last error: {str(e)[:200]}",
            )


# ── Health Check Server (Cloud Run requirement) ────────────────

import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")
    def log_message(self, format, *args):
        pass

def start_health_server():
    port = int(os.environ.get("PORT", 8080))
    httpd = HTTPServer(('', port), HealthCheckHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    logger.info(f"Health check server listening on port {port}")

# ── Entry point ────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    start_health_server()
    asyncio.run(run_worker())
