"""
worker_routing.py — worker target registry.

Two worker pools, matching the watcher's own split-worker detection
(watcher/config.py) so synchronous dispatch here never disagrees with how
async job dispatch is routed:
  - FFmpeg pool: FFMPEG_WORKER_URLS/REGIONS (split-worker mode) — falls back
    to the legacy WORKER_SERVICE_URLS/REGIONS pool if unset.
  - API pool: API_WORKER_URLS/REGIONS (split-worker mode) — no legacy
    fallback since the legacy pool is unified (same instance runs both
    stages, so the FFmpeg pool covers that case).

Used by:
  - editor.py            (synchronous caption re-render dispatch)
All of these are CPU-heavy FFmpeg work, so they use the FFmpeg-pool helpers.
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


def _load_targets(urls_csv: str, regions_csv: str, urls_var: str, regions_var: str) -> list[WorkerTarget]:
    urls    = [u.strip() for u in urls_csv.split(",") if u.strip()]
    regions = [r.strip() for r in regions_csv.split(",") if r.strip()]

    if not urls:
        return []
    if regions and len(regions) != len(urls):
        raise ValueError(
            f"{urls_var} and {regions_var} must have the same count (got {len(urls)}, {len(regions)})"
        )
    if not regions:
        regions = [f"region-{i}" for i in range(len(urls))]
    return [WorkerTarget(u, r) for u, r in zip(urls, regions)]


# Cached at import time — env vars are fixed for the process lifetime.
_LEGACY_TARGETS = _load_targets(
    settings.WORKER_SERVICE_URLS, settings.WORKER_SERVICE_REGIONS,
    "WORKER_SERVICE_URLS", "WORKER_SERVICE_REGIONS",
)
_API_TARGETS = _load_targets(
    settings.API_WORKER_URLS, settings.API_WORKER_REGIONS,
    "API_WORKER_URLS", "API_WORKER_REGIONS",
)
_FFMPEG_TARGETS = _load_targets(
    settings.FFMPEG_WORKER_URLS, settings.FFMPEG_WORKER_REGIONS,
    "FFMPEG_WORKER_URLS", "FFMPEG_WORKER_REGIONS",
) or _LEGACY_TARGETS


def has_multi_region_workers() -> bool:
    """True if the legacy unified worker pool is configured. Kept for
    callers that specifically need the legacy pool; most callers doing
    FFmpeg-heavy work should use has_ffmpeg_workers() instead, which also
    covers split-worker mode."""
    return len(_LEGACY_TARGETS) > 0


def has_ffmpeg_workers() -> bool:
    """True if there's any remote pool to dispatch FFmpeg work to — either
    the split-worker FFMPEG_WORKER_URLS pool or the legacy unified pool."""
    return len(_FFMPEG_TARGETS) > 0


def has_api_workers() -> bool:
    return len(_API_TARGETS) > 0


def pick_primary_worker() -> WorkerTarget:
    """Always the first-configured legacy target — for callers that need
    request affinity (e.g. admin test-pipeline polling)."""
    if not _LEGACY_TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")
    return _LEGACY_TARGETS[0]


def pick_worker() -> WorkerTarget:
    """Pick a random legacy-pool worker target."""
    if not _LEGACY_TARGETS:
        raise RuntimeError("No worker targets configured (WORKER_SERVICE_URLS is empty)")
    if len(_LEGACY_TARGETS) == 1:
        return _LEGACY_TARGETS[0]
    return random.choice(_LEGACY_TARGETS)


def pick_primary_ffmpeg_worker() -> WorkerTarget:
    """Always the first-configured FFmpeg-pool target — for callers that
    need request affinity (e.g. admin test-pipeline polling, which keeps
    progress state in-memory on whichever instance handled dispatch)."""
    if not _FFMPEG_TARGETS:
        raise RuntimeError("No FFmpeg worker targets configured (FFMPEG_WORKER_URLS/WORKER_SERVICE_URLS are empty)")
    return _FFMPEG_TARGETS[0]


def pick_ffmpeg_worker() -> WorkerTarget:
    """Pick a random target from the FFmpeg pool — split-worker
    FFMPEG_WORKER_URLS if configured, else the legacy unified pool. Used for
    synchronous CPU-heavy dispatch (caption re-render, admin/marketing
    renders) so it agrees with how the watcher routes async ffmpeg-stage
    jobs in either mode."""
    if not _FFMPEG_TARGETS:
        raise RuntimeError("No FFmpeg worker targets configured (FFMPEG_WORKER_URLS/WORKER_SERVICE_URLS are empty)")
    if len(_FFMPEG_TARGETS) == 1:
        return _FFMPEG_TARGETS[0]
    return random.choice(_FFMPEG_TARGETS)
