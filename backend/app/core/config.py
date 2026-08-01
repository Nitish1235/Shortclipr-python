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
    # The clip-detection model is pinned in app/pipeline/ai_clipper.py
    # (CLIP_MODEL constant). No env-var override — model selection is a
    # code change since it affects prompt tuning + cost accounting.
    OPENAI_API_KEY: str = ""

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

    # ── TikTok OAuth (Content Posting API v2) ─────────────────
    TIKTOK_CLIENT_KEY:    str = ""   # "Client Key" from TikTok dev portal
    TIKTOK_CLIENT_SECRET: str = ""   # "Client Secret" from TikTok dev portal
    # Must be registered in dev portal under Login Kit → Redirect URIs
    # Dev:  http://localhost:8080/social/auth/tiktok/callback
    # Prod: https://shortclipr.com/social/auth/tiktok/callback
    TIKTOK_REDIRECT_URI:  str = "http://localhost:8080/social/auth/tiktok/callback"

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
    MAX_CONCURRENT_CLIPS: int = 10          # asyncio semaphore for cheap -c copy extraction
    MAX_CONCURRENT_ENCODES: int = 2         # asyncio semaphore for libx264 reframe+caption encodes
    SOURCE_DOWNLOAD_CHUNKS: int = 8         # parallel ranged-download chunk count
    MAX_CONCURRENT_JOBS_PER_USER: int = 2   # prevent spam-submit
    # Note: per-video duration limits are now plan-based — see app/core/plan_limits.py

    # ── Worker dispatch (optional second Cloud Run services) ───
    # Two operating modes:
    #
    # 1) Single-service (both worker-pool vars below empty) — pipeline runs
    #    in-process via asyncio.create_task in the API host, unified
    #    (API stage + FFmpeg stage back-to-back). Original behavior.
    #
    # 2) Split-worker (API + FFMPEG pool vars set) — POST /jobs inserts
    #    status='created', pipeline_stage='api' and fires pg_notify('new_job').
    #    The watcher dispatches to the API pool. When the API stage sets
    #    status='api_done', a Postgres trigger fires pg_notify('api_done')
    #    and the watcher dispatches to the FFMPEG pool.
    #
    # Legacy (backwards compat): if only WORKER_SERVICE_URLS is set (the old
    # unified-worker pool) and the split pools are empty, the watcher treats
    # it as a single pool running the unified /internal/pipeline/run endpoint.
    WORKER_SERVICE_URLS:    str = ""
    WORKER_SERVICE_REGIONS: str = ""

    # API worker pool (lightweight: metadata / transcript / GPT — I/O bound)
    # Comma-separated, one URL per region, same order/count as *_REGIONS.
    #   e.g. "https://shortclipr-api-worker-us-c1-xxx.run.app,https://shortclipr-api-worker-eu-w1-xxx.run.app"
    API_WORKER_URLS:    str = ""
    API_WORKER_REGIONS: str = ""

    # FFmpeg worker pool (heavy: DASH download + reframe + caption encode)
    FFMPEG_WORKER_URLS:    str = ""
    FFMPEG_WORKER_REGIONS: str = ""

    INTERNAL_TASK_SECRET: str = ""          # shared secret for /internal/* routes

    # ── Queue / watcher ────────────────────────────────────────
    # Per-region soft cap: max in-flight jobs the watcher will send to a
    # region before queueing further ones (jobs stay status='created'/'api_done'
    # in Postgres until a slot opens). Sized to match each pool's per-instance
    # capacity: an API instance handles ~12 concurrent jobs (I/O-bound), an
    # FFmpeg instance handles ~2 (CPU-bound at ~7-8 min/job).
    API_REGION_SOFT_CAP:    int = 12
    FFMPEG_REGION_SOFT_CAP: int = 2

    # Legacy soft cap (unified worker) — used only when neither API_WORKER_URLS
    # nor FFMPEG_WORKER_URLS is set and the watcher runs against the old
    # WORKER_SERVICE_URLS pool.
    WATCHER_REGION_SOFT_CAP: int = 4

    RECONCILE_STUCK_JOB_MINUTES: int = 10  # applies to API-stage timeouts; FFmpeg stage uses 3× this

    # ── InnerTube ──────────────────────────────────────────────
    INNERTUBE_API_KEY: str = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"
    INNERTUBE_API_BASE: str = "https://www.youtube.com/youtubei/v1"

    # ── DataImpulse (rotating residential) — transcript + stream URL ─
    # Rotating residential: each request gets a fresh IP automatically.
    # Used ONLY for transcript fetching and stream URL resolution.
    # Leave DATAIMPULSE_USER empty to skip (falls back to no residential proxy).
    DATAIMPULSE_HOST: str = "gw.dataimpulse.com"
    DATAIMPULSE_PORT: int = 823
    DATAIMPULSE_USER: str = ""   # login from DataImpulse dashboard
    DATAIMPULSE_PASS: str = ""   # password from DataImpulse dashboard

    # ── Decodo ISP dedicated — DASH segment downloads only ────────
    # Fixed IP per port: port = location. Used for DASH downloads so the
    # CDN byte-range requests share a stable IP within a job.
    # Avoid port 10002 (LonConnect IP flagged by YouTube CDN).
    DECODO_HOST: str = "isp.decodo.com"
    DECODO_USER: str = "sp87mxq9dm"
    DECODO_PASS: str = ""
    DECODO_PORTS: str = "10001,10003,10004,10005,10006,10007,10008,10009,10010"

    # ── Legacy proxy-cheap (kept for fallback / admin test lab) ───
    PROXY_HOST: str = ""
    PROXY_USER: str = ""
    PROXY_PASS: str = ""
    PROXY_PORT: int = 8080
    PROXY_PORTS: str = ""
    DECODO_PORT_COUNTRIES: str = ""  # unused — ISP ports don't need geo-suffix


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — import and call this everywhere."""
    return Settings()

# Validator to ensure PROXY_PORT is positive integer (already typed as int)
# Pydantic will enforce type, but we provide a custom check for clarity.
# No additional code needed here as validation occurs in validate_proxy_env.
