"""
worker_routing.py — picks which worker region/queue a job is dispatched to.

Round-robin across WORKER_SERVICE_URLS via an atomic Redis INCR (shared
across every API instance, since Cloud Run scales the API horizontally and
an in-process counter wouldn't be consistent across instances). Falls back
to random.choice if Redis is unreachable — better to pick unevenly than to
fail dispatch entirely over a cache hiccup.

Per-region Cloud Tasks queue concurrency caps (configured at the queue
itself, not here) are what actually prevent overloading a region — this
module only needs to spread load roughly evenly, not track real-time
per-region utilization.
"""

import logging
import random
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.redis import redis

logger = logging.getLogger(__name__)
settings = get_settings()

_ROUND_ROBIN_KEY = "worker_routing:rr_counter"


@dataclass(frozen=True)
class WorkerTarget:
    worker_url: str
    queue_name: str
    region: str


def _load_targets() -> list[WorkerTarget]:
    urls    = [u.strip() for u in settings.WORKER_SERVICE_URLS.split(",") if u.strip()]
    queues  = [q.strip() for q in settings.WORKER_QUEUE_NAMES.split(",") if q.strip()]
    regions = [r.strip() for r in settings.WORKER_QUEUE_REGIONS.split(",") if r.strip()]

    if not urls:
        return []
    if len(queues) != len(urls) or len(regions) != len(urls):
        raise ValueError(
            "WORKER_SERVICE_URLS, WORKER_QUEUE_NAMES, and WORKER_QUEUE_REGIONS "
            f"must have the same count (got {len(urls)}, {len(queues)}, {len(regions)})"
        )
    return [WorkerTarget(u, q, r) for u, q, r in zip(urls, queues, regions)]


# Cached at import time — these come from env vars, fixed for the process lifetime.
_TARGETS = _load_targets()


def has_multi_region_workers() -> bool:
    return len(_TARGETS) > 0


def pick_primary_worker() -> WorkerTarget:
    """Always the same (first-configured) target — for callers that need
    request affinity (e.g. admin test-pipeline polling, whose job state
    lives in-memory on whichever single worker instance handled the
    dispatch; round-robin would poll a different region and 404)."""
    if not _TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")
    return _TARGETS[0]


async def pick_worker() -> WorkerTarget:
    """Pick a worker target round-robin. Caller must check
    has_multi_region_workers() first — raises if no targets configured."""
    if not _TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")

    if len(_TARGETS) == 1:
        return _TARGETS[0]

    try:
        count = await redis.incr(_ROUND_ROBIN_KEY)
        idx = count % len(_TARGETS)
    except Exception as e:
        logger.warning(f"Round-robin counter unavailable, picking randomly: {e}")
        idx = random.randrange(len(_TARGETS))

    return _TARGETS[idx]
