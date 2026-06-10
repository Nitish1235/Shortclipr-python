"""
Central settings loaded from environment variables via pydantic-settings.
All modules import from here — never from os.environ directly.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────
    APP_ENV: str = "development"
    ADMIN_EMAILS: str = ""   # comma-separated admin email list, e.g. "you@gmail.com,other@gmail.com"
    PORT: int = 8080
    LOG_LEVEL: str = "INFO"
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Supabase ───────────────────────────────────────────────
    SUPABASE_DB_URL: str = ""  # postgresql://postgres:password@db.<project>.supabase.co:5432/postgres


    # ── Upstash Redis (stream URL cache only) ────────────────
    UPSTASH_REDIS_URL: str = ""
    UPSTASH_REDIS_TOKEN: str = ""
    REDIS_STREAM_CACHE_TTL: int = 14400  # 4 hours in seconds

    # ── OpenAI ────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # ── Google Cloud ──────────────────────────────────────────
    GCS_BUCKET_NAME: str = "shortclipr-clips"
    GCS_PUBLIC_BASE_URL: str = "https://storage.googleapis.com"
    # Note: No GOOGLE_APPLICATION_CREDENTIALS needed on Cloud Run
    # — the attached Service Account is used automatically.

    # ── Google OAuth + JWT ────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""   # Required for YouTube publishing swap
    JWT_SECRET: str = "changeme-use-secrets-token-hex-32"
    JWT_EXPIRY_DAYS: int = 7
    SOCIAL_REDIRECT_URI: str = "http://localhost:8080/social/auth/youtube/callback"

    # ── Dodo Payments ─────────────────────────────────────────
    DODO_PAYMENTS_API_KEY: str = ""
    DODO_PAYMENTS_WEBHOOK_SECRET: str = ""
    # Product IDs from your Dodo dashboard (Products → copy ID)
    # 5 tiers matching the pricing slider
    DODO_PRODUCT_STARTER_100: str = ""   # $10  — 100 shorts
    DODO_PRODUCT_STARTER_250: str = ""   # $25  — 250 shorts
    DODO_PRODUCT_PRO_500: str = ""       # $45  — 500 shorts
    DODO_PRODUCT_PRO_1000: str = ""      # $79  — 1000 shorts
    DODO_PRODUCT_PRO_2000: str = ""      # $145 — 2000 shorts

    # ── Worker / Pipeline ─────────────────────────────────────
    MAX_CONCURRENT_CLIPS: int = 10          # asyncio semaphore for FFmpeg
    MAX_CONCURRENT_JOBS_PER_USER: int = 2   # prevent spam-submit
    # Note: per-video duration limits are now plan-based — see app/core/plan_limits.py

    # ── InnerTube ──────────────────────────────────────────────
    INNERTUBE_API_KEY: str = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"
    INNERTUBE_API_BASE: str = "https://www.youtube.com/youtubei/v1"

    # ── Proxy (proxy-cheap residential) ───────────────────────────
    # Production proxy is proxy-cheap. Set in .env / Cloud Run secrets.
    # PROXY_PORTS: range "10001-10007" or CSV "10001,10002,10003".
    # Leave PROXY_HOST empty to run without proxy (local dev / CI).
    PROXY_HOST: str = ""              # e.g. gate.proxy-cheap.com
    PROXY_USER: str = ""              # proxy username / customer ID
    PROXY_PASS: str = ""              # proxy password
    PROXY_PORT: int = 8080              # single port for residential proxy (e.g. 31112)
    PROXY_PORTS: str = "10001-10007"  # port pool for random rotation (ignored if PROXY_PORT is set)


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — import and call this everywhere."""
    return Settings()

# Validator to ensure PROXY_PORT is positive integer (already typed as int)
# Pydantic will enforce type, but we provide a custom check for clarity.
# No additional code needed here as validation occurs in validate_proxy_env.
