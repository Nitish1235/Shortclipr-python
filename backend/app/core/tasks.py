"""
tasks.py — Cloud Tasks enqueue helper for pipeline dispatch.

Replaces the old fire-and-forget httpx POST in jobs.py. Cloud Tasks gives us
retries with backoff and per-queue concurrency limits for free — a task
that fails (worker cold-starting, transient 5xx) gets retried automatically
instead of silently dying after one attempt.

Queue path layout: projects/{project}/locations/{region}/queues/{queue_name}
One queue per worker region (see app/core/worker_routing.py) — queue.region
is NOT necessarily the same as where the API runs, it's wherever that
worker's queue was created (normally co-located with that worker region).
"""

import asyncio
import json
import logging

from google.cloud import tasks_v2

from app.core.config import get_settings
from app.core.worker_routing import WorkerTarget

logger = logging.getLogger(__name__)
settings = get_settings()

_tasks_client: tasks_v2.CloudTasksClient | None = None


def _get_tasks_client() -> tasks_v2.CloudTasksClient:
    global _tasks_client
    if _tasks_client is None:
        _tasks_client = tasks_v2.CloudTasksClient()
    return _tasks_client


def _enqueue_sync(target: WorkerTarget, path: str, payload: dict, job_id: str) -> str:
    """Blocking Cloud Tasks create_task call — runs in executor."""
    client = _get_tasks_client()
    parent = client.queue_path(settings.GCP_PROJECT_ID, target.region, target.queue_name)

    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{target.worker_url}{path}",
            "headers": {
                "Content-Type": "application/json",
                "X-Internal-Secret": settings.INTERNAL_TASK_SECRET,
            },
            "body": json.dumps(payload).encode("utf-8"),
        },
        # Stable name dedupes retried enqueue attempts from the API side
        # (not Cloud Tasks' own internal retry, which is separate and fine) —
        # prevents a client-side retry of POST /jobs from double-enqueuing.
        "name": f"{parent}/tasks/{job_id}",
    }

    created = client.create_task(request={"parent": parent, "task": task})
    return created.name


async def enqueue_pipeline_run(target: WorkerTarget, job_id: str, payload: dict) -> str:
    """Enqueue a /internal/pipeline/run task on the given worker's queue.
    Returns the created Cloud Tasks task name."""
    loop = asyncio.get_running_loop()
    task_name = await loop.run_in_executor(
        None, _enqueue_sync, target, "/internal/pipeline/run", payload, job_id,
    )
    logger.info(f"[{job_id}] Enqueued to {target.region} ({target.queue_name}): {task_name}")
    return task_name
