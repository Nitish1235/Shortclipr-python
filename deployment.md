# ShortClipr Deployment Guide (Manual Console UI)

This guide provides step-by-step instructions for deploying ShortClipr to production manually using the Google Cloud Console, Supabase Dashboard, and Upstash Console. No CLI commands are required for deployment.

> **Architecture note**: ShortClipr runs as **two** Cloud Run services — `shortclipr-frontend` (static React/Vite bundle behind Nginx) and `shortclipr-api` (FastAPI backend). There is **no separate worker service** — clip-processing jobs run in-process on the API service via `asyncio.create_task()` on the same event loop (see `backend/app/api/jobs.py`). Auth is **not** Supabase Auth — the backend implements its own Google OAuth + JWT flow (`backend/app/api/auth.py`) and talks to Postgres directly via `asyncpg`/`SUPABASE_DB_URL`. Keep this in mind: you do not need `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_KEY`, and `auth.uid()`-based RLS policies will not work since rows aren't owned by Supabase Auth users.

## 1. Google Cloud Platform (GCP) Setup (Console)

### 1.1 Project & APIs
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `shortclipr-prod`) from the project selector dropdown at the top.
3. In the search bar, search for and enable the following APIs:
   - **Cloud Run API**
   - **Cloud Build API**
   - **Artifact Registry API**
   - **Secret Manager API**
   - **Cloud Storage API**

### 1.2 Storage Bucket
1. Navigate to **Cloud Storage > Buckets** in the left menu.
2. Click **Create**. Name it (e.g., `shortclipr-clips`), choose a region (match your Cloud Run region, e.g. `us-central1`), and leave other settings as default.
3. Once created, go to the **Permissions** tab of the bucket.
4. Click **Grant Access**. Add principal `allUsers` and assign the role **Storage Object Viewer** — clips are served via public URLs (`GCS_PUBLIC_BASE_URL`) directly to the dashboard/export flows.
5. *(Optional cost safety-net)* Go to the **Lifecycle** tab and add a rule to delete objects older than e.g. 30-60 days. Note: the backend already deletes a job's clips/thumbnails from GCS the moment a user deletes that job (`delete_job_from_gcs` in `app/pipeline/uploader.py`), so a lifecycle rule is just a backstop for orphaned objects, not the primary cleanup mechanism — don't set it shorter than your expected user retention window.

### 1.3 Service Account & Secrets
1. Navigate to **IAM & Admin > Service Accounts**.
2. Click **Create Service Account** (e.g., `shortclipr-sa`).
3. Grant it the roles: **Storage Object Admin** and **Secret Manager Secret Accessor**.
4. Attach this service account to the `shortclipr-api` Cloud Run service (Edit Revision → Security → Service account). No `GOOGLE_APPLICATION_CREDENTIALS` JSON key is needed — Cloud Run uses the attached service account automatically for GCS access.
5. To add secrets (API keys, DB URL, proxy credentials, etc.), go to **Security > Secret Manager**, click **Create Secret**, paste your values, and ensure the service account has the **Secret Manager Secret Accessor** role.

---

## 2. Database Setup (Supabase Dashboard)

### 2.1 Run the schema migration
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard) and create a project.
2. Go to the **SQL Editor**.
3. Open `backend/migrations/001_init_schema.sql` from the repo and run its full contents. It is **idempotent** (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + backfill `UPDATE`s), so it's safe to re-run if you ever need to reconcile an existing database with a newer version of the schema.
4. This single script creates/updates all three tables and their columns:
   - `users` — profile, plan, credits (`credits_used`/`credits_limit`), video-bandwidth quota (`video_minutes_used`/`video_minutes_limit`), `credits_reset_at`, `social_tokens` (JSONB — for the backend-only YouTube publish flow), etc.
   - `jobs` — video processing state and progress.
   - `clips` — generated clip metadata, including `viral_score`.
   It also creates the supporting indexes (`idx_jobs_user_status`, `idx_clips_viral_score`, `idx_users_plan`, etc.).
5. The plan → quota mapping (credits + monthly video-hours per tier) lives in `backend/app/core/plan_limits.py` — that's the single source of truth; the migration only sets sane defaults/backfills.

