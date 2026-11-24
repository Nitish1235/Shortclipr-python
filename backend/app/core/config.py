from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


FREE_PLAN_MONTHLY_SECONDS = 10


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=True)

    APP_ENV: str = "development"
    SERVICE_ROLE: Literal["api", "api-worker", "ffmpeg-worker"] = "api"
    PORT: int = 8080
    LOG_LEVEL: str = "INFO"
    FRONTEND_URL: str = "http://127.0.0.1:4173"

    SUPABASE_DB_URL: str = ""
    DB_POOL_MIN_SIZE: int = 1
    DB_POOL_MAX_SIZE: int = 4

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET: str = "development-only-change-me"
    JWT_EXPIRY_DAYS: int = 7

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_STORY_MODEL: str = "deepseek-flash"
    DEEPSEEK_ANIMATION_MODEL: str = "deepseek-flash"
    DEEPSEEK_VISUAL_QA_MODEL: str = "deepseek-flash"
    DEEPSEEK_ENABLE_VISUAL_QA: bool = True
    DEEPSEEK_ENABLE_SHOT_REPAIR: bool = False
    DEEPSEEK_REASONING_EFFORT: str = "medium"  # legacy fallback; stage policies below take precedence
    DEEPSEEK_PLANNING_REASONING_EFFORT: str = "low"
    DEEPSEEK_CODING_REASONING_EFFORT: str = "max"
    DEEPSEEK_PLAN_MAX_OUTPUT_TOKENS: int = 32768
    DEEPSEEK_MAX_OUTPUT_TOKENS: int = 65536
    DEEPSEEK_MAX_PARALLEL_SHOTS: int = 3
    DEEPSEEK_ENABLE_SHOT_REVIEW: bool = True
    OPENAI_LUNA_MODEL: str = "gpt-6-luna"
    OPENAI_TERRA_MODEL: str = "gpt-6.1-terra"
    OPENAI_REASONING_EFFORT_LUNA: str = "low"
    OPENAI_REASONING_EFFORT_TERRA: str = "medium"

    UNREALSPEECH_API_KEY: str = ""
    UNREALSPEECH_API_BASE: str = "https://api.v8.unrealspeech.com"
    UNREALSPEECH_VOICE_CATALOG_URL: str = ""

    GCS_BUCKET_NAME: str = ""
    GCS_PUBLIC_BASE_URL: str = "https://storage.googleapis.com"

    DODO_PAYMENTS_API_KEY: str = ""
    DODO_PAYMENTS_WEBHOOK_SECRET: str = ""
    DODO_API_BASE: str = "https://live.dodopayments.com"
    DODO_ALLOW_UNSIGNED_WEBHOOKS: bool = False
    DODO_PRODUCT_STARTER: str = ""
    DODO_PRODUCT_CREATOR: str = ""
    DODO_PRODUCT_STUDIO: str = ""
    DODO_STARTER_MONTHLY_RENDER_SECONDS: int = 600
    DODO_CREATOR_MONTHLY_RENDER_SECONDS: int = 1800
    DODO_STUDIO_MONTHLY_RENDER_SECONDS: int = 4200

    TIKTOK_PIXEL_ID: str = ""
    TIKTOK_ACCESS_TOKEN: str = ""
    TIKTOK_TEST_EVENT_CODE: str = ""
    META_PIXEL_ID: str = ""
    META_CONVERSIONS_API_TOKEN: str = ""
    META_TEST_EVENT_CODE: str = ""

    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = ""
    MAX_LANDING_MEDIA_BYTES: int = 52_428_800

    INTERNAL_TASK_SECRET: str = ""
    API_WORKER_URLS: str = ""
    API_WORKER_REGIONS: str = ""
    FFMPEG_WORKER_URLS: str = ""
    FFMPEG_WORKER_REGIONS: str = ""
    API_REGION_SOFT_CAP: int = 12
    FFMPEG_REGION_SOFT_CAP: int = 4
    WORKER_REGION_COOLDOWN_SECONDS: int = 60
    RECONCILE_STUCK_MINUTES: int = 20

    DEFAULT_MONTHLY_CREDITS: int = 15
    MAX_PROJECT_DURATION_SECONDS: int = 60
    ALLOWED_ORIGINS: list[str] = Field(default_factory=list)

    @property
    def cors_origins(self) -> list[str]:
        values = [self.FRONTEND_URL.rstrip("/")]
        values.extend(origin.rstrip("/") for origin in self.ALLOWED_ORIGINS)
        return sorted(set(values))

    @property
    def production_errors(self) -> list[str]:
        """Names of required production settings that are absent or unsafe.

        Values are never included here so a failed Cloud Run revision cannot
        expose secrets through logs or a readiness response.
        """
        required_by_role = {
            "api": {
                "SUPABASE_DB_URL": self.SUPABASE_DB_URL,
                "GOOGLE_CLIENT_ID": self.GOOGLE_CLIENT_ID,
                "JWT_SECRET": self.JWT_SECRET,
                "UNREALSPEECH_API_KEY": self.UNREALSPEECH_API_KEY,
                "GCS_BUCKET_NAME": self.GCS_BUCKET_NAME,
                "DODO_PAYMENTS_API_KEY": self.DODO_PAYMENTS_API_KEY,
                "DODO_PAYMENTS_WEBHOOK_SECRET": self.DODO_PAYMENTS_WEBHOOK_SECRET,
                "DODO_PRODUCT_STARTER": self.DODO_PRODUCT_STARTER,
                "DODO_PRODUCT_CREATOR": self.DODO_PRODUCT_CREATOR,
                "DODO_PRODUCT_STUDIO": self.DODO_PRODUCT_STUDIO,
            },
            "api-worker": {
                "SUPABASE_DB_URL": self.SUPABASE_DB_URL,
                "DEEPSEEK_API_KEY": self.DEEPSEEK_API_KEY,
                "UNREALSPEECH_API_KEY": self.UNREALSPEECH_API_KEY,
                "GCS_BUCKET_NAME": self.GCS_BUCKET_NAME,
                "INTERNAL_TASK_SECRET": self.INTERNAL_TASK_SECRET,
            },
            "ffmpeg-worker": {
                "SUPABASE_DB_URL": self.SUPABASE_DB_URL,
                "GCS_BUCKET_NAME": self.GCS_BUCKET_NAME,
                "RESEND_API_KEY": self.RESEND_API_KEY,
                "RESEND_FROM_EMAIL": self.RESEND_FROM_EMAIL,
                "INTERNAL_TASK_SECRET": self.INTERNAL_TASK_SECRET,
            },
        }
        missing = [name for name, value in required_by_role[self.SERVICE_ROLE].items() if not value]
        if not self.FRONTEND_URL.startswith("https://"):
            missing.append("FRONTEND_URL (must use https in production)")
        if self.SERVICE_ROLE == "api" and (self.JWT_SECRET in {"", "development-only-change-me"} or len(self.JWT_SECRET) < 32):
            missing.append("JWT_SECRET (use a non-default secret of at least 32 characters)")
        if self.SERVICE_ROLE != "api" and len(self.INTERNAL_TASK_SECRET) < 32:
            missing.append("INTERNAL_TASK_SECRET (use at least 32 characters)")
        if self.SERVICE_ROLE == "api" and self.DODO_ALLOW_UNSIGNED_WEBHOOKS:
            missing.append("DODO_ALLOW_UNSIGNED_WEBHOOKS (must be false in production)")
        if self.SERVICE_ROLE == "api" and "live" not in self.DODO_API_BASE.lower():
            missing.append("DODO_API_BASE (must target Dodo live mode in production)")
        if self.SERVICE_ROLE == "api":
            product_ids = [self.DODO_PRODUCT_STARTER, self.DODO_PRODUCT_CREATOR, self.DODO_PRODUCT_STUDIO]
            if all(product_ids) and len(set(product_ids)) != len(product_ids):
                missing.append("Dodo product IDs (Starter, Creator, and Studio must be distinct)")
            if self.GOOGLE_CLIENT_ID and not self.GOOGLE_CLIENT_ID.endswith(".apps.googleusercontent.com"):
                missing.append("GOOGLE_CLIENT_ID (must be a Google Web client ID)")
        if self.DB_POOL_MIN_SIZE < 1 or self.DB_POOL_MAX_SIZE < self.DB_POOL_MIN_SIZE:
            missing.append("DB pool sizing")
        if self.SERVICE_ROLE == "ffmpeg-worker" and self.DEEPSEEK_ENABLE_SHOT_REPAIR and not self.DEEPSEEK_API_KEY:
            missing.append("DEEPSEEK_API_KEY (required when shot repair is enabled)")
        if self.SERVICE_ROLE == "ffmpeg-worker" and self.DEEPSEEK_ENABLE_SHOT_REPAIR and not self.DEEPSEEK_ENABLE_VISUAL_QA:
            missing.append("DEEPSEEK_ENABLE_VISUAL_QA (must be true when shot repair is enabled)")
        if self.MAX_LANDING_MEDIA_BYTES < 1:
            missing.append("MAX_LANDING_MEDIA_BYTES")
        return missing


@lru_cache
def get_settings() -> Settings:
    return Settings()
