from app.core.config import Settings


def production_settings(**overrides):
    values = {
        "APP_ENV": "production",
        "FRONTEND_URL": "https://shortclipr.com",
        "SUPABASE_DB_URL": "postgresql://user:password@host:5432/database",
        "GOOGLE_CLIENT_ID": "client-id.apps.googleusercontent.com",
        "JWT_SECRET": "x" * 32,
        "OPENAI_API_KEY": "sk-test",
        "UNREALSPEECH_API_KEY": "unreal-test",
        "GCS_BUCKET_NAME": "shortclipr-private",
        "DODO_PAYMENTS_API_KEY": "dodo-test",
        "DODO_PAYMENTS_WEBHOOK_SECRET": "whsec-test",
        "DODO_API_BASE": "https://live.dodopayments.com",
        "DODO_PRODUCT_STARTER": "prod_starter",
        "DODO_PRODUCT_CREATOR": "prod_creator",
        "DODO_PRODUCT_STUDIO": "prod_studio",
        "RESEND_API_KEY": "re_test",
        "RESEND_FROM_EMAIL": "ShortClipr <films@shortclipr.com>",
        "INTERNAL_TASK_SECRET": "i" * 32,
    }
    values.update(overrides)
    return Settings(**values)


def test_complete_production_settings_pass_preflight():
    assert production_settings().production_errors == []


def test_api_preflight_rejects_development_jwt_and_unsigned_webhooks():
    errors = production_settings(
        JWT_SECRET="development-only-change-me",
        DODO_ALLOW_UNSIGNED_WEBHOOKS=True,
    ).production_errors
    assert "JWT_SECRET (use a non-default secret of at least 32 characters)" in errors
    assert "DODO_ALLOW_UNSIGNED_WEBHOOKS (must be false in production)" in errors


def test_preflight_rejects_duplicate_products_and_non_web_google_client():
    errors = production_settings(
        GOOGLE_CLIENT_ID="android-client-id",
        DODO_PRODUCT_STARTER="prod_same",
        DODO_PRODUCT_CREATOR="prod_same",
    ).production_errors
    assert "GOOGLE_CLIENT_ID (must be a Google Web client ID)" in errors
    assert "Dodo product IDs (Starter, Creator, and Studio must be distinct)" in errors


def test_planning_worker_requires_planning_secrets_not_payment_secrets():
    settings = Settings(
        APP_ENV="production", SERVICE_ROLE="api-worker", FRONTEND_URL="https://shortclipr.com",
        SUPABASE_DB_URL="postgresql://user:password@host:5432/database",
        OPENAI_API_KEY="sk-test", UNREALSPEECH_API_KEY="unreal-test",
        GCS_BUCKET_NAME="shortclipr-private", INTERNAL_TASK_SECRET="i" * 32,
    )
    assert settings.production_errors == []


def test_render_worker_requires_render_secrets_not_payment_or_model_secrets():
    settings = Settings(
        APP_ENV="production", SERVICE_ROLE="ffmpeg-worker", FRONTEND_URL="https://shortclipr.com",
        SUPABASE_DB_URL="postgresql://user:password@host:5432/database",
        GCS_BUCKET_NAME="shortclipr-private",
        RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="ShortClipr <films@shortclipr.com>",
        INTERNAL_TASK_SECRET="i" * 32,
    )
    assert settings.production_errors == []
