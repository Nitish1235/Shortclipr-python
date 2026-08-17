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
    FRONTEND_URL: str = "https://shortclipr.com"

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
    # Must be set explicitly — no default so a misconfigured deploy fails
    # loudly rather than silently writing to a production bucket.
    GCS_BUCKET_NAME: str = ""
    GCS_PUBLIC_BASE_URL: str = "https://storage.googleapis.com"
    # Note: No GOOGLE_APPLICATION_CREDENTIALS needed on Cloud Run
    # — the attached Service Account is used automatically.

    # ── Brainrot Clips Maker — GCS bucket ─────────────────────
    # Gameplay background clips + character assets live in their own
    # bucket (separate from GCS_BUCKET_NAME) so they can have their
    # own lifecycle/retention rules — this content is shared library
    # material, not per-user output.  Must be set explicitly (see above).
    BRAINROT_GCS_BUCKET_NAME: str = ""

    # ── UnrealSpeech (TTS) ─────────────────────────────────────
    UNREALSPEECH_API_KEY: str = ""

    # ── Lemonfox (TTS) ─────────────────────────────────────────
    LEMONFOX_API_KEY: str = ""

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

    # ── Resend (email broadcast) ─────────────────────────────
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "ShortClipr <updates@shortclipr.com>"

    # ── Dodo Payments ─────────────────────────────────────────
    DODO_PAYMENTS_API_KEY: str = ""
    DODO_PAYMENTS_WEBHOOK_SECRET: str = ""
    # https://live.dodopayments.com (production) or
    # https://test.dodopayments.com (sandbox) — defaults to test so a
    # freshly-cloned deployment never talks to live payments infra by
    # accident; production deployments must set this explicitly.
    DODO_API_BASE: str = "https://test.dodopayments.com"
    # Fail-closed by default: unsigned Dodo webhooks are rejected unless this
    # is explicitly set true AND DODO_PAYMENTS_WEBHOOK_SECRET is empty. This
    # is intentionally NOT derived from APP_ENV — a deployment that forgets
    # to set APP_ENV=production must not silently accept unsigned webhooks.
    DODO_ALLOW_UNSIGNED_WEBHOOKS: bool = False
    # Product IDs from your Dodo dashboard (Products → copy ID)
    # ── Current pricing (3 tiers) ─────────────────────────────
    DODO_PRODUCT_STARTER_30: str = ""    # $19 — 30 shorts
    DODO_PRODUCT_GROWTH_100: str = ""    # $39 — 100 shorts
    DODO_PRODUCT_UNLIMITED: str = ""     # $99 — unlimited shorts
    # ── Legacy slider tiers (kept for existing subscribers) ───
    DODO_PRODUCT_STARTER_100: str = ""   # $10  — 100 shorts
    DODO_PRODUCT_STARTER_250: str = ""   # $25  — 250 shorts
    DODO_PRODUCT_PRO_500: str = ""       # $45  — 500 shorts
    DODO_PRODUCT_PRO_1000: str = ""      # $79  — 1000 shorts
    DODO_PRODUCT_PRO_2000: str = ""      # $145 — 2000 shorts

    # ── Worker / Pipeline ─────────────────────────────────────
    MAX_CONCURRENT_CLIPS: int = 10          # asyncio semaphore for cheap -c copy extraction
    # asyncio semaphore for libx264 reframe+caption encodes. Each concurrent
    # encode is now pinned to ~3 real threads (1 decode + 2 x264 encoders
    # for the raw+captioned outputs — see extractor.py's
    # _encode_reframed_and_captioned for the -threads/-filter_complex_threads
    # pins). At 4 vCPU that means MAX_CONCURRENT_ENCODES=4 clips in flight
    # can demand up to ~12 threads — some oversubscription remains for
    # 4+-clip jobs, but far less than before those pins existed (decode
    # previously defaulted to ~vCPU-count threads per process, unbounded).
    MAX_CONCURRENT_ENCODES: int = 4
    SOURCE_DOWNLOAD_CHUNKS: int = 8         # parallel ranged-download chunk count
    MAX_CONCURRENT_JOBS_PER_USER: int = 1   # one job at a time — pins the user's IP + prevents Proxy-Seller IP collisions
    # Note: per-video duration limits are now plan-based — see app/core/plan_limits.py

    # Brainrot jobs don't touch YouTube/proxies, so the IP-pinning constraint
    # above doesn't apply — cap is purely about not overloading the shared
    # ffmpeg-worker pool with one user's concurrent renders.
    MAX_CONCURRENT_BRAINROT_JOBS_PER_USER: int = 2

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
    # Per-worker soft cap: max in-flight jobs the watcher will send to a
    # given worker URL before queuing further ones. "Region" in the env var
    # name refers to the watcher's region-label grouping (each worker URL
    # gets a unique label), not a GCP region.
    # API workers are I/O-bound → 4 concurrent jobs per instance is safe.
    # FFmpeg workers are CPU-bound → 1 job per instance (Cloud Run scales
    # horizontally rather than piling encodes on one box).
    API_REGION_SOFT_CAP:    int = 4
    FFMPEG_REGION_SOFT_CAP: int = 1

    # Legacy soft cap (unified worker) — used only when neither API_WORKER_URLS
    # nor FFMPEG_WORKER_URLS is set and the watcher runs against the old
    # WORKER_SERVICE_URLS pool.
    WATCHER_REGION_SOFT_CAP: int = 4

    RECONCILE_STUCK_MINUTES: int = 10  # applies to API-stage timeouts; FFmpeg stage uses 3× this

    # ── InnerTube ──────────────────────────────────────────────
    INNERTUBE_API_KEY: str = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"
    INNERTUBE_API_BASE: str = "https://www.youtube.com/youtubei/v1"

    # ── Proxy-Seller ISP dedicated — DASH segment downloads only ─
    # 10 static ISP proxies, each a distinct IP. Used for DASH downloads so
    # CDN byte-range requests share a stable IP within a job (chosen via
    # MD5(session_id) % len(pool) for deterministic per-job routing).
    # Format: comma-separated "host:port" pairs, e.g.
    #   "1.2.3.4:10000,5.6.7.8:10000,..."
    PROXYSELLER_USER: str = ""
    PROXYSELLER_PASS: str = ""
    PROXYSELLER_PROXIES: str = ""   # comma-separated host:port pairs (10 ISP IPs)

    # ── Legacy proxy-cheap (kept for fallback / admin test lab) ───
    PROXY_HOST: str = ""
    PROXY_USER: str = ""
    PROXY_PASS: str = ""
    PROXY_PORT: int = 8080
    PROXY_PORTS: str = ""


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — import and call this everywhere."""
    return Settings()

# Validator to ensure PROXY_PORT is positive integer (already typed as int)
# Pydantic will enforce type, but we provide a custom check for clarity.
# No additional code needed here as validation occurs in validate_proxy_env.
