"""
admin_marketing.py — Admin-only marketing video timeline editor.

Endpoints:
  POST   /admin/marketing/assets        — upload an image/video/audio asset to the library
  GET    /admin/marketing/assets        — list the asset library
  DELETE /admin/marketing/assets/{name} — remove an asset
  POST   /admin/marketing/render        — submit a timeline, dispatch render job(s)
  GET    /admin/marketing/jobs/{job_id} — poll render progress
  POST   /admin/marketing/transcribe    — optional: Whisper-transcribe an uploaded
                                           audio asset to pre-fill the subtitle table

Heavy ffmpeg work is dispatched to a worker service the same way the Test
Lab does (app/api/admin.py admin_test_generate) — never runs on the
1 vCPU API instance when WORKER_SERVICE_URL is configured.
"""

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from app.api.admin import AdminUser
from app.core.config import get_settings
from app.core.worker_routing import has_multi_region_workers, pick_primary_worker
from app.pipeline.marketing_editor import VALID_TRANSITIONS, render_marketing_video
from app.pipeline.title_box import TITLE_BG_COLORS, TITLE_TEXT_COLORS
from app.pipeline.uploader import _get_gcs_client, _upload_to_gcs, download_to_file

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(tags=["admin-marketing"])

_ASSET_PREFIX = "marketing_assets/"
_OUTPUT_PREFIX = "marketing_renders/"

# In-memory job tracking — admin-only, single-flight tool, same pattern as
# the Test Lab (app/pipeline/test_pipeline.py _test_jobs).
_marketing_jobs: dict[str, dict] = {}


# ══════════════════════════════════════════════════════════════
#  ASSET LIBRARY
# ══════════════════════════════════════════════════════════════

_ASSET_CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
}


