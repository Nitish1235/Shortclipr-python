"""
editor.py — Clip editor config save endpoint.

Access rules:
  free  → 403 (editor is a paid feature)
  paid  → can save any editor config key
"""

import json
import tempfile
import time
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Body, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, decode_access_token
from app.core.config import get_settings
from app.core.worker_routing import has_multi_region_workers, pick_worker
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
    # Permanent title card
    "hook_title", "title_permanent", "hook_title_enabled",
    "title_color", "title_bg", "title_bg_opacity",
    # Font
    "font",
}

# Keys accepted by the re-render endpoint — caption styling only
_RENDER_KEYS = {
    "style", "color", "h_align", "v_align", "words_per_line", "highlightColor",
    "hook_title", "title_permanent", "hook_title_enabled", "font",
    "title_color", "title_bg", "title_bg_opacity",
}


async def _probe_duration(clip_path: Path) -> float:
    """ffprobe a clip's duration in seconds — used to make a hook title
    span the entire clip when `title_permanent` is set."""
    import asyncio
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(clip_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    out, _ = await proc.communicate()
    try:
        return float(out.strip())
    except (ValueError, TypeError):
        return 0.0


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
        config,
        clip_id,
    )
    return {"status": "ok"}


# ── Re-render captions onto the raw (uncaptioned) clip ────────
#
# The ffmpeg work (download + burn_captions + upload) is CPU-heavy and
# runs on a worker service when WORKER_SERVICE_URLS is configured (see
# _burn_and_upload_from_url, called directly here in single-service mode
# and via /internal/editor/render — routed across regions, see
# app/core/worker_routing.py — in split mode).

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

        title_permanent = bool(config.get("title_permanent"))
        clip_duration = await _probe_duration(raw_path) if title_permanent else 0.0

        await burn_captions(
            raw_path, captions, out_path,
            style=config.get("style", "minimal"),
            color=config.get("color", "white_black"),
            h_align=config.get("h_align", "center"),
            v_align=config.get("v_align", "bottom"),
            words_per_line=config.get("words_per_line", 3),
            hook_title=config.get("hook_title"),
            title_permanent=title_permanent,
            clip_duration=clip_duration,
            font=config.get("font", "default"),
            title_color=config.get("title_color", "white"),
            title_bg=config.get("title_bg", "none"),
            title_bg_opacity=config.get("title_bg_opacity", 0.55),
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

    if has_multi_region_workers():
        # Heavy ffmpeg work runs on the worker service — spread across
        # regions same as pipeline dispatch (app/core/worker_routing.py).
        # Synchronous call (not the job queue): the caller is waiting on the
        # response for the new video_url, so a queue would just add
        # latency without fixing anything — failures already propagate
        # straight back to the user via raise_for_status(), no zombie risk.
        target = pick_worker()
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{target.worker_url}/internal/editor/render",
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
        config, clip_id,
    )

    return {"video_url": clip_url}


# ── Download clip ─────────────────────────────────────────────

@router.get("/clips/{clip_id}/download")
async def download_clip(
    clip_id: str,
    token: Optional[str] = Query(None),
):
    """
    Stream the clip through OUR OWN response with a real Content-Disposition
    header — forces an actual download instead of inline playback.

    PREVIOUSLY this 302-redirected to the GCS URL with a
    `response-content-disposition` query override appended. That override
    is part of GCS's SIGNED URL mechanism — it's only honoured when a
    signature covers it. On a plain public/unsigned object (this bucket
    grants public read via bucket-level IAM, not signed URLs), GCS just
    ignores the override entirely, so the browser still saw a bare
    video/mp4 response with no Content-Disposition and played it inline
    instead of downloading. Streaming it through our own endpoint sidesteps
    that — the header comes from US, on a direct (non-redirected) response,
    which every browser honours unconditionally.

    The object itself still has no Content-Disposition set at upload time —
    that's unchanged and still correct, since the SAME video_url is also
    used for inline playback elsewhere (e.g. the dashboard's <video>
    preview/modal); this endpoint is the only place that needs "force
    download", so the override belongs here, not on the stored object.

    Accepts ?token= query param — browsers can't send Authorization headers
    when opening a URL directly (e.g. anchor click / window.open).
    Free users → 403.  Paid users → streamed MP4 with attachment disposition.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_access_token(token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await db.get_user(payload.sub)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    rows = await db._fetch(
        "SELECT video_url, user_id, job_id FROM clips WHERE clip_id=$1",
        clip_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = rows[0]
    if str(clip["user_id"]) != payload.sub:
        raise HTTPException(status_code=403, detail="Access denied")

    # Free-plan users can still download here if they've submitted the
    # post-queue feedback survey (see feedback.py) and this clip is either
    # the one job_feedback's reward is scoped to (still unused) or the
    # SAME clip they already used it on (idempotent re-download). Any
    # other free-plan attempt falls through to the normal paid-plan gate.
    if user.get("plan", "free") == "free":
        feedback = await db.get_user_feedback(payload.sub)
        reward_available = (
            feedback is not None
            and str(feedback["job_id"]) == str(clip["job_id"])
            and (feedback["reward_clip_id"] is None or str(feedback["reward_clip_id"]) == clip_id)
        )
        if reward_available:
            if feedback["reward_clip_id"] is None:
                await db.consume_feedback_reward(str(feedback["feedback_id"]), clip_id)
        else:
            _require_plan(user)

    filename = f"ShortClipr_{clip_id.split('-')[0]}.mp4"

    stack = AsyncExitStack()
    client = await stack.enter_async_context(httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)))
    try:
        upstream = await stack.enter_async_context(client.stream("GET", clip["video_url"]))
    except httpx.HTTPError as exc:
        await stack.aclose()
        raise HTTPException(status_code=502, detail=f"Could not fetch clip file: {exc}")

    if upstream.status_code != 200:
        await stack.aclose()
        raise HTTPException(status_code=502, detail=f"Clip file fetch failed: HTTP {upstream.status_code}")

    async def _stream():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=262_144):
                yield chunk
        finally:
            await stack.aclose()

    response_headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    content_length = upstream.headers.get("content-length")
    if content_length:
        response_headers["Content-Length"] = content_length

    return StreamingResponse(_stream(), media_type="video/mp4", headers=response_headers)
