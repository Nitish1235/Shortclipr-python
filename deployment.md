# ShortClipr Deployment Guide (Manual Console UI)

This guide provides step-by-step instructions for deploying ShortClipr to production manually using the Google Cloud Console, Supabase Dashboard, and Upstash Console. No CLI commands are required for deployment.

## 1. Google Cloud Platform (GCP) Setup (Console)

### 1.1 Project & APIs
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `shortclipr-prod`) from the project selector dropdown at the top.
3. In the search bar, search for and enable the following APIs:
   - **Cloud Run API**
   - **Artifact Registry API**
   - **Secret Manager API**
   - **Cloud Storage API**

### 1.2 Storage Bucket
1. Navigate to **Cloud Storage > Buckets** in the left menu.
2. Click **Create**. Name it (e.g., `shortclipr-clips`), choose a region, and leave other settings as default.
3. Once created, go to the **Permissions** tab of the bucket.
4. Click **Grant Access**. Add principal `allUsers` and assign the role **Storage Object Viewer** (if you want direct public URLs).
5. Go to the **Lifecycle** tab and add a rule to delete objects older than 7 days to save costs.

### 1.3 Service Account & Secrets
1. Navigate to **IAM & Admin > Service Accounts**.
2. Click **Create Service Account** (e.g., `shortclipr-sa`).
3. Grant it the roles: **Storage Object Admin** and **Secret Manager Secret Accessor**.
4. To add secrets (like API keys), go to **Security > Secret Manager**, click **Create Secret**, paste your values, and ensure your service account has access.

---

## 2. Database Setup (Supabase Dashboard)

### 2.1 Table Schema
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** and run scripts to create your tables:
   - `users`: Profile and plan info.
   - `jobs`: Video processing state.
   - `clips`: Generated clip metadata.

### 2.2 Row Level Security (RLS)
Still in the **SQL Editor**, apply the following policies:
```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "user_profile_policy" ON users FOR ALL USING (id = auth.uid());

-- Users can only see their own jobs
CREATE POLICY "user_jobs_policy" ON jobs FOR ALL USING (user_id = auth.uid());

-- Users can only see their own clips
CREATE POLICY "user_clips_policy" ON clips FOR ALL USING (user_id = auth.uid());
```

---

## 3. Backend Deployment (Cloud Run Console)

*Assumption: Your code is hosted on GitHub.*

### 3.1 Deploy API Service
1. In Google Cloud Console, navigate to **Cloud Run**.
2. Click **Create Service**.
3. Select **Continuously deploy from a repository** and click **Setup Cloud Build**.
4. Connect your GitHub repository and select the `main` branch.
5. In the Build Configuration, select **Dockerfile**. Set the source location to `/backend/Dockerfile`.
6. Click **Save**.
7. Set the service name to `shortclipr-api` and region to `us-central1`.
8. Under **Authentication**, choose **Allow unauthenticated invocations**.
9. Expand **Container, Networking, Security**.
   - Under **Variables & Secrets**, add all your backend environment variables (from your `.env`) as Environment Variables or reference them from Secret Manager.
10. Click **Create**. Cloud Run will build and deploy your API.

### 3.2 Deploy Worker Service
The worker processes jobs in the background and should not be publicly accessible.
1. Go back to the **Cloud Run** services list and click **Create Service**.
2. Repeat the GitHub connection steps (steps 3-6 above).
3. Set the service name to `shortclipr-worker`.
4. Under **Authentication**, choose **Require authentication**.
5. Expand **Container, Networking, Security**.
   - Under **Settings**, change the **Container Command** to `python` and **Container Arguments** to `-m app.queue.consumer`.
   - Set **Minimum instances** to `1`.
   - Add your environment variables exactly as you did for the API.
6. Click **Create**.

---

## 4. Frontend Deployment (Vercel/Netlify Dashboard)

Deploying a Vite React app is easiest via Vercel or Netlify.
1. Log into [Vercel](https://vercel.com/) or [Netlify](https://netlify.com/).
2. Click **Add New Project** and import your GitHub repository.
3. The platform will auto-detect Vite. The build command should be `npm run build` and output directory `dist`.
4. Add your frontend environment variables (`VITE_API_URL` pointing to your new Cloud Run API URL, `VITE_GOOGLE_CLIENT_ID`, etc.).
5. Click **Deploy**.

---

## 5. Post-Deployment Configuration
1. **Google OAuth**: Go to GCP **APIs & Services > Credentials**. Update your OAuth Client ID's **Authorized JavaScript origins** and **Authorized redirect URIs** to include your new frontend domain.
2. **Webhooks**: Go to your Dodo Payments dashboard and set the webhook URL to `https://<YOUR_CLOUD_RUN_API_URL>/webhooks/dodo`.
3. **CORS**: Ensure the `ALLOW_ORIGINS` in your backend code (`backend/app/main.py`) or environment variables include your new production frontend URL before you push to GitHub.