### 2.2 Row Level Security (RLS)
**Skip this.** ShortClipr does not use Supabase Auth — users authenticate via our own Google OAuth + JWT flow, and the backend connects to Postgres with the full `SUPABASE_DB_URL` connection string (not the Supabase client SDK / `anon` key). `auth.uid()` resolves to nothing in this setup, so RLS policies built around it would either silently block all access or do nothing useful. Access control is enforced entirely at the FastAPI layer (JWT-authenticated routes + `ADMIN_EMAILS` allowlist for admin endpoints — see `backend/app/api/admin.py`).

If you want defense-in-depth at the DB level, you would need to issue a dedicated low-privilege Postgres role to the backend and write policies against your own JWT claims — this is **not** currently implemented and is out of scope for a default deployment.

---

## 3. Artifact Registry Setup (Required for Cloud Build)

Before deploying anything, create a Docker repository to store your container images:
1. Navigate to **Artifact Registry** in the Google Cloud Console.
2. Click **+ CREATE REPOSITORY**.
3. **Name**: `cloud-run-source-deploy`
4. **Format**: Docker
5. **Location**: Region `us-central1` (or your preferred region — must match the region used in `backend/cloudbuild-api.yaml` and `cloudbuild-frontend.yaml`).
6. Click **Create**.

---

## 4. Backend Deployment (Cloud Run Console)

*Assumption: Your code is hosted on GitHub.*

### 4.1 Deploy the API service
1. In Google Cloud Console, navigate to **Cloud Run**.
2. Click **Create Service**.
3. Select **Continuously deploy from a repository** and click **Setup Cloud Build**.
4. Connect your GitHub repository and select the `main` branch.
5. In the Build Configuration, select **Cloud Build configuration file (yaml or json)**.
6. Set the location to `backend/cloudbuild-api.yaml` and click **Save**.
   - This config already builds the Docker image (multi-stage, FFmpeg + Python deps baked in — see `backend/Dockerfile`), pushes both a `$COMMIT_SHA` and `latest` tag to Artifact Registry, and deploys to Cloud Run with production-tuned resources: **4096Mi memory, 2 vCPU, 1200s timeout, concurrency 10, min-instances 0 / max-instances 10**. These values matter — FFmpeg runs multiple parallel encodes per job and the pipeline can legitimately run for several minutes on long videos (`PIPELINE_TIMEOUT_SECONDS = 1200` in `app/pipeline/orchestrator.py`).
7. Set the service name to `shortclipr-api` and region to `us-central1` (must match your Artifact Registry region).
8. Under **Authentication**, choose **Allow unauthenticated invocations** (the frontend and Dodo webhooks both need to reach it directly; auth is handled per-route via JWT inside the app).
9. Expand **Container, Networking, Security** → **Variables & Secrets** and add every backend environment variable. Use `backend/.env.example` as your checklist — at minimum:
   - `APP_ENV=production` (this also disables the `/testing` debug router — it only mounts when `APP_ENV == "development"`)
   - `ADMIN_EMAILS`, `FRONTEND_URL`, `SUPABASE_DB_URL` (Secret), `JWT_SECRET` (Secret)
   - `UPSTASH_REDIS_URL` / `UPSTASH_REDIS_TOKEN` (Secret)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Secret), `SOCIAL_REDIRECT_URI`
   - `OPENAI_API_KEY` (Secret), `OPENAI_MODEL`
   - `GCS_BUCKET_NAME`, `GCS_PUBLIC_BASE_URL`
   - `INNERTUBE_API_KEY`, `INNERTUBE_API_BASE`
   - `PROXY_HOST`, `PROXY_USER` (Secret), `PROXY_PASS` (Secret), `PROXY_PORTS` — residential proxy used for InnerTube/stream resolution. The pipeline only routes the actual FFmpeg *download* through this proxy when the signed CDN URL is cryptographically IP-bound to it (see `_url_is_ip_bound` in `app/pipeline/extractor.py`); otherwise it downloads directly from the Cloud Run instance's IP to minimize proxy bandwidth costs.
   - `DODO_PAYMENTS_API_KEY` (Secret), `DODO_PAYMENTS_WEBHOOK_SECRET` (Secret), and all five product IDs: `DODO_PRODUCT_STARTER_100`, `DODO_PRODUCT_STARTER_250`, `DODO_PRODUCT_PRO_500`, `DODO_PRODUCT_PRO_1000`, `DODO_PRODUCT_PRO_2000`
   - `MAX_CONCURRENT_CLIPS`, `MAX_CONCURRENT_JOBS_PER_USER`
