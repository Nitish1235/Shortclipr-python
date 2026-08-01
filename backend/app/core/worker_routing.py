"""
worker_routing.py — worker target registry.

Parses WORKER_SERVICE_URLS + WORKER_SERVICE_REGIONS into a list of
WorkerTarget objects. Job dispatch is handled by the watcher service
(pg-boss queue via LISTEN/NOTIFY) — this module is only used by:
  - editor.py  (synchronous render dispatch to a random worker)
  - admin.py   (test lab needs primary-worker affinity)
"""

import logging
import random
from dataclasses import dataclass

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass(frozen=True)
class WorkerTarget:
    worker_url: str
    region: str


def _load_targets() -> list[WorkerTarget]:
    urls    = [u.strip() for u in settings.WORKER_SERVICE_URLS.split(",") if u.strip()]
    regions = [r.strip() for r in settings.WORKER_SERVICE_REGIONS.split(",") if r.strip()]

    if not urls:
        return []
    if regions and len(regions) != len(urls):
        raise ValueError(
            "WORKER_SERVICE_URLS and WORKER_SERVICE_REGIONS "
            f"must have the same count (got {len(urls)}, {len(regions)})"
        )
    if not regions:
        regions = [f"region-{i}" for i in range(len(urls))]
    return [WorkerTarget(u, r) for u, r in zip(urls, regions)]


# Cached at import time — env vars are fixed for the process lifetime.
_TARGETS = _load_targets()


def has_multi_region_workers() -> bool:
    return len(_TARGETS) > 0


def pick_primary_worker() -> WorkerTarget:
    """Always the first-configured target — for callers that need request
    affinity (e.g. admin test-pipeline polling)."""
    if not _TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")
    return _TARGETS[0]


def pick_worker() -> WorkerTarget:
    """Pick a random worker target. Used by editor.py for render dispatch."""
    if not _TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")
    if len(_TARGETS) == 1:
        return _TARGETS[0]
    return random.choice(_TARGETS)
