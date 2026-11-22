import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .core.config import get_settings
from .core.log import configure_logging, get_logger
from .db import create_pool
from .routers import admin_workers, auth, billing, catalog, internal, projects, showcase
from .services.deepseek_planner import DeepSeekStoryPlanner
from .services.drawn_by_code_renderer import DrawnByCodeRenderer
from .services.deepseek_animation import DeepSeekAnimationCompiler
from .services.storage import ObjectStorage
from .services.visual_qa import VisualQualityReviewer
from .services.email import ProjectReadyEmailer
from .services.voices import UnrealSpeech, VoiceCatalogue


settings = get_settings()
configure_logging(settings.LOG_LEVEL)
logger = get_logger("shortclipr.api")


class _RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status code, and wall time."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        t0 = time.monotonic()
        response: Response = await call_next(request)
        duration_ms = round((time.monotonic() - t0) * 1000)
        # Skip noisy health probes to keep logs clean.
        if request.url.path not in {"/health", "/ready"}:
            logger.info(
                "http.request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                },
            )
        return response


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
        app.state.planner=DeepSeekStoryPlanner(settings)
        app.state.scene_compiler=DeepSeekAnimationCompiler(settings)
        app.state.speech=UnrealSpeech(settings)
    else:
        app.state.emailer=ProjectReadyEmailer(settings, app.state.storage)
        app.state.renderer=DrawnByCodeRenderer()
        app.state.visual_reviewer=VisualQualityReviewer(settings)
        app.state.shot_repairer=(
            DeepSeekAnimationCompiler(settings)
            if settings.DEEPSEEK_ENABLE_SHOT_REPAIR else None
        )
        if settings.APP_ENV.lower() == "production":
            await app.state.renderer.preflight()
    yield
    if app.state.db:
        await app.state.db.close()


app = FastAPI(title="ShortClipr API", version="0.1.0", lifespan=lifespan, docs_url="/docs" if settings.APP_ENV != "production" else None)
app.add_middleware(_RequestLogMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
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
    """Readiness requires a live database connection AND that the schema is applied.

    Cloud Run uses this probe before routing traffic.  Failing here on a
    wrong-database URL prevents the worker from accepting jobs it cannot serve.
    """
    if not app.state.db:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database pool is not initialised")
    try:
        # Verify schema exists: SELECT 1 passes even on an empty database, but
        # querying pg_class is cheap and fails fast when migrations haven't run.
        table_exists = await app.state.db.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pg_class WHERE relname='projects' AND relkind='r')"
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database query failed") from None
    if not table_exists:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database schema is missing — run migrations or check SUPABASE_DB_URL",
        )
    return {"status": "ready", "service": f"shortclipr-{settings.SERVICE_ROLE}"}
