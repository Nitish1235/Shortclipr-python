import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .db import create_pool
from .routers import admin_workers, auth, billing, catalog, internal, projects, showcase
from .services.openai_planner import OpenAIPlanner
from .services.renderer import RevideoRenderer
from .services.scene_compiler import SceneCompiler
from .services.storage import ObjectStorage
from .services.email import ProjectReadyEmailer
from .services.voices import UnrealSpeech, VoiceCatalogue


settings=get_settings()
# Uvicorn's CLI accepts lower-case levels while Python logging expects names in
# upper-case. Accept either spelling from the shared Cloud Run environment.
logging.basicConfig(level=settings.LOG_LEVEL.upper(),format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.APP_ENV.lower() == "production":
        errors = settings.production_errors
        if errors:
            raise RuntimeError(f"Production configuration is incomplete: {', '.join(errors)}")
    app.state.db=await create_pool(settings)
    app.state.storage=ObjectStorage(settings)
    if settings.SERVICE_ROLE == "api":
        app.state.voices=VoiceCatalogue(settings)
    elif settings.SERVICE_ROLE == "api-worker":
        app.state.planner=OpenAIPlanner(settings)
        app.state.scene_compiler=SceneCompiler(settings)
        app.state.speech=UnrealSpeech(settings)
    else:
        app.state.emailer=ProjectReadyEmailer(settings, app.state.storage)
        app.state.renderer=RevideoRenderer()
    yield
    if app.state.db:
        await app.state.db.close()


app=FastAPI(title="ShortClipr API",version="0.1.0",lifespan=lifespan,docs_url="/docs" if settings.APP_ENV!="production" else None)
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins,allow_credentials=True,allow_methods=["*"] ,allow_headers=["*"])
if settings.SERVICE_ROLE == "api":
    app.include_router(auth.router)
    app.include_router(projects.router)
    app.include_router(catalog.router)
    app.include_router(catalog.admin_router)
    app.include_router(showcase.public_router)
    app.include_router(showcase.admin_router)
    app.include_router(billing.router)
    app.include_router(billing.checkout_router)
    app.include_router(admin_workers.router)
elif settings.SERVICE_ROLE == "api-worker":
    app.include_router(internal.api_router)
else:
    app.include_router(internal.ffmpeg_router)


@app.get("/health",tags=["health"])
async def health():
    return {"status":"ok","service":f"shortclipr-{settings.SERVICE_ROLE}","database":bool(app.state.db)}


@app.get("/ready", tags=["health"])
async def ready():
    """Readiness requires both an initialized pool and a live database query."""
    if not app.state.db:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not ready")
    try:
        await app.state.db.fetchval("SELECT 1")
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database is not ready") from None
    return {"status":"ready","service":f"shortclipr-{settings.SERVICE_ROLE}"}
