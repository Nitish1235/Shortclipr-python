"""
jobs.py — /jobs endpoints.
POST /jobs          — Validate URL, check plan limit, enqueue job
GET  /jobs          — List user's jobs
GET  /jobs/{job_id} — Get single job + progress
DELETE /jobs/{job_id} — Delete job + clips
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, HttpUrl, field_validator

from app.api.deps import CurrentUser
from app.db import supabase as db
from app.pipeline.stream import extract_video_id, get_video_metadata
from app.queue.producer import enqueue_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


# ── Schemas ────────────────────────────────────────────────────

class JobOptions(BaseModel):
    clip_count: int = 10
    min_duration: int = 30
    max_duration: int = 90
    language: str = "Auto / No translation"
    clip_length: str = "Auto (<90s)"
    style: str = "minimal"
    topic: str = ""
    quality: str = "720p"

    @field_validator("clip_count")
    @classmethod
    def validate_clip_count(cls, v):
        return max(1, min(20, v))

    @field_validator("style")
    @classmethod
    def validate_style(cls, v):
        valid = {"minimal", "hormozi", "mrbeast", "karaoke"}
        return v if v in valid else "minimal"


class CreateJobRequest(BaseModel):
    youtube_url: str
    options: JobOptions = JobOptions()


class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    current_step: str | None
    video_title: str | None
    video_duration: int | None
    clip_count: int
    created_at: str


# ── Endpoints ──────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_job(body: CreateJobRequest, current_user: CurrentUser):
    """
    Validate URL → check plan limit → enqueue job → return job_id immediately.
    Frontend subscribes to Supabase Realtime for progress updates.
    """
    # 1. Check plan limit (server-enforced — never trust frontend)
    allowed, reason = await db.check_user_can_process(current_user.user_id)
    if not allowed:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=reason)

    # 2. Validate YouTube URL
    video_id = extract_video_id(body.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid YouTube URL. Please paste a valid youtube.com or youtu.be link.",
        )

    # 3. Create job record in Supabase
    import json
    job_id = str(uuid.uuid4())
    await db._execute(
        """
        INSERT INTO jobs (job_id, user_id, youtube_url, status, progress, current_step, options, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
        """,
        job_id,
        current_user.user_id,
        body.youtube_url,
        "queued",
        0,
        "Queued — starting shortly",
        json.dumps(body.options.model_dump()),
        datetime.now(timezone.utc)
    )

    # 4. Push to worker queue
    await enqueue_job(
        job_id=job_id,
        user_id=current_user.user_id,
        youtube_url=body.youtube_url,
        options=body.options.model_dump(),
    )

    return {"job_id": job_id, "status": "queued"}


@router.get("")
async def list_jobs(current_user: CurrentUser):
    """List all jobs for the authenticated user, newest first."""
    rows = await db._fetch(
        "SELECT * FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        current_user.user_id
    )
    # Coerce UUID/datetime fields to string for reliable JSON serialization
    for r in rows:
        r["job_id"] = str(r["job_id"])
        if "user_id" in r and r["user_id"]:
            r["user_id"] = str(r["user_id"])
        if "created_at" in r and r["created_at"]:
            r["created_at"] = r["created_at"].isoformat()
        if "updated_at" in r and r["updated_at"]:
            r["updated_at"] = r["updated_at"].isoformat()
        if "completed_at" in r and r["completed_at"]:
            r["completed_at"] = r["completed_at"].isoformat()
            
    return {"jobs": rows}


@router.get("/{job_id}")
async def get_job(job_id: str, current_user: CurrentUser):
    """Get a single job with its current progress."""
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    job["job_id"] = str(job["job_id"])
    job["user_id"] = str(job["user_id"])
    if job.get("created_at"): job["created_at"] = job["created_at"].isoformat()
    if job.get("updated_at"): job["updated_at"] = job["updated_at"].isoformat()
    if job.get("completed_at"): job["completed_at"] = job["completed_at"].isoformat()
    
    return job


@router.get("/{job_id}/clips")
async def get_job_clips(job_id: str, current_user: CurrentUser):
    """Get all clips for a job, sorted by viral score."""
    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")
        
    clips = await db.get_clips_for_job(job_id)
    for c in clips:
        c["clip_id"] = str(c["clip_id"])
        c["job_id"] = str(c["job_id"])
        c["user_id"] = str(c["user_id"])
        if c.get("created_at"): c["created_at"] = c["created_at"].isoformat()
        
    return {"clips": clips, "total": len(clips)}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(job_id: str, current_user: CurrentUser):
    """Delete job and all associated clips from DB (GCS cleanup handled async)."""
    job = await db.get_job(job_id)
    if not job or str(job["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=404, detail="Job not found")
        
    await db._execute("DELETE FROM clips WHERE job_id=$1", job_id)
    await db._execute("DELETE FROM jobs WHERE job_id=$1", job_id)
