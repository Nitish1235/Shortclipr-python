from fastapi import APIRouter, Body, HTTPException, Depends
from app.db import supabase as db
from app.api.deps import get_current_user

router = APIRouter(prefix="/editor", tags=["editor"])

@router.post("/save/{job_id}/{clip_id}")
async def save_editor_config(
    job_id: str,
    clip_id: str,
    config: dict = Body(...),
    user = Depends(get_current_user)
):
    # Pro gating: free users cannot submit subtitlePosition
    if user.get("plan") == "free" and "subtitlePosition" in config:
        raise HTTPException(status_code=403, detail="Subtitle positioning is a Pro feature. Upgrade to unlock.")
    # Validate allowed keys
    allowed_keys = {"aspect", "template", "captionPacing", "highlightColor", "subtitlePosition", "transcript"}
    if not set(config).issubset(allowed_keys):
        raise HTTPException(status_code=400, detail="Invalid config keys")
    import json
    await db._execute("UPDATE clips SET editor_config=$1::jsonb WHERE clip_id=$2", json.dumps(config), clip_id)
    return {"status": "ok"}
