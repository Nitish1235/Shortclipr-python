from pathlib import Path
import re
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status

from ..core.config import Settings, get_settings
from ..db import get_pool
from ..dependencies import CurrentUser, admin_user
from ..models.schemas import AdminProjectResponse, AssignProjectToShowcaseRequest, LandingMediaResponse, LandingMediaRevisionResponse, ShowcaseResponse, ShowcaseUpdate
from ..services.storage import ObjectStorage


public_router = APIRouter(prefix="/v1", tags=["showcase"])
admin_router = APIRouter(prefix="/v1/admin/showcase", tags=["admin-showcase"])
LANDING_THUMBNAIL_SLOTS = frozenset(f"landing_thumbnail_{index}" for index in range(1, 7))
LANDING_COLLECTION_SLOTS = frozenset(f"collection_{category}_{index}" for category in ("learn", "story", "engage") for index in range(1, 4))
LANDING_IMAGE_SLOTS = LANDING_THUMBNAIL_SLOTS | LANDING_COLLECTION_SLOTS | {"landing_hero_machine"}
LANDING_MEDIA_SLOTS = frozenset({"landing_hero_background", "screening_feature", "screening_side"}) | LANDING_IMAGE_SLOTS


def is_public_media_slot(slot: str) -> bool:
    return slot in LANDING_MEDIA_SLOTS or (
        slot.startswith("asset_") and re.fullmatch(r"[a-z][a-z0-9_-]{1,95}", slot) is not None
    )


def landing_media_kind(slot: str, content_type: str) -> str:
    if not is_public_media_slot(slot):
        raise HTTPException(status_code=422, detail="Unknown public media placement")
    if content_type in {"image/jpeg", "image/png", "image/webp"}:
        return "image"
    if slot in LANDING_IMAGE_SLOTS or slot.startswith(("asset_poster_", "asset_background_", "asset_srcset_")):
        raise HTTPException(status_code=422, detail="This public placement accepts JPG, PNG or WebP images only")
    if content_type in {"video/mp4", "video/webm", "video/quicktime"}:
        return "video"
    raise HTTPException(status_code=422, detail="Use MP4, MOV, or WebM video, or JPG, PNG, or WebP image")


async def showcase_payload(row: asyncpg.Record, storage: ObjectStorage) -> dict:
    value = dict(row)
    value["video_url"] = row["video_url"] or ""
    if row["poster_object"]:
        value["poster_url"] = row["poster_url"] or ""
    return value


async def landing_media_payload(row: asyncpg.Record, storage: ObjectStorage) -> dict:
    value = dict(row)
    value["media_url"] = row["media_url"] or ""
    return value


