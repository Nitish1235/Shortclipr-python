"""
main.py — FastAPI application entrypoint.

Registers all routers, configures CORS, sets up structured logging.
Health check endpoint included for Cloud Run readiness probe.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api import auth, editor, admin, internal, jobs, payments, social, webhooks, youtube
from app.core.config import get_settings


settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

_logger = logging.getLogger(__name__)

# Validate proxy config at startup — log warning only, never abort.
try:
    from app.core.proxy import validate_proxy_env
    validate_proxy_env()
except Exception as e:
    _logger.warning(f"Proxy config issue (pipeline will run without proxy): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: warm up DB pool ──────────────────────────────────────────
    try:
        from app.db.supabase import get_pool
        await get_pool()
        _logger.info("DB pool warmed up at startup")
    except Exception as e:
        _logger.error(f"STARTUP: DB connection failed — {e}")

    # ── Startup: verify OpenAI reachability ───────────────────────────────
    if settings.OPENAI_API_KEY:
        try:
            import httpx
            async with httpx.AsyncClient(proxies=None, timeout=8) as c:
                r = await c.get("https://api.openai.com/v1/models",
                                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"})
            if r.status_code in (200, 401):  # 401 = key issue but network OK
                _logger.info(f"OpenAI reachable (status={r.status_code})")
            else:
                _logger.warning(f"STARTUP: OpenAI returned {r.status_code}")
        except Exception as e:
            _logger.error(
                f"STARTUP: Cannot reach api.openai.com — {e}. "
                f"If HTTPS_PROXY is set in Cloud Run env vars it may be routing "
                f"OpenAI traffic through a restricted proxy. Unset it or scope it "
                f"to YouTube domains only."
            )
    else:
        _logger.error("STARTUP: OPENAI_API_KEY is not set — AI clipper will fail")

    yield
    # ── Shutdown: close pool cleanly ───────────────────────────────────────
    try:
        from app.db import supabase as _db
        if _db._pool is not None:
            await _db._pool.close()
            _logger.info("DB pool closed")
    except Exception:
        pass


app = FastAPI(
    title="ShortClipr API",
    version="1.0.0",
    description="AI-powered short clip generation from YouTube videos",
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)



# ── Proxy Headers (for Cloud Run HTTPS) ────────────────────────
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# ── CORS ───────────────────────────────────────────────────────
allowed_origins = [
    "http://localhost:3000",      # Next.js landing (dev)
    "http://localhost:5173",      # Vite dashboard (dev)
    "https://shortclipr.com",
    "https://www.shortclipr.com",
    "https://app.shortclipr.com",
]

# Support dynamic frontend URL from settings if provided
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    allowed_origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(payments.router)
app.include_router(youtube.router)
app.include_router(webhooks.router)
app.include_router(social.router)
# Include the new editor router
app.include_router(editor.router)
app.include_router(admin.router)
app.include_router(internal.router)

# Lab/testing endpoints — development only, never exposed in production
if settings.APP_ENV == "development":
    from app.api import testing
    app.include_router(testing.router)

# ── Health check (Cloud Run readiness probe) ───────────────────
@app.get("/health", tags=["system"])
async def health():
    from fastapi.responses import JSONResponse
    try:
        from app.db.supabase import get_pool
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return {"status": "ok", "db": "connected", "version": "1.0.0"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "db": "unreachable", "error": str(e)[:200]},
        )


@app.get("/", tags=["system"])
async def root():
    return {"service": "ShortClipr API", "docs": "/docs"}
