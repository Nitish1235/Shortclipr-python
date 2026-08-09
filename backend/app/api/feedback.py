"""
feedback.py — Post-queue product survey.

Shown to the user right after a job is queued (frontend-driven — see
FeedbackModal.jsx). Submitting unlocks one free clip download for a
free-plan user (see editor.py's /clips/{clip_id}/download, the actual
enforcement point) — the reward is scoped to the job this feedback was
given for, and to the account overall: a user can only ever submit once
(UNIQUE(user_id) on job_feedback, migration 007), so there's only ever
one reward to consume.
"""

import logging

import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.db import supabase as db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])


class FeedbackRequest(BaseModel):
    job_id:              str
    source:               str | None = None
    source_other:         str | None = None
    visit_reason:         str | None = None
    visit_reason_other:   str | None = None
    blocker:              str | None = None
    blocker_other:        str | None = None
    comment:              str | None = None


@router.post("/feedback")
async def submit_feedback(body: FeedbackRequest, current_user: CurrentUser):
    """Record a feedback submission. One per account, ever."""
    job = await db.get_job(body.job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        row = await db.insert_job_feedback(
            job_id=body.job_id,
            user_id=current_user.user_id,
            source=body.source,
            source_other=body.source_other,
            visit_reason=body.visit_reason,
            visit_reason_other=body.visit_reason_other,
            blocker=body.blocker,
            blocker_other=body.blocker_other,
            comment=body.comment,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="You've already submitted feedback — thanks again!")

    logger.info(f"Feedback submitted by {current_user.email} for job {body.job_id}")
    return {"success": True, "feedback_id": str(row["feedback_id"])}