@public_router.get("/showcase", response_model=list[ShowcaseResponse])
async def public_showcase(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM showcase_clips WHERE published=true ORDER BY featured DESC,sort_order,created_at DESC")
    return [await showcase_payload(row, request.app.state.storage) for row in rows]


@public_router.get("/landing-reel", response_model=list[ShowcaseResponse])
async def landing_reel(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM showcase_clips WHERE published=true AND landing_visible=true ORDER BY sort_order,created_at DESC")
    return [await showcase_payload(row, request.app.state.storage) for row in rows]


@public_router.get("/landing-media", response_model=list[LandingMediaResponse])
async def landing_media(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM landing_media_slots ORDER BY slot")
    return [await landing_media_payload(row, request.app.state.storage) for row in rows]


@admin_router.get("", response_model=list[ShowcaseResponse])
async def admin_showcase(request: Request, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM showcase_clips ORDER BY featured DESC,sort_order,created_at DESC")
    return [await showcase_payload(row, request.app.state.storage) for row in rows]


@admin_router.get("/landing-media", response_model=list[LandingMediaResponse])
async def admin_landing_media(request: Request, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM landing_media_slots ORDER BY slot")
    return [await landing_media_payload(row, request.app.state.storage) for row in rows]


@admin_router.post("/landing-media", response_model=LandingMediaResponse)
async def upload_landing_media(
    slot: str = Form(...),
    title: str = Form(..., max_length=100),
    caption: str = Form("", max_length=220),
    media: UploadFile = File(...),
    user: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool),
    settings: Settings = Depends(get_settings),
):
    content_type = (media.content_type or "").lower()
    media_kind = landing_media_kind(slot, content_type)
    data = await media.read(settings.MAX_LANDING_MEDIA_BYTES + 1)
    if not data:
        raise HTTPException(status_code=422, detail="The media file is empty")
    if len(data) > settings.MAX_LANDING_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Landing media exceeds the configured size limit")
    suffix = Path(media.filename or "").suffix.lower() or (".mp4" if media_kind == "video" else ".jpg")
    storage = ObjectStorage(settings)
    object_name, media_url = await storage.upload_public(data, content_type, f"landing-media/{slot}", suffix)
    old_object = None
    try:
        async with pool.acquire() as connection:
            async with connection.transaction():
                previous = await connection.fetchrow("SELECT * FROM landing_media_slots WHERE slot=$1 FOR UPDATE", slot)
                old_object = previous["media_object"] if previous else None
                if previous:
                    await connection.execute(
                        """
                        INSERT INTO landing_media_revisions(slot,title,caption,media_kind,media_object,media_url,created_by)
                        VALUES($1,$2,$3,$4,$5,$6,$7)
                        """,
                        previous["slot"], previous["title"], previous["caption"], previous["media_kind"],
                        previous["media_object"], previous["media_url"], previous["created_by"],
                    )
                row = await connection.fetchrow(
                    """
                    INSERT INTO landing_media_slots(slot,title,caption,media_kind,media_object,media_url,created_by)
                    VALUES($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT(slot) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,
                    media_kind=EXCLUDED.media_kind,media_object=EXCLUDED.media_object,media_url=EXCLUDED.media_url,
                    created_by=EXCLUDED.created_by,updated_at=now()
                    RETURNING *
                    """,
                    slot, title.strip() or "ShortClipr feature", caption.strip(), media_kind, object_name, media_url, user.id,
                )
    except Exception:
        await storage.delete(object_name)
        raise
    if old_object and old_object != object_name:
        try:
            await storage.delete(old_object)
        except Exception:
            # The replacement is already live. A stale object is safer than
            # deleting the newly committed landing placement during cleanup.
            pass
    return await landing_media_payload(row, storage)


@admin_router.delete("/landing-media/{slot}", status_code=204)
async def delete_landing_media(slot: str, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool), settings: Settings = Depends(get_settings)):
    if not is_public_media_slot(slot):
        raise HTTPException(status_code=404, detail="Public media placement not found")
    async with pool.acquire() as connection:
        async with connection.transaction():
            row = await connection.fetchrow("SELECT * FROM landing_media_slots WHERE slot=$1 FOR UPDATE", slot)
            if not row:
                raise HTTPException(status_code=404, detail="Landing placement is already empty")
            await connection.execute(
                """
                INSERT INTO landing_media_revisions(slot,title,caption,media_kind,media_object,media_url,created_by)
                VALUES($1,$2,$3,$4,$5,$6,$7)
                """,
                row["slot"], row["title"], row["caption"], row["media_kind"],
                row["media_object"], row["media_url"], row["created_by"],
            )
            await connection.execute("DELETE FROM landing_media_slots WHERE slot=$1", slot)
    # Keep the object: it is now recoverable from revision history.
    return Response(status_code=204)


@admin_router.get("/landing-media/{slot}/history", response_model=list[LandingMediaRevisionResponse])
async def landing_media_history(slot: str, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    if not is_public_media_slot(slot):
        raise HTTPException(status_code=404, detail="Public media placement not found")
    rows = await pool.fetch(
        """
        SELECT id,slot,title,caption,media_kind,media_url,created_at
        FROM landing_media_revisions WHERE slot=$1 ORDER BY created_at DESC LIMIT 30
        """,
        slot,
    )
    return [dict(row) for row in rows]


@admin_router.post("/landing-media/{slot}/restore/{revision_id}", response_model=LandingMediaResponse)
async def restore_landing_media_revision(
    slot: str, revision_id: UUID, request: Request,
    user: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool),
):
    if not is_public_media_slot(slot):
        raise HTTPException(status_code=404, detail="Public media placement not found")
    async with pool.acquire() as connection:
        async with connection.transaction():
            revision = await connection.fetchrow(
                "SELECT * FROM landing_media_revisions WHERE id=$1 AND slot=$2 FOR UPDATE",
                revision_id, slot,
            )
            if not revision:
                raise HTTPException(status_code=404, detail="Media revision not found")
            current = await connection.fetchrow("SELECT * FROM landing_media_slots WHERE slot=$1 FOR UPDATE", slot)
            if current:
                await connection.execute(
                    """
                    INSERT INTO landing_media_revisions(slot,title,caption,media_kind,media_object,media_url,created_by)
                    VALUES($1,$2,$3,$4,$5,$6,$7)
                    """,
                    current["slot"], current["title"], current["caption"], current["media_kind"],
                    current["media_object"], current["media_url"], current["created_by"],
                )
            row = await connection.fetchrow(
                """
                INSERT INTO landing_media_slots(slot,title,caption,media_kind,media_object,media_url,created_by)
                VALUES($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT(slot) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,
                media_kind=EXCLUDED.media_kind,media_object=EXCLUDED.media_object,media_url=EXCLUDED.media_url,
                created_by=EXCLUDED.created_by,updated_at=now()
                RETURNING *
                """,
                slot, revision["title"], revision["caption"], revision["media_kind"],
                revision["media_object"], revision["media_url"], user.id,
            )
            await connection.execute("DELETE FROM landing_media_revisions WHERE id=$1", revision_id)
    storage = request.app.state.storage
    return await landing_media_payload(row, storage)


@admin_router.get("/jobs", response_model=list[AdminProjectResponse])
async def admin_jobs(request: Request, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("""
        SELECT p.*,u.email AS owner_email,u.full_name AS owner_name
        FROM projects p JOIN users u ON u.id=p.user_id
        WHERE p.status='complete' AND p.output_object IS NOT NULL
        ORDER BY p.completed_at DESC NULLS LAST,p.created_at DESC LIMIT 250
    """)
    storage: ObjectStorage = request.app.state.storage
    result=[]
    for row in rows:
        value=dict(row)
        value["output_url"] = None
        value["poster_url"] = None
        result.append(value)
    return result


@admin_router.post("/from-project/{project_id}", response_model=ShowcaseResponse)
async def assign_project_to_showcase(
    project_id: UUID, payload: AssignProjectToShowcaseRequest, user: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool), settings: Settings = Depends(get_settings),
):
    # The generated output remains owned by the project; this creates only a curated public placement.
    storage = ObjectStorage(settings)
    async with pool.acquire() as connection:
        async with connection.transaction():
            project=await connection.fetchrow("SELECT * FROM projects WHERE id=$1 AND status='complete' AND output_object IS NOT NULL FOR UPDATE",project_id)
            if not project: raise HTTPException(status_code=404,detail="A completed project with a final output is required")
            existing=await connection.fetchrow("SELECT video_object,poster_object,video_url,poster_url FROM showcase_clips WHERE source_project_id=$1",project_id)
            if payload.featured:
                await connection.execute("UPDATE showcase_clips SET featured=false WHERE featured=true")
            if existing:
                video_object,poster_object,video_url,poster_url = existing["video_object"],existing["poster_object"],existing["video_url"],existing["poster_url"]
            else:
                video_object,video_url=await storage.copy_to_public(project["output_object"],"showcase/generated")
                poster_object=poster_url=None
                if project["poster_object"]:
                    poster_object,poster_url=await storage.copy_to_public(project["poster_object"],"showcase/generated-posters")
            row=await connection.fetchrow("""
                INSERT INTO showcase_clips(title,description,department,aspect_ratio,video_object,poster_object,video_url,poster_url,published,featured,landing_visible,sort_order,created_by,source_project_id)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE((SELECT max(sort_order)+1 FROM showcase_clips),1),$12,$13)
                ON CONFLICT (source_project_id) WHERE source_project_id IS NOT NULL DO UPDATE SET
                title=EXCLUDED.title,description=EXCLUDED.description,published=EXCLUDED.published,featured=EXCLUDED.featured,landing_visible=EXCLUDED.landing_visible,updated_at=now()
                RETURNING *
            """,payload.title or project["title"],payload.description,project["department"],project["aspect_ratio"],video_object,poster_object,video_url,poster_url,payload.published,payload.featured,payload.landing_visible,user.id,project_id)
    return dict(row)


@admin_router.post("", response_model=ShowcaseResponse, status_code=status.HTTP_201_CREATED)
async def upload_showcase(
    title: str = Form(..., max_length=80),
    description: str = Form("", max_length=220),
    department: str = Form(...),
    aspect_ratio: str = Form(..., alias="aspectRatio"),
    published: bool = Form(True),
    featured: bool = Form(False),
    landing_visible: bool = Form(False),
    video: UploadFile = File(...),
    poster: UploadFile | None = File(None),
    user: CurrentUser = Depends(admin_user),
    pool: asyncpg.Pool = Depends(get_pool),
    settings: Settings = Depends(get_settings),
):
    if department not in {"learn","story","engage"} or aspect_ratio not in {"9:16","1:1","16:9"}:
        raise HTTPException(status_code=422, detail="Invalid department or aspect ratio")
    if not (video.content_type or "").startswith("video/"):
        raise HTTPException(status_code=422, detail="A browser-compatible video is required")
    storage = ObjectStorage(settings)
    video_object, video_url = await storage.upload_public(await video.read(), video.content_type or "video/mp4", "showcase/videos", video.filename or "video.mp4")
    poster_object = poster_url = None
    if poster:
        poster_object, poster_url = await storage.upload_public(await poster.read(), poster.content_type or "image/jpeg", "showcase/posters", poster.filename or "poster.jpg")
    async with pool.acquire() as connection:
        async with connection.transaction():
            if featured:
                await connection.execute("UPDATE showcase_clips SET featured=false WHERE featured=true")
            row = await connection.fetchrow("""
                INSERT INTO showcase_clips(title,description,department,aspect_ratio,video_object,poster_object,video_url,poster_url,published,featured,landing_visible,sort_order,created_by)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE((SELECT max(sort_order)+1 FROM showcase_clips),1),$12) RETURNING *
            """, title,description,department,aspect_ratio,video_object,poster_object,video_url,poster_url,published,featured,landing_visible,user.id)
    return dict(row)


@admin_router.patch("/{clip_id}", response_model=ShowcaseResponse)
async def update_showcase(clip_id: UUID, payload: ShowcaseUpdate, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    values = payload.model_dump(exclude_unset=True)
    if not values:
        row = await pool.fetchrow("SELECT * FROM showcase_clips WHERE id=$1", clip_id)
        if not row: raise HTTPException(status_code=404, detail="Clip not found")
        return dict(row)
    async with pool.acquire() as connection:
        async with connection.transaction():
            if values.get("featured"):
                await connection.execute("UPDATE showcase_clips SET featured=false WHERE featured=true AND id<>$1", clip_id)
            assignments=[];params=[clip_id]
            for index,(key,value) in enumerate(values.items(),start=2):
                assignments.append(f"{key}=${index}");params.append(value)
            row=await connection.fetchrow(f"UPDATE showcase_clips SET {','.join(assignments)} WHERE id=$1 RETURNING *",*params)
    if not row: raise HTTPException(status_code=404, detail="Clip not found")
    return dict(row)


@admin_router.delete("/{clip_id}", status_code=204)
async def delete_showcase(clip_id: UUID, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool), settings: Settings = Depends(get_settings)):
    row=await pool.fetchrow("DELETE FROM showcase_clips WHERE id=$1 RETURNING video_object,poster_object",clip_id)
    if not row: raise HTTPException(status_code=404, detail="Clip not found")
    storage = ObjectStorage(settings)
    await storage.delete(row["video_object"]);await storage.delete(row["poster_object"])
    return Response(status_code=204)