10. Attach the `shortclipr-sa` service account from step 1.3 (grants GCS access without a credentials file).
11. Click **Create**. Cloud Run will build and deploy your API using the configuration file.

> There is intentionally **no step to deploy a worker service** — the old multi-service design (separate `shortclipr-worker`) has been removed. All clip processing happens inside the API service's event loop.

---

## 5. Frontend Deployment (Cloud Run Console)

We deploy the React frontend to Cloud Run using a lightweight Nginx container (see `nginx.conf` — gzip, security headers, SPA routing, immutable caching for hashed JS/CSS, and a `/health` endpoint) to serve the static Vite build.

1. In Google Cloud Console, navigate to **Cloud Run**.
2. Click **Create Service**.
3. Select **Continuously deploy from a repository** and click **Setup Cloud Build**.
4. Connect your GitHub repository and select the `main` branch.
5. In the Build Configuration, select **Cloud Build configuration file (yaml or json)**.
6. Set the location to `cloudbuild-frontend.yaml` and click **Save**.
   - This config builds the image with the Vite `--build-arg` substitutions baked in, pushes `$COMMIT_SHA` + `latest` tags, and deploys with `--platform managed --memory 256Mi --cpu 1 --concurrency 80 --min-instances 0 --max-instances 5`.
7. Set the service name to `shortclipr-frontend` and region to `us-central1`.
8. Under **Authentication**, choose **Allow unauthenticated invocations**.
9. Click **Create** (this first build will likely fail until you set the substitution variables below — that's expected; just re-run the trigger afterward).

### 5.1 Configuring Frontend Build Variables
Because Vite bakes environment variables into the static bundle at **build time**, you must add them as **Substitution Variables** on the Cloud Build trigger — not as Cloud Run runtime variables (those would have no effect on the compiled bundle).

1. Go to **Cloud Build > Triggers**.
2. Click the `shortclipr-frontend` trigger to edit it.
3. Scroll down to **Advanced > Substitution variables**.
4. Add the following (exactly as written, including the leading underscore — these map to the `--build-arg` flags in `cloudbuild-frontend.yaml`):
   - `_VITE_API_URL` → `https://<YOUR-API-CLOUD-RUN-URL>`
   - `_VITE_GOOGLE_CLIENT_ID` → `your-google-client-id.apps.googleusercontent.com`
   - `_VITE_DODO_MODE` → `test` (or `live`)
5. Click **Save**, then click **Run** to rebuild the frontend with the real values injected.

---

## 6. Post-Deployment Configuration
1. **Google OAuth**: Go to GCP **APIs & Services > Credentials**. Update your OAuth Client ID's **Authorized JavaScript origins** and **Authorized redirect URIs** to include your production frontend domain *and* the backend's `SOCIAL_REDIRECT_URI` callback path (`/social/auth/youtube/callback`) if/when you re-enable YouTube publishing in the UI (the backend support is intact — only the frontend entry points are currently hidden, see `src/pages/Dashboard.jsx`).
2. **Webhooks**: Go to your Dodo Payments dashboard and set the webhook URL to `https://<YOUR_CLOUD_RUN_API_URL>/webhooks/dodo`. This is what drives plan upgrades/downgrades — `_handle_payment_succeeded` / `_handle_downgrade` in `backend/app/api/webhooks.py` set both `credits_limit` and `video_minutes_limit` from `app/core/plan_limits.py` based on the Dodo product ID in `DODO_PLAN_MAP`.
3. **CORS**: The allowed origins are defined directly in `backend/app/main.py` (`http://localhost:3000`, `http://localhost:5173`, `https://shortclipr.com`, `https://www.shortclipr.com`, `https://app.shortclipr.com`), plus whatever you set as `FRONTEND_URL` in the API's environment variables (appended dynamically at startup). Make sure your real production frontend domain is covered by one of these — either it matches the hardcoded list, or you set `FRONTEND_URL` to it — *before* you push to GitHub and trigger a deploy.
4. **Admin access**: Set `ADMIN_EMAILS` (comma-separated Google account emails) on the API service to grant access to admin-only endpoints (`backend/app/api/admin.py`).
5. **Smoke test**: Hit `https://<frontend-url>/health` and `https://<api-url>/docs` (FastAPI auto-docs) to confirm both services are live, then run through the Google login → submit a YouTube URL → clip generation flow end-to-end with a short test video before announcing the launch.
