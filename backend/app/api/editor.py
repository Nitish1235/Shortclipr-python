"""
editor.py — Clip editor config save endpoint.

Access rules:
  free  → 403 (editor is a paid feature)
  paid  → can save any editor config key
"""

import json
from fastapi import APIRouter, Body, HTTPException, status
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser
from app.db import supabase as db

router = APIRouter(tags=["editor"])

# Keys allowed in the editor config payload
_ALLOWED_KEYS = {
    "aspect", "template", "transcript",
    # Caption style
    "captionPacing", "style", "color",
    # Caption position
    "h_align", "v_align", "subtitlePosition",
    # Caption density
    "words_per_line",
    # Highlight
    "highlightColor",
}


def _require_plan(user: dict) -> None:
    """Raise 403 if the user is on the free plan."""
    if user.get("plan", "free") == "free":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "The editor is available on paid plans. "
                "Upgrade to Starter or Pro to customise captions, "
                "styles, and positions."
            ),
        )


# ── Save editor config ────────────────────────────────────────

@router.post("/editor/save/{job_id}/{clip_id}")
async def save_editor_config(
    job_id:  str,
    clip_id: str,
    config:  dict = Body(...),
    current_user: CurrentUser = ...,
):
    user = await db.get_user(current_user.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    _require_plan(user)

    bad = set(config) - _ALLOWED_KEYS
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid config keys: {bad}")

    await db._execute(
        "UPDATE clips SET editor_config=$1::jsonb WHERE clip_id=$2",
        json.dumps(config),
        clip_id,
    )
    return {"status": "ok"}


# ── Download clip ─────────────────────────────────────────────

@router.get("/clips/{clip_id}/download")
async def download_clip(
    clip_id: str,
    current_user: CurrentUser = ...,
):
    """
    Redirect to the GCS video URL.
    Free users → 403.  Paid users → 302 redirect to the MP4.
    """
    user = await db.get_user(current_user.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    _require_plan(user)

    rows = await db._fetch(
        "SELECT video_url, user_id FROM clips WHERE clip_id=$1",
        clip_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = rows[0]
    if str(clip["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return RedirectResponse(url=clip["video_url"], status_code=302)
