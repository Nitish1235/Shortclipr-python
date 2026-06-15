"""
editor.py — Clip editor config save endpoint.

Access rules:
  free  → 403 (editor is a paid feature)
  paid  → can save any editor config key
"""

import json
import tempfile
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, Body, HTTPException, status
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db import supabase as db
from app.pipeline.captions import Caption, burn_captions
from app.pipeline.uploader import download_to_file, upload_clip

router = APIRouter(tags=["editor"])
settings = get_settings()

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

# Keys accepted by the re-render endpoint — caption styling only
_RENDER_KEYS = {
    "style", "color", "h_align", "v_align", "words_per_line", "highlightColor",
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


# ── Re-render captions onto the raw (uncaptioned) clip ────────
#
# The ffmpeg work (download + burn_captions + upload) is CPU-heavy and
# runs on the worker service when WORKER_SERVICE_URL is configured
# (see _burn_and_upload_from_url, called directly here in single-service
# mode and via /internal/editor/render in split mode).

async def _burn_and_upload_from_url(
    raw_url: str,
    captions: list[Caption],
    config: dict,
    job_id: str,
    clip_id: str,
) -> str:
    """Download raw clip, burn captions per `config`, upload, return the new video_url."""
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"render_{clip_id[:8]}_"))
    try:
        raw_path = tmp_dir / "raw.mp4"
        out_path = tmp_dir / "captioned.mp4"

        await download_to_file(raw_url, raw_path)

        await burn_captions(
            raw_path, captions, out_path,
            style=config.get("style", "minimal"),
            color=config.get("color", "white_black"),
            h_align=config.get("h_align", "center"),
            v_align=config.get("v_align", "bottom"),
            words_per_line=config.get("words_per_line", 3),
        )

        clip_url = await upload_clip(out_path, job_id, clip_id)
        # Cache-bust — same GCS object, new query string
        return f"{clip_url}?t={int(time.time())}"
    finally:
        for f in tmp_dir.glob("*"):
            f.unlink(missing_ok=True)
        tmp_dir.rmdir()


@router.post("/editor/render/{job_id}/{clip_id}")
async def render_clip(
    job_id:  str,
    clip_id: str,
    config:  dict = Body(...),
    current_user: CurrentUser = ...,
):
    """
    Re-burn captions onto the already-reframed raw clip using the given
    caption config — skips the expensive reframe step entirely.
    """
    user = await db.get_user(current_user.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    _require_plan(user)

    bad = set(config) - _RENDER_KEYS
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid config keys: {bad}")

    rows = await db._fetch(
        "SELECT raw_video_url, captions_data, user_id FROM clips WHERE clip_id=$1",
        clip_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = rows[0]
    if str(clip["user_id"]) != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    raw_url = clip["raw_video_url"]
    if not raw_url:
        raise HTTPException(
            status_code=400,
            detail="This clip was generated before re-rendering was supported.",
        )

    captions_data = clip["captions_data"] or []
    if isinstance(captions_data, str):
        captions_data = json.loads(captions_data)
    captions = [Caption(start=c["start"], end=c["end"], text=c["text"]) for c in captions_data]

    if settings.WORKER_SERVICE_URL:
        # Heavy ffmpeg work runs on the worker service.
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{settings.WORKER_SERVICE_URL}/internal/editor/render",
                json={
                    "job_id": job_id,
                    "clip_id": clip_id,
                    "raw_url": raw_url,
                    "captions": captions_data,
                    "config": config,
                },
                headers={"X-Internal-Secret": settings.INTERNAL_TASK_SECRET},
            )
            resp.raise_for_status()
            clip_url = resp.json()["video_url"]
    else:
        clip_url = await _burn_and_upload_from_url(raw_url, captions, config, job_id, clip_id)

    await db._execute(
        "UPDATE clips SET video_url=$1 WHERE clip_id=$2",
        clip_url, clip_id,
    )
    await db._execute(
        "UPDATE clips SET editor_config = editor_config || $1::jsonb WHERE clip_id=$2",
        json.dumps(config), clip_id,
    )

    return {"video_url": clip_url}


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
