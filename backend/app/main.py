"""
main.py — FastAPI application entrypoint.

Registers all routers, configures CORS, sets up structured logging.
Health check endpoint included for Cloud Run readiness probe.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api import auth, editor, admin, internal, jobs, payments, social, webhooks, youtube
from app.core.config import get_settings


settings = get_settings()

# Validate proxy environment early; abort on misconfiguration per user preference.
try:
    from app.core.proxy import validate_proxy_env
    validate_proxy_env()
except Exception as e:
    import logging, sys
    logging.getLogger(__name__).error(f"Proxy configuration validation failed: {e}. Aborting startup.")
    sys.exit(1)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# Silence noisy third-party HTTP loggers (httpx polls Upstash every second)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

app = FastAPI(
    title="ShortClipr API",
    version="1.0.0",
    description="AI-powered short clip generation from YouTube videos",
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
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
    return {"status": "ok", "version": "1.0.0"}


@app.get("/", tags=["system"])
async def root():
    return {"service": "ShortClipr API", "docs": "/docs"}
