"""
orchestrator.py — Unified pipeline composer for single-service mode.

After the split-worker refactor (see api_stage.py + ffmpeg_stage.py), this
module is just a thin sequencer that runs both stages back-to-back in the
same process. It's used ONLY in single-service mode (WORKER_SERVICE_URLS
empty in config.py) — the split-worker deployment invokes each stage
independently via /internal/api-stage/run and /internal/ffmpeg-stage/run.

For split-worker deployments this file is effectively dead code, but it's
kept so the local dev flow (`uvicorn app.main:app` with no worker URLs
configured) still works with a single command.

Timeout: 25 min total (API ~5 min + FFmpeg ~20 min). API stage's own
timeout (300s) fires first if it hangs; if it succeeds, FFmpeg gets the
remaining budget up to its own 1500s cap.
"""

import asyncio
import logging

from app.db import supabase as db
from app.pipeline.api_stage import run_api_stage
from app.pipeline.ffmpeg_stage import run_ffmpeg_stage

logger = logging.getLogger(__name__)

PIPELINE_TIMEOUT_SECONDS = 1500   # matches ffmpeg_stage cap


async def run_pipeline(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    """
    Single-service pipeline: run API stage → check outcome → run FFmpeg stage.

    Both stages have their own internal try/except (with refund logic), so
    all we do here is sequence them. If the API stage fails, it's already
    marked the job failed + refunded — FFmpeg stage doesn't run.

    In split-worker mode this function is not called at all; the watcher
    dispatches each stage to its own worker pool.
    """
    try:
        await asyncio.wait_for(
            _run_both_stages(job_id, user_id, youtube_url, options),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        # If api_stage's own 300s timeout didn't catch it, our outer 1500s
        # is a hard backstop. Refund handled by whichever stage was running.
        msg = f"Pipeline timed out after {PIPELINE_TIMEOUT_SECONDS}s"
        logger.error(f"[{job_id}] {msg}")
        await db.fail_job(job_id, msg)


async def _run_both_stages(
    job_id: str,
    user_id: str,
    youtube_url: str,
    options: dict,
) -> None:
    # STAGE 1 — API (metadata, transcript, GPT, write ffmpeg_payload)
    await run_api_stage(job_id, user_id, youtube_url, options)

    # Verify the API stage succeeded before firing FFmpeg. If it failed,
    # run_api_stage already flipped status to 'failed' + refunded.
    job = await db.get_job(job_id)
    if not job or job.get("status") != "api_done":
        # 'failed' | 'cancelled' | anything else → don't invoke FFmpeg.
        return

    # STAGE 2 — FFmpeg (DASH + encode + upload + complete)
    await run_ffmpeg_stage(job_id)