@router.post("/admin/marketing/assets")
async def upload_marketing_asset(admin: AdminUser, file: UploadFile = File(...)):
    """Upload an image/video/audio file into the reusable marketing asset library."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ASSET_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    asset_id = uuid.uuid4().hex[:12]
    blob_name = f"{_ASSET_PREFIX}{asset_id}{ext}"

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        loop = asyncio.get_running_loop()
        url = await loop.run_in_executor(
            None, _upload_to_gcs, tmp_path, blob_name, _ASSET_CONTENT_TYPES[ext]
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    kind = "image" if ext in (".png", ".jpg", ".jpeg") else ("video" if ext in (".mp4", ".mov") else "audio")
    logger.info(f"Admin {admin.email} uploaded marketing asset {asset_id}{ext} ({kind})")
    return {"asset_id": asset_id, "url": url, "kind": kind, "filename": file.filename}


def _list_assets_sync() -> list[dict]:
    client = _get_gcs_client()
    bucket = client.bucket(settings.GCS_BUCKET_NAME)
    assets = []
    for blob in bucket.list_blobs(prefix=_ASSET_PREFIX):
        name = blob.name[len(_ASSET_PREFIX):]
        if not name:
            continue
        ext = Path(name).suffix.lower()
        kind = "image" if ext in (".png", ".jpg", ".jpeg") else ("video" if ext in (".mp4", ".mov") else "audio")
        assets.append({
            "asset_id": Path(name).stem,
            "url": f"{settings.GCS_PUBLIC_BASE_URL}/{settings.GCS_BUCKET_NAME}/{blob.name}",
            "kind": kind,
            "size": blob.size,
            "created_at": blob.time_created.isoformat() if blob.time_created else None,
        })
    assets.sort(key=lambda a: a["created_at"] or "", reverse=True)
    return assets


@router.get("/admin/marketing/assets")
async def list_marketing_assets(admin: AdminUser):
    loop = asyncio.get_running_loop()
    assets = await loop.run_in_executor(None, _list_assets_sync)
    return {"assets": assets}


@router.delete("/admin/marketing/assets/{asset_id}")
async def delete_marketing_asset(asset_id: str, admin: AdminUser):
    def _delete_sync():
        client = _get_gcs_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        deleted = 0
        for blob in bucket.list_blobs(prefix=f"{_ASSET_PREFIX}{asset_id}"):
            blob.delete()
            deleted += 1
        return deleted

    loop = asyncio.get_running_loop()
    deleted = await loop.run_in_executor(None, _delete_sync)
    if not deleted:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════
#  RENDER — timeline submission + worker dispatch
# ══════════════════════════════════════════════════════════════

def _validate_timeline(body: dict) -> None:
    segments = body.get("segments") or []
    if not segments:
        raise HTTPException(status_code=400, detail="At least one segment is required")
    for seg in segments:
        if seg.get("type") not in ("image", "video"):
            raise HTTPException(status_code=400, detail=f"Invalid segment type: {seg.get('type')}")
        if not seg.get("url"):
            raise HTTPException(status_code=400, detail="Every segment needs a `url`")
        trans = seg.get("transition", "fade")
        if trans not in VALID_TRANSITIONS:
            raise HTTPException(status_code=400, detail=f"Invalid transition: {trans}")
    for combo in body.get("subtitles") or []:
        for g in combo.get("groups") or []:
            if not g.get("color", "").startswith("#"):
                raise HTTPException(status_code=400, detail="Subtitle group colours must be hex (#RRGGBB)")
    title_color = body.get("title_color", "white")
    if title_color not in TITLE_TEXT_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid title_color: {title_color}")
    title_bg = body.get("title_bg", "none")
    if title_bg not in TITLE_BG_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid title_bg: {title_bg}")
    for aspect in body.get("aspects") or ["9:16"]:
        if aspect not in ("9:16", "1:1", "16:9"):
            raise HTTPException(status_code=400, detail=f"Invalid aspect: {aspect}")


@router.post("/admin/marketing/render")
async def render_marketing(admin: AdminUser, body: dict = Body(...)):
    """
    Submit a full timeline config. Renders one output per requested aspect
    ratio, and one full run per A/B `variants` override (each variant is a
    partial dict merged on top of the base config — e.g. a different
    title_color/font per variant to compare which performs better).

    Returns a job_id to poll via GET /admin/marketing/jobs/{job_id}.
    """
    _validate_timeline(body)
    job_id = f"mktg_{uuid.uuid4().hex[:12]}"

    if has_multi_region_workers():
        target = pick_primary_worker()
        async def _dispatch():
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{target.worker_url}/internal/marketing/render",
                        json={"job_id": job_id, "config": body},
                        headers={"X-Internal-Secret": settings.INTERNAL_TASK_SECRET},
                    )
                    resp.raise_for_status()
            except Exception:
                logger.exception(f"[{job_id}] Failed to dispatch marketing render to worker")
        asyncio.create_task(_dispatch(), name=f"mktg-dispatch-{job_id[:8]}")
    else:
        asyncio.create_task(run_marketing_render(job_id, body), name=f"mktg-{job_id[:8]}")

    logger.info(f"Admin {admin.email} submitted marketing render {job_id}")
    return {"job_id": job_id}


@router.get("/admin/marketing/jobs/{job_id}")
async def get_marketing_job(job_id: str, admin: AdminUser):
    if has_multi_region_workers():
        target = pick_primary_worker()
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{target.worker_url}/internal/marketing/jobs/{job_id}",
                headers={"X-Internal-Secret": settings.INTERNAL_TASK_SECRET},
            )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Job not found")
        resp.raise_for_status()
        return resp.json()

    job = _marketing_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ══════════════════════════════════════════════════════════════
#  ACTUAL RENDER EXECUTION — called in-process or via /internal dispatch
# ══════════════════════════════════════════════════════════════

async def run_marketing_render(job_id: str, config: dict) -> None:
    job = _marketing_jobs[job_id] = {
        "job_id": job_id, "status": "processing", "progress": 0,
        "current_step": "Starting...", "outputs": [], "error": None,
    }
    job_dir = Path(tempfile.mkdtemp(prefix=f"mktg_{job_id[-8:]}_"))
    try:
        job["current_step"] = "Downloading assets..."
        segments_cfg = config.get("segments", [])
        local_segments = []
        for i, seg in enumerate(segments_cfg):
            ext = Path(seg["url"].split("?")[0]).suffix or (".png" if seg["type"] == "image" else ".mp4")
            local_path = job_dir / f"seg_{i:02d}{ext}"
            await download_to_file(seg["url"], local_path)
            local_segments.append({
                "type": seg["type"], "path": str(local_path),
                "duration": seg.get("duration", 4.0),
                "transition": seg.get("transition", "fade"),
                "transition_duration": seg.get("transition_duration", 0.5),
            })

        local_audio = []
        for i, track in enumerate(config.get("audio_tracks", [])):
            ext = Path(track["url"].split("?")[0]).suffix or ".mp3"
            local_path = job_dir / f"aud_{i:02d}{ext}"
            await download_to_file(track["url"], local_path)
            local_audio.append({"path": str(local_path), "mode": track.get("mode", "sequence")})

        logo_path = None
        if config.get("logo_url"):
            logo_path = job_dir / "logo.png"
            await download_to_file(config["logo_url"], logo_path)
            logo_path = str(logo_path)

        subtitles = config.get("subtitles", [])
        aspects = config.get("aspects") or ["9:16"]
        variants = config.get("variants") or [{}]

        job["progress"] = 20
        outputs = []
        total_renders = len(aspects) * len(variants)
        done = 0

        for v_idx, variant in enumerate(variants):
            merged = {**config, **variant}
            for aspect in aspects:
                job["current_step"] = f"Rendering {aspect} (variant {v_idx + 1}/{len(variants)})..."
                out_name = f"{job_id}_v{v_idx}_{aspect.replace(':', 'x')}.mp4"
                out_path = job_dir / out_name

                await render_marketing_video(
                    segments=local_segments,
                    audio_tracks=local_audio,
                    subtitles=subtitles,
                    output_path=out_path,
                    aspect=aspect,
                    hook_title=merged.get("hook_title"),
                    title_color=merged.get("title_color", "white"),
                    title_bg=merged.get("title_bg", "none"),
                    title_bg_opacity=merged.get("title_bg_opacity", 0.55),
                    title_permanent=merged.get("title_permanent", False),
                    font=merged.get("font", "default"),
                    h_align=merged.get("h_align", "center"),
                    v_align=merged.get("v_align", "bottom"),
                    font_size=merged.get("font_size", 78),
                    logo_path=logo_path,
                    logo_position=merged.get("logo_position", "bottom_right"),
                    end_card=merged.get("end_card"),
                )

                loop = asyncio.get_running_loop()
                url = await loop.run_in_executor(
                    None, _upload_to_gcs, out_path, f"{_OUTPUT_PREFIX}{out_name}", "video/mp4"
                )
                outputs.append({"variant": v_idx, "aspect": aspect, "url": url})
                out_path.unlink(missing_ok=True)

                done += 1
                job["progress"] = 20 + int(75 * done / total_renders)
                job["outputs"] = outputs

        job["status"] = "completed"
        job["progress"] = 100
        job["current_step"] = "Done"
        logger.info(f"[{job_id}] Marketing render complete: {len(outputs)} output(s)")
    except Exception as exc:
        logger.exception(f"[{job_id}] Marketing render failed: {exc}")
        job["status"] = "failed"
        job["error"] = str(exc)
    finally:
        import shutil
        shutil.rmtree(job_dir, ignore_errors=True)


# ══════════════════════════════════════════════════════════════
#  OPTIONAL — transcribe an uploaded audio asset to pre-fill subtitles
# ══════════════════════════════════════════════════════════════

@router.post("/admin/marketing/transcribe")
async def transcribe_marketing_audio(admin: AdminUser, body: dict = Body(...)):
    """
    Whisper-transcribe an uploaded audio asset (by URL) into timestamped
    segments, as a starting point for the manual subtitle table — the
    admin still edits text/colours/timing afterward.
    """
    audio_url = body.get("audio_url")
    if not audio_url:
        raise HTTPException(status_code=400, detail="audio_url is required")

    tmp_path = Path(tempfile.mktemp(suffix=".mp3"))
    try:
        await download_to_file(audio_url, tmp_path)

        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        with open(tmp_path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1", file=f, response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        segments = [
            {"start": round(s.start, 2), "end": round(s.end, 2),
             "groups": [{"text": s.text.strip(), "color": "#FFFFFF"}]}
            for s in (transcript.segments or [])
        ]
        return {"subtitles": segments}
    except Exception as exc:
        logger.exception(f"Marketing audio transcription failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)
