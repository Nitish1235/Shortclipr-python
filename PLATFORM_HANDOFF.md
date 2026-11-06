# ShortClipr platform handoff

This file is the source of truth for rebuilding product features without
renaming the deployed platform.

The rebuilt animation product architecture is defined in
[`SHORTCLIPR_SYSTEM_BLUEPRINT.md`](SHORTCLIPR_SYSTEM_BLUEPRINT.md).
This handoff remains authoritative for retained service names, environment
variables, authentication, payments, tracking, and migration constraints.

## Names to retain

- Brand: **ShortClipr**; retain the logo files in `public/`.
- Cloud Run services: `shortclipr-frontend`, `shortclipr-api`,
  `shortclipr-api-worker-{region}`, `shortclipr-ffmpeg-worker-{region}`, and
  `shortclipr-watcher`.
- Artifact Registry repository: `us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy`.
- Image names: `shortclipr-frontend`, `shortclipr-api`,
  `shortclipr-api-worker`, `shortclipr-ffmpeg-worker`, and
  `shortclipr-watcher`. Cloud Run service names above remain unchanged.
- Primary production domain: `shortclipr.com`.

## Service responsibilities

- **frontend**: Vite/React static build served by Nginx on port 8080.
- **api**: public HTTP API, custom Google OAuth/JWT authentication, Dodo
  checkout/webhooks, admin API, and app-specific endpoints.
- **api worker**: lightweight planning image. It contains the OpenAI and
  UnrealSpeech stage only and exposes `/internal/api-stage/run`.
- **FFmpeg worker**: isolated renderer image. It contains Revideo, Chromium
  and FFmpeg only, exposes `/internal/ffmpeg-stage/run`, and runs at 4 GiB /
  4 vCPU / concurrency 1.
- **watcher**: persistent Postgres `LISTEN/NOTIFY` dispatcher. Rebuild it only
  when the new feature needs asynchronous worker dispatch.

Each service uses Cloud Run port `8080`. Cloud Run service accounts need
`Secret Manager Secret Accessor`; services that touch GCS also need the
appropriate Storage role (historically `Storage Object Admin`). The API and
render-worker identities also need `Service Account Token Creator` on the
`GCS_SIGNING_SERVICE_ACCOUNT` identity so private final videos can receive
V4 signed download URLs without storing a JSON private key.

## Frontend build-time environment

Vite exposes only `VITE_*` variables. Configure these as Cloud Build
substitutions/build arguments rather than runtime variables:

| Name | Purpose |
| --- | --- |
| `VITE_API_URL` | Public API base URL. It also powers the Story Machine landing reel API. |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth browser client ID. Must match backend `GOOGLE_CLIENT_ID`. |
| `VITE_DODO_MODE` | `test` or `live` checkout mode. |
| `VITE_META_PIXEL_ID` | Meta browser pixel ID. |
| `VITE_GOOGLE_ADS_ID` | Google Ads account tag, e.g. `AW-...`. |
| `VITE_GOOGLE_ADS_SIGNUP_LABEL` | Google Ads signup conversion label. |
| `VITE_GOOGLE_ADS_CHECKOUT_LABEL` | Google Ads checkout conversion label. |
| `VITE_GOOGLE_ADS_SUBSCRIBE_LABEL` | Google Ads purchase/subscription conversion label. |
| `VITE_REDDIT_PIXEL_ID` | Reddit browser pixel ID. |
| `VITE_TIKTOK_PIXEL_ID` | TikTok browser pixel ID; keep server token backend-only. |

## Service environment contracts

Do not commit secret values. Put them in Secret Manager and map only the values
each service needs; worker images no longer inherit the full public-API secret
set.

