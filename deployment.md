# ShortClipr Deployment Guide (Manual Console UI)

Step-by-step for deploying ShortClipr to production using the Google Cloud Console, Supabase Dashboard, and Upstash Console. No CLI required.

---

## Architecture overview (current)

ShortClipr runs as **five** Cloud Run services now:

| Service | Purpose | Resources | Notes |
|---------|---------|-----------|-------|
| `shortclipr-frontend` | React/Vite bundle behind Nginx | 256Mi / 1 vCPU / concurrency 80 / max 5 | See `cloudbuild-frontend.yaml` |
| `shortclipr-api` | Auth, job CRUD, payments, webhooks | 1Gi / 1 vCPU / concurrency 40 / max 10 | See `backend/cloudbuild-api.yaml` |
| `shortclipr-api-worker-{region}` | **API pipeline stage** — metadata, transcript, GPT viral-clip detection | 2Gi / 4 vCPU / concurrency 12 / max 5 per region | See `backend/cloudbuild-api-worker.yaml` |
| `shortclipr-ffmpeg-worker-{region}` | **FFmpeg pipeline stage** — DASH download, reframe, caption encoding, upload | 8Gi / 4 vCPU / concurrency 2 / max 5 per region / `--no-cpu-throttling` | See `backend/cloudbuild-ffmpeg-worker.yaml` |
| `shortclipr-watcher` | Job dispatcher (LISTEN/NOTIFY on Postgres) | 512Mi / 1 vCPU / min=1 / max=1 / `--no-cpu-throttling` | See `backend/cloudbuild-watcher.yaml` |

**How they connect:**
```
POST /jobs  ──►  shortclipr-api  ──►  Postgres INSERT status='created', pipeline_stage='api'
                                      + pg_notify('new_job')
                                              │
                                              ▼
                                    shortclipr-watcher (LISTEN)
                                              │
                            ┌─────────────────┴─────────────────┐
                            ▼                                   ▼
        POST /internal/api-stage/run              POST /internal/ffmpeg-stage/run
        (to shortclipr-api-worker)                (to shortclipr-ffmpeg-worker)
                    │                                             │
                    ▼                                             ▼
         Runs steps 1-5 (metadata,                  Runs steps 6-8 (DASH download,
         transcript, GPT viral clips)               encode, upload, complete)
                    │                                             │
                    ▼                                             │
         Postgres: status='api_done',                             │
         writes ffmpeg_payload JSONB.                             │
         Trigger fires pg_notify('api_done')                      │
                    │                                             │
                    └────────────────► watcher ───────────────────┘
```

**Job status flow:**
```
created  →  api_processing  →  api_done  →  ffmpeg_processing  →  completed / failed
```

**Backward compatibility:** if you don't set `API_WORKER_URLS` + `FFMPEG_WORKER_URLS`, the API service falls back to running BOTH stages in-process via `asyncio.create_task()` (unified single-service mode — good for local dev). The old `WORKER_SERVICE_URLS` env still works for legacy unified-worker deployments — the watcher auto-detects mode.

Auth is **not** Supabase Auth — the backend implements its own Google OAuth + JWT flow (`backend/app/api/auth.py`) and talks to Postgres directly via `asyncpg` / `SUPABASE_DB_URL`. You do not need `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY`.

---

## 1. Google Cloud Platform (GCP) Setup

### 1.1 Project & APIs
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `shortclipr-prod`).
3. Enable the following APIs (search bar):
   - Cloud Run API
   - Cloud Build API
   - Artifact Registry API
   - Secret Manager API
   - Cloud Storage API

