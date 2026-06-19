"""
internal.py — internal-only endpoints, called by the API service when
dispatching heavy work to the worker service.

POST /internal/pipeline/run    — fires the pipeline for a job in the
                                  background (asyncio.create_task) and
                                  returns immediately.
POST /internal/editor/render   — re-burns captions onto a raw clip (the
                                  ffmpeg work behind POST /editor/render).

Both are protected by a shared secret header (X-Internal-Secret), not user
auth — only the API service should ever call these.
"""

import asyncio
import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.api.editor import _burn_and_upload_from_url
from app.core.config import get_settings
from app.pipeline.captions import Caption
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.test_pipeline import run_test_pipeline

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_internal_secret(x_internal_secret: str) -> None:
    if not settings.INTERNAL_TASK_SECRET or x_internal_secret != settings.INTERNAL_TASK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


class InternalRunRequest(BaseModel):
    job_id: str
    user_id: str
    youtube_url: str
    options: dict


@router.post("/pipeline/run", status_code=202)
async def internal_run_pipeline(body: InternalRunRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_pipeline(body.job_id, body.user_id, body.youtube_url, body.options),
        name=f"pipeline-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


class InternalTestRequest(BaseModel):
    job_id: str
    youtube_url: str
    quality: str = "1080p"


@router.post("/test/run", status_code=202)
async def internal_run_test(body: InternalTestRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    asyncio.create_task(
        run_test_pipeline(body.job_id, body.youtube_url, body.quality),
        name=f"test-{body.job_id[:8]}",
    )
    return {"status": "accepted"}


class InternalRenderRequest(BaseModel):
    job_id: str
    clip_id: str
    raw_url: str
    captions: list[dict]
    config: dict


@router.post("/editor/render")
async def internal_render_clip(body: InternalRenderRequest, x_internal_secret: str = Header(default="")):
    _require_internal_secret(x_internal_secret)
    captions = [Caption(start=c["start"], end=c["end"], text=c["text"]) for c in body.captions]
    video_url = await _burn_and_upload_from_url(
        body.raw_url, captions, body.config, body.job_id, body.clip_id,
    )
    return {"video_url": video_url}