| Group | Environment variables |
| --- | --- |
| App | `APP_ENV`, `PORT`, `LOG_LEVEL`, `FRONTEND_URL` |
| Supabase/Postgres | `SUPABASE_DB_URL` |
| Google login/JWT | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `JWT_EXPIRY_DAYS` |
| Dodo | `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_API_BASE`, `DODO_ALLOW_UNSIGNED_WEBHOOKS`, `DODO_PRODUCT_STARTER`, `DODO_PRODUCT_CREATOR`, `DODO_PRODUCT_STUDIO`, and their render-time allowances |
| GCS | `GCS_BUCKET_NAME`, `GCS_PUBLIC_BASE_URL`, `GCS_SIGNING_SERVICE_ACCOUNT` |
| TikTok events | `TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_TEST_EVENT_CODE` |
| Meta events | `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`, `META_TEST_EVENT_CODE` |
| OpenAI scene system | `OPENAI_API_KEY`, `OPENAI_LUNA_MODEL`, `OPENAI_TERRA_MODEL`, `OPENAI_REASONING_EFFORT_LUNA`, `OPENAI_REASONING_EFFORT_TERRA` |
| UnrealSpeech | `UNREALSPEECH_API_KEY`, `UNREALSPEECH_API_BASE` |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Optional cache | `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `REDIS_STREAM_CACHE_TTL` |
| Worker dispatch | `INTERNAL_TASK_SECRET`, `API_WORKER_URLS`, `API_WORKER_REGIONS`, `FFMPEG_WORKER_URLS`, `FFMPEG_WORKER_REGIONS`, `WORKER_SERVICE_URLS`, `WORKER_SERVICE_REGIONS`, `API_REGION_SOFT_CAP`, `FFMPEG_REGION_SOFT_CAP`, `WORKER_REGION_COOLDOWN_SECONDS`, `WATCHER_REGION_SOFT_CAP`, `RECONCILE_STUCK_MINUTES` |

The rebuilt animation pipeline now uses the OpenAI and UnrealSpeech variables
listed above. Keep all provider keys server-side.

For two 20-vCPU render regions using 4-vCPU Cloud Run instances, configure the
two comma-separated FFmpeg URLs and matching labels in the same order, then set
`FFMPEG_REGION_SOFT_CAP=4`. The watcher treats that as four assigned render
jobs per region (eight total), leaving safety headroom for a render that starts
an additional helper process. The ninth job stays durable in Postgres when both
regions are full, then dispatches as soon as a slot is released. A quota
rejection temporarily bypasses its region without spending a job retry.

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

The admin media desk has a fixed server-side allowlist: `nitantig@gmail.com`
and `jainnitish432@gmail.com`. It is intentionally not configurable by an
environment variable and is reached directly at `/admin`; regular users do not
see an admin dashboard entry.

## Dodo Payments

The API creates checkout sessions using `DODO_PAYMENTS_API_KEY`; the webhook
endpoint verifies `DODO_PAYMENTS_WEBHOOK_SECRET` before updating the user’s
plan/subscription entitlement. Preserve a `dodo_webhook_events` ledger keyed by
webhook ID and `users.dodo_event_at` so retries and out-of-order webhooks are
idempotent. Product IDs, rather than browser-supplied plan metadata, are the
source of truth for Starter, Creator, and Studio. Fresh render time is granted
only on an initial activation or renewal—not on a subscription profile update.

Paid users manage their payment method, cancellation, and plan changes through
the authenticated `POST /v1/billing/portal` endpoint. It obtains a short-lived
Dodo Customer Portal URL only after checking that the Dodo subscription’s email
belongs to the signed-in ShortClipr account. The active plans are Free (one
15-second short monthly), Starter ($15 / 10 render minutes), Creator ($39 / 30
render minutes), and Studio ($89 / 70 render minutes). Dodo products exist only
for the three paid plans.

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

From the old database, migrate only `users`, `dodo_webhook_events`,
`tiktok_events_log`, `meta_events_log`, and `google_ads_events_log` where their
history is still required. The new foundation migration creates fresh
animation projects, jobs, credits, scenes, and showcase tables. Do not migrate
old jobs, clips, queues, feature credits, feedback, gameplay, assets, or
feature-specific admin records.

Apply `backend/migrations/0001_shortclipr_foundation.sql`,
`backend/migrations/0002_landing_reel.sql`,
`backend/migrations/0003_voice_library.sql`,
`backend/migrations/0004_billing_checkout_sessions.sql`,
`backend/migrations/0005_project_email_notifications.sql`,
`backend/migrations/0006_landing_media_slots.sql`,
`backend/migrations/0007_pricing_entitlements.sql`,
`backend/migrations/0008_free_plan_15_seconds.sql`,
`backend/migrations/0009_media_placement_map.sql`, and
`backend/migrations/0011_landing_thumbnail_slots.sql`, in order. The second migration
adds the landing-reel flag and the link between a curated public clip and its
source project. The third stores the approved UnrealSpeech voice catalogue and
its public MP3 previews. The fourth records the Dodo checkout-to-user mapping
for durable webhook entitlement. The fifth records one Resend-ready notification
per completed project. The sixth creates the Admin-controlled landing-media
table and the ninth expands it to three direct-upload placements. Generated videos stay private until an allowed
admin deliberately copies one into the public showcase namespace. The tenth
stores each configured worker region's capacity and temporary cooldown state;
the protected Admin Render Floor combines it with live Postgres job leases to
show exactly how many slots are assigned, available, full, or being bypassed.

## Finished-film email

When a render transaction completes, the render worker sends a branded Resend
email to the project owner. It contains the finished clip’s title, type,
duration, and format, an authenticated Studio link, plus a signed MP4 download
that expires after seven days. Configure a verified Resend sender as
`RESEND_FROM_EMAIL` (for example `ShortClipr <films@shortclipr.com>`). Email
delivery is deliberately non-blocking: a Resend failure is recorded in
`project_email_notifications` and never changes a completed project or its
credits.

## Landing media map

The Story Machine keeps its illustrated machine and process graphics as fixed
brand art. Admin controls the media-led surfaces: `landing_visible` showcase clips
feed the multi-film landing reel, while the `landing_media_slots` table holds
one direct-uploaded `landing_hero_background`, `screening_feature`, and
`screening_side` asset. These placements accept browser-safe MP4/WebM or JPG/PNG/WebP files, are kept private
in GCS, and are delivered through short-lived signed URLs by `/v1/landing-media`.
Admin uploads and restores the default artwork through `/admin` only.

## Rebuild order

1. Create the new Supabase project and foundation schema; migrate users.
2. Rebuild API config, DB pool, JWT dependencies, Google login, Dodo webhook,
   and tracking helpers using the variable names above.
3. Rebuild the React shell with the original name/logo and tracker tags.
4. Rebuild `/admin` for the new feature.
5. Recreate Dockerfiles and Cloud Build files with the retained Cloud Run
   service and image names; only restore workers if the new feature needs them.

Before each production release, run `npm run check:deploy` and follow
[`DEPLOYMENT_RELEASE_CHECKLIST.md`](DEPLOYMENT_RELEASE_CHECKLIST.md). The API
and worker images now expose `/ready`; the watcher exposes an internal health
port so Cloud Run can keep the retained watcher service alive.
