"""
youtube.py — YouTube metadata endpoint (no auth required).
Used by frontend to show video preview BEFORE the user clicks Generate.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.pipeline.stream import extract_video_id, get_video_metadata

router = APIRouter(prefix="/youtube", tags=["youtube"])


class MetadataRequest(BaseModel):
    url: str


@router.post("/metadata")
async def fetch_youtube_metadata(body: MetadataRequest, current_user: CurrentUser):
    """
    Returns video metadata given a YouTube URL.
    Requires authentication to prevent abuse.
    """
    video_id = extract_video_id(body.url)
    if not video_id:
        raise HTTPException(
            status_code=422,
            detail="Not a valid YouTube URL",
        )
    metadata = await get_video_metadata(video_id)
    return {
        "video_id": video_id,
        "title": metadata.get("title", ""),
        "channel": metadata.get("channel", ""),
        "thumbnail": metadata.get("thumbnail", ""),
        "duration": metadata.get("duration", 0),
        "url": body.url,
    }
