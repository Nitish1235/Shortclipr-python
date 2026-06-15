"""
internal.py — internal-only endpoints, called by Cloud Tasks.

POST /internal/pipeline/run — runs the pipeline for a job synchronously
(Cloud Tasks needs the HTTP response to determine success/retry).
Protected by a shared secret header (X-Internal-Secret), not user auth —
only the Cloud Tasks queue (and Cloud Run itself) should ever call this.
"""

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.pipeline.orchestrator import run_pipeline

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/internal", tags=["internal"])


class InternalRunRequest(BaseModel):
    job_id: str
    user_id: str
    youtube_url: str
    options: dict


@router.post("/pipeline/run", status_code=202)
async def internal_run_pipeline(body: InternalRunRequest, x_internal_secret: str = Header(default="")):
    if not settings.INTERNAL_TASK_SECRET or x_internal_secret != settings.INTERNAL_TASK_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    await run_pipeline(body.job_id, body.user_id, body.youtube_url, body.options)
    return {"status": "ok"}
