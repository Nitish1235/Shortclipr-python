"""
Watcher service configuration — loaded from environment variables.

Two operating modes, auto-detected from env vars:

  SPLIT-WORKER MODE (preferred, matches app.core.config split):
    Set API_WORKER_URLS + FFMPEG_WORKER_URLS (plus matching *_REGIONS lists).
    The watcher maintains two independent worker pools:
      - API pool  — dispatches 'created' jobs (pipeline_stage='api') to
                    /internal/api-stage/run, soft cap = API_REGION_SOFT_CAP.
      - FFmpeg pool — dispatches 'api_done' jobs to /internal/ffmpeg-stage/run,
                    soft cap = FFMPEG_REGION_SOFT_CAP.

  LEGACY MODE (single unified pool):
    Only WORKER_SERVICE_URLS set. Dispatches everything to /internal/pipeline/run
    which runs both stages back-to-back on one instance. Soft cap = REGION_SOFT_CAP.
    This mirrors the pre-split behaviour and keeps old deployments alive.

SPLIT_MODE is True whenever the API or FFmpeg pool is populated.
"""

import os


def _required(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise RuntimeError(f"Required env var {name} is not set")
    return val


def _optional(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "")
    return int(raw) if raw.strip() else default


def _parse_workers(urls_var: str, regions_var: str) -> list[dict]:
    urls    = [u.strip() for u in _optional(urls_var).split(",")    if u.strip()]
    regions = [r.strip() for r in _optional(regions_var).split(",") if r.strip()]
    if urls and regions and len(urls) != len(regions):
        raise RuntimeError(
            f"{urls_var} ({len(urls)}) and {regions_var} ({len(regions)}) "
            f"must have the same count"
        )
    if urls and not regions:
        regions = [f"region-{i}" for i in range(len(urls))]
    return [{"url": u, "region": r} for u, r in zip(urls, regions)]


# ── Supabase Postgres (same connection string as API/worker) ────
DB_URL: str = _required("SUPABASE_DB_URL")

# ── Split-worker pools (preferred) ─────────────────────────────
API_WORKERS:    list[dict] = _parse_workers("API_WORKER_URLS",    "API_WORKER_REGIONS")
FFMPEG_WORKERS: list[dict] = _parse_workers("FFMPEG_WORKER_URLS", "FFMPEG_WORKER_REGIONS")

# Dedicated brainrot FFmpeg pool — compositing runs here, isolated from
# the main FFMPEG_WORKERS so a heavy YouTube Shorts encode never blocks
# a brainrot render (and vice versa). If BRAINROT_WORKER_URLS is not set,
# brainrot FFmpeg jobs fall back to the main FFMPEG_WORKERS pool.
_BRAINROT_WORKERS_RAW: list[dict] = _parse_workers("BRAINROT_WORKER_URLS", "BRAINROT_WORKER_REGIONS")
BRAINROT_WORKERS: list[dict] = _BRAINROT_WORKERS_RAW or FFMPEG_WORKERS

# Soft caps are *per-worker-URL*, not per-GCP-region — each entry in the
# *_WORKERS list gets its own load counter keyed by its region label.
# Give each Cloud Run service URL a unique region string so caps apply
# independently (e.g. FFMPEG_WORKER_REGIONS=us-east,eu-west, not both "us").
#
# API workers are I/O-bound (GPT + TTS), so 4 concurrent jobs per instance
# is safe and leaves headroom. FFmpeg workers are CPU-bound: 1 job per
# instance is the correct limit so encoding doesn't starve the CPU (see
# cloudbuild-ffmpeg-worker.yaml's --concurrency 1 — matched here on purpose).
#
# Brainrot FFmpeg worker deliberately runs 2 jobs per instance instead (2
# vCPU, --concurrency 2 in cloudbuild-brainrot-worker.yaml) — the worker
# itself adapts each render's ffmpeg thread count to how many renders are
# actually live on that instance (_ACTIVE_RENDERS_ON_INSTANCE in
# brainrot_stage.py), so packing 2 onto one instance is safe by design, not
# just tolerated. This soft cap is still the *fleet-wide* ceiling across all
# instances of the region (not a per-instance limit) — sized here as
# roughly 2 jobs/instance × a handful of concurrently-warm instances under
# normal load. Raise it if brainrot volume grows enough that this becomes
# the bottleneck before max-instances does.
API_REGION_SOFT_CAP:      int = _int("API_REGION_SOFT_CAP",      4)
FFMPEG_REGION_SOFT_CAP:   int = _int("FFMPEG_REGION_SOFT_CAP",   1)
BRAINROT_REGION_SOFT_CAP: int = _int("BRAINROT_REGION_SOFT_CAP", 8)

# ── Legacy unified pool (WORKER_SERVICE_URLS) ──────────────────
LEGACY_WORKERS: list[dict] = _parse_workers("WORKER_SERVICE_URLS", "WORKER_SERVICE_REGIONS")
LEGACY_REGION_SOFT_CAP: int = _int("WATCHER_REGION_SOFT_CAP", 4)

# Mode select — SPLIT_MODE if either split pool is populated.
SPLIT_MODE: bool = bool(API_WORKERS or FFMPEG_WORKERS)

if SPLIT_MODE:
    if not API_WORKERS:
        raise RuntimeError(
            "SPLIT_MODE detected (FFMPEG_WORKER_URLS is set) but API_WORKER_URLS is empty. "
            "Both pools must be configured together — jobs enter at the API stage."
        )
    if not FFMPEG_WORKERS:
        raise RuntimeError(
            "SPLIT_MODE detected (API_WORKER_URLS is set) but FFMPEG_WORKER_URLS is empty. "
            "Both pools must be configured together — API-stage output has nowhere to go."
        )
elif not LEGACY_WORKERS:
    raise RuntimeError(
        "No worker pool configured. Set either "
        "(API_WORKER_URLS + FFMPEG_WORKER_URLS) for split-worker mode, "
        "or WORKER_SERVICE_URLS for legacy single-pool mode."
    )

# ── Shared secret & timing knobs ───────────────────────────────
INTERNAL_SECRET: str = _required("INTERNAL_TASK_SECRET")

# How often the poll fallback runs (seconds)
POLL_INTERVAL: int = _int("WATCHER_POLL_INTERVAL", 15)

# Reconciliation timeout for the *API* stage (created / api_processing / api_done).
# FFmpeg stage uses 3× this since encoding is inherently slower.
RECONCILE_MINUTES: int = _int("RECONCILE_STUCK_MINUTES", 10)

# Max dispatch retries before marking a job as failed (per stage)
MAX_RETRIES: int = _int("WATCHER_MAX_RETRIES", 5)

LOG_LEVEL: str = _optional("LOG_LEVEL", "INFO")
