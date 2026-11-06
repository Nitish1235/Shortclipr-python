# ShortClipr production release checklist

This repository is intentionally prepared for release without embedding any
production secret, project ID, service-account email, or database URL. Do not
deploy until every item below is true.

## 1. Apply the database once, in order

Run the migrations against the new Supabase Postgres database, in this exact
sequence:

1. `backend/migrations/0001_shortclipr_foundation.sql`
2. `backend/migrations/0002_landing_reel.sql`
3. `backend/migrations/0003_voice_library.sql`
4. `backend/migrations/0004_billing_checkout_sessions.sql`
5. `backend/migrations/0005_project_email_notifications.sql`
6. `backend/migrations/0006_landing_media_slots.sql`
7. `backend/migrations/0007_pricing_entitlements.sql`
8. `backend/migrations/0008_free_plan_15_seconds.sql`
9. `backend/migrations/0009_media_placement_map.sql`
10. `backend/migrations/0010_worker_region_state.sql`
11. `backend/migrations/0011_landing_thumbnail_slots.sql` — six image-only landing thumbnail placements.
12. `backend/migrations/0012_editorial_landing_media.sql` — editorial collection media placements.
13. `backend/migrations/0013_billing_plan_constraint.sql` — aligns checkout plans with Starter, Creator, and Studio.

Then import the retained users with `backend/migrations/users_import_template.sql`.
Never migrate retired feature tables or old jobs.

## 2. Configure existing Cloud Run services

Keep these service names unchanged:

| Service | Required runtime configuration |
| --- | --- |
| `shortclipr-api` | `SERVICE_ROLE=api`; public auth, billing, Admin/voice-library and Studio environment. |
| `shortclipr-api-worker-{region}` | `SERVICE_ROLE=api-worker`; DB, OpenAI, UnrealSpeech, GCS and `INTERNAL_TASK_SECRET` only. |
| `shortclipr-ffmpeg-worker-{region}` | `SERVICE_ROLE=ffmpeg-worker`; DB, GCS/signing, Resend and `INTERNAL_TASK_SECRET` only; 4 GiB / 4 vCPU / concurrency 1. |
| `shortclipr-watcher` | `SUPABASE_DB_URL`, `INTERNAL_TASK_SECRET`, `API_WORKER_URLS`, and `FFMPEG_WORKER_URLS`; it now exposes only an internal health port for Cloud Run. |
| `shortclipr-frontend` | Build substitutions, not runtime secrets. |

For the API and both worker types, set `APP_ENV=production`. Each image sets
its own `SERVICE_ROLE`, and startup validates only the secrets that role needs.
It refuses a revision with missing critical settings, weak JWT/internal secrets,
an insecure frontend URL, an unsigned Dodo webhook, or a non-live Dodo API.

The complete role-specific secret map is:

```text
shortclipr-api
  SUPABASE_DB_URL, FRONTEND_URL, GOOGLE_CLIENT_ID, JWT_SECRET,
  UNREALSPEECH_API_KEY, GCS_BUCKET_NAME, GCS_SIGNING_SERVICE_ACCOUNT,
  DODO_PAYMENTS_API_KEY, DODO_PAYMENTS_WEBHOOK_SECRET,
  DODO_PRODUCT_STARTER, DODO_PRODUCT_CREATOR, DODO_PRODUCT_STUDIO

shortclipr-api-worker-{region}
  SUPABASE_DB_URL, FRONTEND_URL, OPENAI_API_KEY, UNREALSPEECH_API_KEY,
  GCS_BUCKET_NAME, INTERNAL_TASK_SECRET

shortclipr-ffmpeg-worker-{region}
  SUPABASE_DB_URL, FRONTEND_URL, GCS_BUCKET_NAME,
  GCS_SIGNING_SERVICE_ACCOUNT, RESEND_API_KEY, RESEND_FROM_EMAIL,
  INTERNAL_TASK_SECRET
```

Also set the optional/operational values from `.env.example` where relevant:
model IDs, GCS public-base fallback, Dodo plan credit allowances, CORS origins,
tracker keys, email/media limit, worker URLs/regions, and concurrency caps.

Use Secret Manager for secrets. The existing Cloud Build definitions deliberately
do not overwrite a service’s environment or secret bindings, so they preserve
the installed production configuration. A newly created service must be
configured before its first deployment.

## 3. Configure permissions

- API and render-worker service accounts: Storage Object Admin for the private
  GCS bucket and Service Account Token Creator on `GCS_SIGNING_SERVICE_ACCOUNT`.