### 1.2 Storage Bucket
1. **Cloud Storage → Buckets → Create**. Name it (e.g., `shortclipr-clips`), region = same as Cloud Run (e.g. `us-central1`).
2. **Permissions** tab → **Grant Access** → principal `allUsers`, role **Storage Object Viewer**. Clips serve via public URLs.
3. *(Optional cost safety-net)* **Lifecycle** tab → add a rule to delete objects older than **≥ 30 days** so it never fires inside your app's own retention window.

   > **IMPORTANT** — the app's UI retention is now **15 days** (see [Dashboard.jsx](src/pages/Dashboard.jsx) `CLIP_RETENTION_MS`). **DO NOT set the GCS lifecycle rule shorter than 15 days** — the DB rows would still exist while GCS files are gone, producing broken cards. And critically, GCS lifecycle rules ignore the `clips.is_showcased` flag, so a too-aggressive rule will delete *showcase-protected* clips too. **30-60 days is the sane range** for a safety-net rule; leave it off entirely if you're not concerned about orphaned storage.

### 1.3 Service Account & Secrets
1. **IAM & Admin → Service Accounts → Create Service Account** (e.g., `shortclipr-sa`).
2. Grant roles: **Storage Object Admin** + **Secret Manager Secret Accessor**.
3. Attach it to each Cloud Run service (Edit Revision → Security → Service account). No `GOOGLE_APPLICATION_CREDENTIALS` JSON key is needed.
4. Add secrets: **Security → Secret Manager → Create Secret** for `SUPABASE_DB_URL`, `JWT_SECRET`, `INTERNAL_TASK_SECRET`, `OPENAI_API_KEY`, `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `UPSTASH_REDIS_TOKEN`, `PROXYSELLER_USER`, `PROXYSELLER_PASS`.

---

## 2. Database Setup (Supabase Dashboard)

### 2.1 Run migrations in order
1. Log into [Supabase](https://supabase.com/dashboard) → your project → **SQL Editor**.
2. Run each migration in order (all are idempotent — safe to re-run):
   - `backend/migrations/001_init_schema.sql` — base `users` / `jobs` / `clips` tables
   - `backend/migrations/002_job_reservations.sql` — atomic credit + minute reservations
   - `backend/migrations/003_remove_phase1_preview.sql` — removes obsolete preview columns
   - `backend/migrations/004_pgboss_queue.sql` — Postgres-backed queue (replaced Cloud Tasks)
   - `backend/migrations/005_split_workers.sql` — split API + FFmpeg worker columns
   - `backend/migrations/006_clip_retention.sql` — showcase-protection flag for clips

3. Skip Supabase Row Level Security — not applicable to our JWT/direct-connection setup. Access is enforced at the FastAPI layer.

### 2.2 Plan / quota reference
The plan → quota table lives in `backend/app/core/plan_limits.py` — that's the single source of truth. Current pricing:

| Plan | Price | Shorts / mo | Video hours / mo | Max per single video |
|------|-------|-------------|------------------|----------------------|
| Free | $0 | 3 | 30 min | 30 min |
| starter_100 | $10 | 75 | 5 hrs | 2 hrs |
| starter_250 | $25 | 200 | 10 hrs | 2 hrs |
| pro_500 | $45 | 400 | 18 hrs | 3 hrs |
| pro_1000 | $79 | 800 | 35 hrs | 3 hrs |
| pro_2000 | $145 | 1500 | 60 hrs | 3 hrs |

---

## 3. Artifact Registry (one-time)

1. **Artifact Registry → + CREATE REPOSITORY**
2. **Name**: `cloud-run-source-deploy`, **Format**: Docker, **Location**: `us-central1`.

---

## 4. Backend Deployment

### 4.1 Deploy `shortclipr-api`
1. **Cloud Run → Create Service** → **Continuously deploy from a repository** → connect GitHub → `main` branch.
2. Build Configuration → **Cloud Build configuration file** → location `backend/cloudbuild-api.yaml`.
3. Service name `shortclipr-api`, region `us-central1`, **Allow unauthenticated invocations**.
4. Environment variables (add via **Variables & Secrets**):
   - `APP_ENV=production`
   - `ADMIN_EMAILS`, `FRONTEND_URL`
   - `SUPABASE_DB_URL` (Secret), `JWT_SECRET` (Secret)
   - `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN` (Secret)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Secret), `SOCIAL_REDIRECT_URI`
   - `OPENAI_API_KEY` (Secret) — the model itself is pinned in `backend/app/pipeline/ai_clipper.py` (`CLIP_MODEL = "gpt-5-nano"`) — **no `OPENAI_MODEL` env var anymore**
   - `GCS_BUCKET_NAME`, `GCS_PUBLIC_BASE_URL`
   - `INNERTUBE_API_KEY`, `INNERTUBE_API_BASE`
   - `PROXYSELLER_USER` (Secret), `PROXYSELLER_PASS` (Secret), `PROXYSELLER_PROXIES` — residential proxy for DASH downloads
   - `DODO_PAYMENTS_API_KEY` (Secret), `DODO_PAYMENTS_WEBHOOK_SECRET` (Secret), and all five product IDs: `DODO_PRODUCT_STARTER_100/250` + `DODO_PRODUCT_PRO_500/1000/2000`
   - `MAX_CONCURRENT_CLIPS`, `MAX_CONCURRENT_JOBS_PER_USER`
   - **Worker dispatch** — set these to activate split-worker mode (leave empty for single-service in-process mode):
     - `API_WORKER_URLS` — comma-separated URLs of the deployed API worker services
     - `API_WORKER_REGIONS` — comma-separated region names, same count/order
     - `FFMPEG_WORKER_URLS` — comma-separated URLs of the deployed FFmpeg worker services
     - `FFMPEG_WORKER_REGIONS` — comma-separated region names, same count/order
   - `INTERNAL_TASK_SECRET` (Secret) — random string, must match every worker + the watcher
5. Attach `shortclipr-sa` service account.
6. Click **Create**.

### 4.1b Cross-project split (workers in a separate GCP project)

Cloud Run's default per-project **service limit is 5**. This app needs 4 services in the main project (`frontend`, `api`, `watcher`, plus one worker) — leaving no room to also host both worker types plus future regions. The split below keeps the main project small and moves both worker types into a dedicated **Project B**.

**Layout:**
- **Project A** (main): `shortclipr-frontend`, `shortclipr-api`, `shortclipr-watcher`
- **Project B** (workers): `shortclipr-api-worker-{region}`, `shortclipr-ffmpeg-worker-{region}` (one of each per region)

**Why this works with zero code changes:** the watcher dispatches to workers via public HTTPS URLs (`API_WORKER_URLS` / `FFMPEG_WORKER_URLS`) and authenticates with a shared `INTERNAL_TASK_SECRET` header — no VPC connector, no IAM handshake between services. Cross-project calls behave identically to same-project calls. `$PROJECT_ID` in the cloudbuild files auto-resolves to whichever project the trigger runs in.

**One-time Project B setup:**

1. **Create the project** (`shortclipr-workers` or similar). Link billing.

2. **Enable APIs** in Project B: Cloud Run API, Cloud Build API, Artifact Registry API, Secret Manager API.

3. **Artifact Registry** in Project B → create repository `cloud-run-source-deploy` (Docker, `us-central1`) — same name as Project A, but a distinct project-scoped repo.

4. **Service account** in Project B (e.g. `shortclipr-workers-sa`). Grant it **Secret Manager Secret Accessor** on Project B's own secrets (created in step 6 below).

5. **Cross-project bucket access.** The GCS bucket (`shortclipr-clips`) lives in Project A. In Project A → **Cloud Storage → Buckets → shortclipr-clips → Permissions → Grant Access**, add the Project B service account email as **Storage Object Admin**. Bucket IAM isn't project-locked, only bucket-locked, so this grant is all that's needed.

6. **Secrets in Project B.** Duplicate these secrets into Project B's Secret Manager (simplest — avoids cross-project IAM on secrets):
   - `SUPABASE_DB_URL` — same connection string as Project A
   - `INTERNAL_TASK_SECRET` — **must be byte-identical** to Project A's value
   - `OPENAI_API_KEY`
   - `PROXYSELLER_USER`, `PROXYSELLER_PASS`
   - `DATAIMPULSE_USER`, `DATAIMPULSE_PASS`
   - `JWT_SECRET` — the workers don't verify user JWTs, but the same env schema is loaded on boot, so keep the var set to avoid pydantic warnings (any string is fine).

   (Alternative — grant Project B's SA `Secret Manager Secret Accessor` on Project A's secrets and reference them by full resource path `projects/<PROJECT_A_ID>/secrets/<NAME>/versions/latest` when wiring env vars via `gcloud run deploy --update-secrets`. Simpler to just duplicate for a small secret set.)

7. **Cloud Build trigger** in Project B → connect the same GitHub repo, `main` branch. Two triggers, one each for `backend/cloudbuild-api-worker.yaml` and `backend/cloudbuild-ffmpeg-worker.yaml`. The `$PROJECT_ID` in those yaml files resolves to Project B automatically.

Once Project B is set up, deploy the workers exactly as in §4.2 / §4.3 below — but attach `shortclipr-workers-sa` (Project B's SA) instead of `shortclipr-sa`.

**Wiring back in Project A:** copy the Project B worker URLs and paste them into `API_WORKER_URLS` / `FFMPEG_WORKER_URLS` on both `shortclipr-api` and `shortclipr-watcher` in Project A. Redeploy both.

**Cost/latency notes:** cross-project HTTPS goes over the public internet, not Google's internal backbone. The watcher→worker payloads are tiny JSON (a few KB per dispatch), so latency impact is negligible. All heavy bytes (YouTube DASH downloads, GCS uploads) still travel worker↔external endpoints directly and never transit Project A. Egress from Project B → Project A GCS is same-region intra-Google traffic and is not charged as internet egress.

### 4.2 Deploy API workers (light — metadata / transcript / GPT)

**One deployment per region** — but the API stage is I/O bound and cheap, so **1 region is fine** unless you're seeing latency issues.

1. **Cloud Run → Create Service** → same GitHub repo, `main` branch.
2. Build Configuration → **Cloud Build configuration file** → `backend/cloudbuild-api-worker.yaml`.
3. Service name `shortclipr-api-worker-us-central1` (or whatever region you're deploying to), region `us-central1`.
4. **Allow unauthenticated invocations** — `/internal/*` routes are gated by `X-Internal-Secret` header.
5. **Add all the same env vars as `shortclipr-api`** (this service runs the same Docker image and needs full DB/OpenAI/etc. config). `INTERNAL_TASK_SECRET` **must match** the API + watcher.
6. Attach `shortclipr-sa`.
7. Click **Create**. Copy the resulting URL — you'll need it for the watcher + API `API_WORKER_URLS`.

Deploy per additional region if needed:
```
gcloud builds submit --config=backend/cloudbuild-api-worker.yaml --substitutions=_REGION=europe-west1
```

**Capacity math**: 5 max-instances × 12 concurrency = 60 concurrent API jobs per region.

### 4.3 Deploy FFmpeg workers (heavy — DASH + encode + upload)

**Deploy in ≥ 2 regions** since this is the throughput bottleneck. Recommended: `us-central1` + `europe-west1`.

1. **Cloud Run → Create Service** → same repo/branch.
2. Build Configuration → **Cloud Build configuration file** → `backend/cloudbuild-ffmpeg-worker.yaml`.
3. Service name `shortclipr-ffmpeg-worker-us-central1` (per region), region `us-central1`.
4. **Allow unauthenticated invocations** — `/internal/*` gated on secret.
5. **Add all the same env vars as `shortclipr-api`**. `INTERNAL_TASK_SECRET` must match.
6. Attach `shortclipr-sa`.
7. Click **Create**. Copy URL.
8. Repeat for each additional region via CLI:
   ```
   gcloud builds submit --config=backend/cloudbuild-ffmpeg-worker.yaml --substitutions=_REGION=europe-west1
   ```

**Capacity math**: 5 max-instances × 2 concurrency = 10 concurrent FFmpeg jobs per region. 2 regions → **20 concurrent max**.

### 4.4 Deploy `shortclipr-watcher` (job dispatcher)

Runs continuously (`min-instances=1`, `max-instances=1` — singleton), LISTENs on Postgres, dispatches jobs to workers. Uses a **separate small image** (512Mi — the minimum Cloud Run allows with `--no-cpu-throttling` — only asyncpg + httpx installed, no ffmpeg/opencv/openai/fastapi deps).

1. **Cloud Run → Create Service** → **Continuously deploy from a repository** → same repo/branch.
2. Build Configuration → **Cloud Build configuration file** → location `backend/cloudbuild-watcher.yaml`.
3. Service name `shortclipr-watcher`, region `us-central1`, **DO NOT** allow unauthenticated invocations (the watcher receives no inbound HTTP — it only makes outbound calls to workers).
4. Environment variables:
   - `SUPABASE_DB_URL` (Secret)
   - `INTERNAL_TASK_SECRET` (Secret) — same value used everywhere else
   - `API_WORKER_URLS`, `API_WORKER_REGIONS` — from step 4.2
   - `FFMPEG_WORKER_URLS`, `FFMPEG_WORKER_REGIONS` — from step 4.3
   - `API_REGION_SOFT_CAP` — default 12
   - `FFMPEG_REGION_SOFT_CAP` — default 2
   - `RECONCILE_STUCK_MINUTES` — default 10
   - `WATCHER_POLL_INTERVAL` — default 15 (seconds)
   - `LOG_LEVEL=INFO`
5. Attach `shortclipr-sa` service account.
6. Click **Create**.
7. **After deploy, wire back**: go back to `shortclipr-api` env vars and set `API_WORKER_URLS`, `API_WORKER_REGIONS`, `FFMPEG_WORKER_URLS`, `FFMPEG_WORKER_REGIONS` (same values as watcher) → **Deploy new revision** so the API knows to insert jobs with `status='created'` (split-worker mode) instead of running in-process.

> **Watcher does NOT need** all the env vars from `shortclipr-api`. It runs a minimal image (asyncpg + httpx only — see `backend/cloudbuild-watcher.yaml`) — no OpenAI, no proxy, no GCS, no OAuth, no Dodo, no Redis. Just DB + worker URLs + shared secret.

> If both `API_WORKER_URLS` and `FFMPEG_WORKER_URLS` are unset on `shortclipr-api`, it runs the pipeline in-process via `asyncio.create_task()` (single-service mode). Good for local dev; slow on the 1 vCPU / 1Gi API sizing in prod.

---

## 5. Frontend Deployment

Same as before — React/Vite bundle behind Nginx.

1. **Cloud Run → Create Service** → **Continuously deploy from a repository** → connect GitHub → `main` branch.
2. Build Configuration → `cloudbuild-frontend.yaml`. Service name `shortclipr-frontend`, region `us-central1`.
3. **Allow unauthenticated invocations**. Click Create.
4. **Configure Vite build vars** (baked in at build time, so they MUST be Cloud Build substitutions — not Cloud Run runtime vars):
   - **Cloud Build → Triggers → edit `shortclipr-frontend` trigger → Advanced → Substitution variables**:
     - `_VITE_API_URL` → `https://<YOUR-API-CLOUD-RUN-URL>`
     - `_VITE_GOOGLE_CLIENT_ID` → `your-google-client-id.apps.googleusercontent.com`
     - `_VITE_DODO_MODE` → `test` or `live`
5. Save → click **Run** to rebuild with real values.

---

## 6. Post-Deployment Configuration

1. **Google OAuth**: **APIs & Services → Credentials**. Add your production frontend origin + backend's `SOCIAL_REDIRECT_URI` callback path.
2. **Dodo Webhooks**: In your Dodo Payments dashboard, set webhook URL to `https://<YOUR_CLOUD_RUN_API_URL>/webhooks/dodo`.
3. **CORS**: `backend/app/main.py` has a static allowlist. Set `FRONTEND_URL` on the API to your prod domain if it's not in the list.
4. **Admin access**: Set `ADMIN_EMAILS` (comma-separated) on the API to grant `/admin/*` endpoint access.
5. **Smoke test**: `https://<frontend-url>/health` + `https://<api-url>/docs`, then a full Google login → YouTube URL → clip generation flow.

---

## 7. What Changed (Migration Guide for Existing Deployments)

If you already have ShortClipr running on the OLD architecture (single `shortclipr-worker`), here's the exact sequence to migrate to the new split-worker + retention/showcase changes.

### 7.1 One-time DB migration
Run in Supabase SQL Editor (idempotent — safe if any partially applied):
```sql
-- Run each in order
-- backend/migrations/004_pgboss_queue.sql   (if not already applied)
-- backend/migrations/005_split_workers.sql
-- backend/migrations/006_clip_retention.sql
```

Verify with:
```sql
-- Should show pipeline_stage, target_api_region, target_ffmpeg_region, ffmpeg_payload
\d jobs

-- Should show is_showcased
\d clips
```

### 7.2 Deploy the two new workers + watcher
Follow **section 4.2 (API workers)**, **4.3 (FFmpeg workers)**, and **4.4 (watcher)** above.

### 7.3 Cut over the API service
On `shortclipr-api`:
1. **Add** env vars: `API_WORKER_URLS`, `API_WORKER_REGIONS`, `FFMPEG_WORKER_URLS`, `FFMPEG_WORKER_REGIONS`.
2. **Remove** (or leave as-is — they're just ignored now): `WORKER_SERVICE_URL`, `WORKER_SERVICE_URLS`, `OPENAI_MODEL`, `GCP_PROJECT_ID`, `WORKER_QUEUE_NAMES`, `WORKER_QUEUE_REGIONS`.
3. **Redeploy**. New jobs will insert with `pipeline_stage='api'` and go through the watcher.

### 7.4 Drain and delete the old unified worker
1. Wait until no jobs are running against `shortclipr-worker` (check Cloud Run metrics for request activity).
2. Delete `shortclipr-worker-us-central1` (and per-region copies) from Cloud Run.
3. Delete the `shortclipr-worker` trigger in Cloud Build if you no longer need it.
4. Delete `backend/cloudbuild-worker.yaml` if you want — it's marked deprecated in the header but harmless if kept.

### 7.5 Frontend retention window change
No env var — the change is baked into the JS bundle. Just **redeploy the frontend** to pick up the 24h → 15 days rollover in [Dashboard.jsx](src/pages/Dashboard.jsx) + [ClipsHistory.jsx](src/pages/ClipsHistory.jsx). Existing clips stay visible in the UI longer automatically.

**If you have a GCS Lifecycle rule set to < 15 days** (Section 1.2 step 3): **change it** to ≥ 30 days OR remove it. Otherwise the frontend will show clips whose GCS files were already deleted → broken video cards.

### 7.6 Verify the showcase protection is live
1. As an admin (email in `ADMIN_EMAILS`), pick any clip and add it to the showcase from `/admin` UI.
2. Verify in Supabase:
   ```sql
   SELECT clip_id, is_showcased FROM clips WHERE clip_id = '<the-clip-id>';
   -- should return is_showcased = true
   ```
3. As the user who owns that clip, try deleting the parent job.
4. Verify the showcased clip **still exists** in the `clips` table AND the GCS file at `clips/{job_id}/{clip_id}.mp4` still resolves.
5. Non-showcased clips of the same job should be gone.

### 7.7 GPT model change
The model is now pinned at `gpt-5-nano` in [backend/app/pipeline/ai_clipper.py:43](backend/app/pipeline/ai_clipper.py:43) (`CLIP_MODEL`). To switch models later, edit that constant and redeploy the API worker — **no env var override on purpose**, since a model swap can affect prompt tuning and cost accounting.

Verify the new model is being used by hitting `/docs` on a worker instance or checking the API-worker logs for a line like:
```
gpt-5-nano request — 400 entries, 10 chunks, want 10 clips
```

### 7.8 Rollback plan (if something breaks)
- **Split workers acting up?** On `shortclipr-api`, unset `API_WORKER_URLS` + `FFMPEG_WORKER_URLS` and redeploy. It falls back to in-process unified pipeline. Existing `status='created'` / `api_done` jobs get picked up by the watcher (if still running) or the manual reconciliation endpoint `POST /internal/reconcile-stuck-jobs`.
- **Watcher acting up?** Watcher self-restarts on crash; if truly stuck, restart the service in Cloud Run. Manual fallback: hit `POST /internal/reconcile-stuck-jobs` on `shortclipr-api` to sweep stuck jobs and refund users.
- **Migration 006 broken?** Revert with `ALTER TABLE clips DROP COLUMN is_showcased;` — the delete-path code guards against missing rows (returns empty list from `get_showcased_clip_ids_for_job` if column is missing? No — this would crash. Only revert with the code deployed on a matching revision).

---

## 8. Ongoing Operations

### 8.1 Where things live
| Concern | Location |
|---------|----------|
| Plan limits (credits / minutes per plan) | `backend/app/core/plan_limits.py` |
| GPT model | `backend/app/pipeline/ai_clipper.py` (`CLIP_MODEL` constant) |
| Prompt tuning | `backend/app/pipeline/ai_clipper.py` (`_CHUNK_SYSTEM_PROMPT`) |
| Duration flex tolerance | `backend/app/pipeline/ai_clipper.py` (`END_SNAP_TOLERANCE`) |
| Clip retention (frontend) | `src/pages/Dashboard.jsx` (`CLIP_RETENTION_MS`) + `src/pages/ClipsHistory.jsx` |
| Worker soft caps | Watcher env vars: `API_REGION_SOFT_CAP` / `FFMPEG_REGION_SOFT_CAP` |
| Stuck-job reconciliation window | `RECONCILE_STUCK_MINUTES` on watcher, `RECONCILE_STUCK_JOB_MINUTES` on API |

### 8.2 Common ops tasks

**Change a plan's clip count**: edit `backend/app/core/plan_limits.py` → redeploy API + all workers → also update the matching entries in `src/components/Pricing.jsx` + `src/pages/Billing.jsx` and rebuild the frontend.

**Change the FFmpeg concurrency**: edit `backend/cloudbuild-ffmpeg-worker.yaml` (`--concurrency`), match `FFMPEG_REGION_SOFT_CAP` on the watcher, redeploy both. Higher = more contention per instance but more throughput; sweet spot is 2 on 4 vCPU / 8Gi.

**Increase clip retention**: edit `CLIP_RETENTION_MS` in `src/pages/Dashboard.jsx` and `RETENTION_MS` in `src/pages/ClipsHistory.jsx` → rebuild frontend. Also confirm the GCS Lifecycle rule (if any) is looser than the new value.

**Add a new region for FFmpeg**: deploy `shortclipr-ffmpeg-worker-{new-region}` via cloudbuild-ffmpeg-worker.yaml, append its URL + region to `FFMPEG_WORKER_URLS` + `FFMPEG_WORKER_REGIONS` on both `shortclipr-api` AND `shortclipr-watcher`, redeploy both.

### 8.3 Monitoring what to watch

- **Cloud Run → shortclipr-watcher → Logs**: look for `Watcher starting (SPLIT MODE)` on cold start, then periodic `Poll: dispatched N job(s)` and `Reconciled N stuck job(s)` lines.
- **Cloud Run → shortclipr-ffmpeg-worker-* → CPU utilization**: if pegged at 100% for hours = time to add another region or bump max-instances.
- **Postgres query for backlog**:
  ```sql
  SELECT status, pipeline_stage, count(*)
  FROM jobs
  WHERE status NOT IN ('completed', 'failed', 'cancelled')
  GROUP BY status, pipeline_stage
  ORDER BY 3 DESC;
  ```
  If you see many `api_done` rows piling up = FFmpeg workers are the bottleneck. If many `created` = API workers can't keep up (unlikely at 60 concurrent slots).
- **Alert on stuck jobs**:
  ```sql
  SELECT count(*) FROM jobs
  WHERE status IN ('created','api_processing','api_done','ffmpeg_processing')
    AND created_at < NOW() - INTERVAL '30 minutes';
  ```
  Anything > 0 means the reconciliation loop isn't catching everything — check watcher logs.


EMPTY BUILD