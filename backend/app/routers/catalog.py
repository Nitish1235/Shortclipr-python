import asyncio

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from ..core.config import Settings, get_settings
from ..db import get_pool
from ..dependencies import CurrentUser, admin_user
from ..models.schemas import VoiceLibraryGenerationResponse, VoiceResponse
from ..services.storage import ObjectStorage
from ..services.voices import UnrealSpeech, VoiceCatalogue


router = APIRouter(prefix="/v1/catalog", tags=["catalog"])
admin_router = APIRouter(prefix="/v1/admin/voices", tags=["admin-voices"])


@router.get("/voices", response_model=list[VoiceResponse])
async def voices(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT voice_id AS id,name,language,description,preview_url FROM voice_catalog WHERE enabled=true ORDER BY language,name")
    if rows:
        return [dict(row) for row in rows]
    catalogue: VoiceCatalogue = request.app.state.voices
    return await catalogue.list()


@admin_router.get("", response_model=list[VoiceResponse])
async def admin_voices(request: Request, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool)):
    rows = await pool.fetch("SELECT voice_id AS id,name,language,description,preview_url FROM voice_catalog ORDER BY language,name")
    if rows:
        return [dict(row) for row in rows]
    catalogue: VoiceCatalogue = request.app.state.voices
    return await catalogue.list()


@admin_router.post("/generate", response_model=VoiceLibraryGenerationResponse)
async def generate_voice_library(
    request: Request, _: CurrentUser = Depends(admin_user), pool: asyncpg.Pool = Depends(get_pool), settings: Settings = Depends(get_settings),
):
    if not settings.UNREALSPEECH_API_KEY:
        raise HTTPException(status_code=409, detail="UNREALSPEECH_API_KEY must be configured before generating previews")
    if not settings.GCS_BUCKET_NAME:
        raise HTTPException(status_code=409, detail="GCS_BUCKET_NAME must be configured before generating previews")
    catalogue: VoiceCatalogue = request.app.state.voices
    voices = await catalogue.list()
    speech = UnrealSpeech(settings)
    storage = ObjectStorage(settings)
    guard = asyncio.Semaphore(3)

    async def generate(voice: dict) -> tuple[str, str | None]:
        async with guard:
            try:
                audio, _ = await speech.synthesize("Welcome to ShortClipr. This is my voice preview for your next story.", voice["id"])
                object_name, url = await storage.upload_public(audio, "audio/mpeg", "voice-previews", f"{voice['id']}.mp3")
                await pool.execute("""
                    INSERT INTO voice_catalog(voice_id,name,language,description,preview_object,preview_url,enabled,generated_at)
                    VALUES($1,$2,$3,$4,$5,$6,true,now())
                    ON CONFLICT (voice_id) DO UPDATE SET name=EXCLUDED.name,language=EXCLUDED.language,description=EXCLUDED.description,
                    preview_object=EXCLUDED.preview_object,preview_url=EXCLUDED.preview_url,enabled=true,generated_at=now()
                """, voice["id"], voice["name"], voice["language"], voice.get("description"), object_name, url)
                return voice["id"], None
            except Exception as error:
                return voice["id"], str(error)[:160]

    results = await asyncio.gather(*(generate(voice) for voice in voices))
    failures = [f"{voice_id}: {error}" for voice_id, error in results if error]
    return {"generated": len(results) - len(failures), "failed": len(failures), "total": len(results), "failures": failures}