- All services receiving secrets: Secret Manager Secret Accessor.
- Cloud Build identity: Artifact Registry write access and permission to update
  the retained Cloud Run services.
- Confirm the GCS bucket is not publicly readable. Videos, landing media, and
  finished downloads use time-limited signed URLs.

## 4. Configure providers

- Google OAuth: use a **Web application** client and add
  `https://shortclipr.com` (plus `https://www.shortclipr.com` only if that host
  serves the app) to Authorized JavaScript origins. This app uses the GIS popup
  callback, so it does not need an OAuth redirect URI. The exact same client ID
  must be supplied as frontend `VITE_GOOGLE_CLIENT_ID` and backend
  `GOOGLE_CLIENT_ID`.
- Dodo: set three distinct live product IDs and configure the public endpoint
  `https://YOUR_API_DOMAIN/v1/webhooks/dodo` with its verified signing secret.
  Subscribe to `subscription.active`, `subscription.renewed`,
  `subscription.updated`, `subscription.plan_changed`,
  `subscription.unpaused`, `subscription.cancelled`, `subscription.expired`,
  `subscription.failed`, `subscription.on_hold`, `subscription.past_due`,
  `subscription.paused`, and `payment.failed`. Subscription events are the
  entitlement authority; payment events are not trusted to grant render time.
  Do one test-mode checkout and webhook verification before switching both the
  API and the three product IDs to live mode.
- Resend: verify the sender domain used by `RESEND_FROM_EMAIL`; a completed
  film then sends one tracked ready-email with Studio and signed MP4 links.
- UnrealSpeech: test one synthesis and then generate the Admin voice library.
- OpenAI: confirm the configured Luna/Terra model IDs are enabled for the API
  key used by workers.

## 5. Frontend build substitutions

Set these Cloud Build substitutions for `cloudbuild-frontend.yaml`:

```text
_VITE_API_URL=https://YOUR_API_DOMAIN
_VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_BROWSER_CLIENT_ID
_VITE_DODO_MODE=live
_VITE_META_PIXEL_ID
_VITE_GOOGLE_ADS_ID
_VITE_GOOGLE_ADS_SIGNUP_LABEL
_VITE_GOOGLE_ADS_CHECKOUT_LABEL
_VITE_GOOGLE_ADS_SUBSCRIBE_LABEL
_VITE_REDDIT_PIXEL_ID
_VITE_TIKTOK_PIXEL_ID
```

Never put server keys, Dodo secrets, GCS credentials, or provider tokens in a
`VITE_*` variable.

## 6. Release verification

After deployment, check in this order:

1. `GET /health` succeeds for frontend and API; `GET /ready` succeeds for API
   and both worker service types.
2. Google sign-in works for a retained user; `/admin` remains denied except for
   the two source-controlled owner emails.
3. Dodo checkout/webhook activates a test account and credits appear once; open
   the authenticated billing portal and confirm it belongs to that same account.
   Confirm the checkout return page changes from “securely confirming” to
   “payment confirmed” and that replaying the same webhook does not grant twice.
4. Create one 15-second test film. Verify planner dispatch, render, FFmpeg QC,
   private GCS upload, signed playback/download, credit settlement, and Resend
   ready-email.
5. In Admin, confirm the Render Floor lists every configured worker region,
   capacity, active assignment and safely queued job. Fill one region to its
   cap and confirm its next job remains queued rather than being discarded.
6. In Admin, upload both named landing placements and one reel clip; confirm
   the Story Machine landing page renders all three through signed URLs.
7. Run `npm run check:seo`; it must report the same number of indexable pages
   and sitemap URLs with no broken internal links.
8. Confirm `/robots.txt` and `/sitemap.xml` return HTTP 200 from the public
   frontend hostname, and confirm `/` permanently redirects to
   `/story-machine/`.
9. Confirm an unknown public URL returns the branded page with HTTP 404, while
   `/landing-demo/` and `/clip-types/` permanently redirect to their canonical
   replacements.
10. After the first production release, add the `shortclipr.com` domain
    property in Google Search Console, submit
    `https://shortclipr.com/sitemap.xml`, and inspect the landing page plus one
    product page and one guide. This is an external post-deploy action; no API
    key or application environment variable is required.

The Cloud Build files now use explicit HTTP startup probes. Cloud Run startup
probes only consider 2xx/3xx responses healthy, so a failed readiness endpoint
prevents an unhealthy revision from receiving traffic.
