# ShortClipr platform handoff

This file is the source of truth for rebuilding product features without
renaming the deployed platform.

## Names to retain

- Brand: **ShortClipr**; retain the logo files in `public/`.
- Cloud Run services: `shortclipr-frontend`, `shortclipr-api`,
  `shortclipr-api-worker-{region}`, `shortclipr-ffmpeg-worker-{region}`, and
  `shortclipr-watcher`.
- Artifact Registry repository: `us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy`.
- Frontend image name: `shortclipr-frontend`; backend/worker image name:
  `shortclipr-worker`.
- Primary production domain: `shortclipr.com`.

## Service responsibilities

- **frontend**: Vite/React static build served by Nginx on port 8080.
- **api**: public HTTP API, custom Google OAuth/JWT authentication, Dodo
  checkout/webhooks, admin API, and app-specific endpoints.
- **api worker**: optional lightweight asynchronous stage.
- **FFmpeg worker**: optional compute-heavy asynchronous stage.
- **watcher**: persistent Postgres `LISTEN/NOTIFY` dispatcher. Rebuild it only
  when the new feature needs asynchronous worker dispatch.

Each service uses Cloud Run port `8080`. Cloud Run service accounts need
`Secret Manager Secret Accessor`; services that touch GCS also need the
appropriate Storage role (historically `Storage Object Admin`).

## Frontend build-time environment

Vite exposes only `VITE_*` variables. Configure these as Cloud Build
substitutions/build arguments rather than runtime variables:

| Name | Purpose |
| --- | --- |
| `VITE_API_URL` | Public API base URL. |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth browser client ID. Must match backend `GOOGLE_CLIENT_ID`. |
| `VITE_DODO_MODE` | `test` or `live` checkout mode. |
| `VITE_META_PIXEL_ID` | Meta browser pixel ID. |
| `VITE_GOOGLE_ADS_ID` | Google Ads account tag, e.g. `AW-...`. |
| `VITE_GOOGLE_ADS_SIGNUP_LABEL` | Google Ads signup conversion label. |
| `VITE_GOOGLE_ADS_CHECKOUT_LABEL` | Google Ads checkout conversion label. |
| `VITE_GOOGLE_ADS_SUBSCRIBE_LABEL` | Google Ads purchase/subscription conversion label. |
| `VITE_REDDIT_PIXEL_ID` | Reddit browser pixel ID. |

## Shared API environment contract

Do not commit secret values. Put secrets in Secret Manager and map them to the
same environment-variable names on Cloud Run.

| Group | Environment variables |
| --- | --- |
| App | `APP_ENV`, `ADMIN_EMAILS`, `PORT`, `LOG_LEVEL`, `FRONTEND_URL` |
| Supabase/Postgres | `SUPABASE_DB_URL` |
| Google login/JWT | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `JWT_EXPIRY_DAYS` |
| Dodo | `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_API_BASE`, `DODO_ALLOW_UNSIGNED_WEBHOOKS`, and the active `DODO_PRODUCT_*` IDs |
| GCS | `GCS_BUCKET_NAME`, `GCS_PUBLIC_BASE_URL` |
| TikTok events | `TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_TEST_EVENT_CODE` |
| Meta events | `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`, `META_TEST_EVENT_CODE` |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Optional cache | `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `REDIS_STREAM_CACHE_TTL` |
| Worker dispatch | `INTERNAL_TASK_SECRET`, `API_WORKER_URLS`, `API_WORKER_REGIONS`, `FFMPEG_WORKER_URLS`, `FFMPEG_WORKER_REGIONS`, `WORKER_SERVICE_URLS`, `WORKER_SERVICE_REGIONS`, `API_REGION_SOFT_CAP`, `FFMPEG_REGION_SOFT_CAP`, `WATCHER_REGION_SOFT_CAP`, `RECONCILE_STUCK_MINUTES` |

Only reintroduce provider-specific variables (OpenAI, proxies, social posting,
TTS, etc.) when the new feature actually uses that provider.

## Authentication and users

Authentication is custom Google OAuth token verification plus application JWT;
it is **not** Supabase Auth. The new Supabase database must retain a `users`
table with, at minimum:

`id`, `email`, `full_name`, `avatar_url`, `google_sub`, `password_hash`,
`plan`, `subscription_status`, `dodo_subscription_id`, `plan_expires_at`,
`dodo_event_at`, `created_at`, and `updated_at`.

Migrate the existing 3,500+ user rows only. Preserve UUIDs and unique email/
Google-subject constraints so existing users can sign in without creating new
accounts.

## Dodo Payments

The API creates checkout sessions using `DODO_PAYMENTS_API_KEY`; the webhook
endpoint verifies `DODO_PAYMENTS_WEBHOOK_SECRET` before updating the user’s
plan/subscription entitlement. Preserve a `dodo_webhook_events` ledger keyed by
webhook ID and `users.dodo_event_at` so retries and out-of-order webhooks are
idempotent. New pricing criteria and `DODO_PRODUCT_*` mappings will be defined
with the new feature; do not copy retired plan quotas.

## Tracking to preserve

- **TikTok Events API**: retain the server-side event helper and
  `tiktok_events_log` table. Use `TIKTOK_PIXEL_ID` plus `TIKTOK_ACCESS_TOKEN`;
  `TIKTOK_TEST_EVENT_CODE` is optional during validation.
- **Meta Conversions API**: retain `meta_events_log` and use the Meta variables
  above. Keep the browser `VITE_META_PIXEL_ID` separate from its server token.
- **Google Ads**: retain `google_ads_events_log` plus the browser account tag
  and conversion labels.
- **Reddit**: retain the browser pixel ID and client-side event helper.

## Database policy for the new project

Keep only `users`, `dodo_webhook_events`, `tiktok_events_log`,
`meta_events_log`, and `google_ads_events_log` (plus any minimal settings table
the rebuilt admin requires). Do not migrate old jobs, clips, queues, feature
credits, feedback, gameplay, assets, or feature-specific admin records.

## Rebuild order

1. Create the new Supabase project and foundation schema; migrate users.
2. Rebuild API config, DB pool, JWT dependencies, Google login, Dodo webhook,
   and tracking helpers using the variable names above.
3. Rebuild the React shell with the original name/logo and tracker tags.
4. Rebuild `/admin` for the new feature.
5. Recreate Dockerfiles and Cloud Build files with the retained Cloud Run
   service and image names; only restore workers if the new feature needs them.
