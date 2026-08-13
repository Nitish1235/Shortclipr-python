# ShortClipr Brainrot Deployment & Setup Guide

Since you already have the main `/youtube-shorts` pipeline deployed on Cloud Run, deploying the **Brainrot** application is much simpler. **You do NOT need to deploy a separate backend or a separate worker.** 

The Brainrot feature is already fully integrated into the existing `shortclipr-api` (for endpoints) and `shortclipr-ffmpeg-worker` (for processing the script, TTS generation, and rendering). 

Here is the exact step-by-step guide to configure the environment and active Brainrot on your current deployment.

---

## 1. No New Services Required (By Default)
- **Frontend (`shortclipr-frontend`)**: The Brainrot Studio UI is already included in your Vite bundle (`/brainrot`).
- **Backend API (`shortclipr-api`)**: Handles the new `/brainrot/*` endpoints (job creation, asset libraries, characters).
- **Brainrot Worker (Optional)**: The watcher can dispatch Brainrot jobs (`/internal/brainrot-stage/run`) to a dedicated pool (`shortclipr-brainrot-worker`) isolating the compositing workload. If not configured, it safely falls back to the existing `shortclipr-ffmpeg-worker` pool.

---

## 2. Generate Required Environment Variables

You need to add a few new environment variables to both your **API** and **FFmpeg Worker** services. 

### API Keys to gather:
1. **UnrealSpeech API Key** (`UNREALSPEECH_API_KEY`): Used for primary Text-To-Speech generation. (Get an API key from [UnrealSpeech](https://unrealspeech.com/)).
2. **Lemonfox API Key** (`LEMONFOX_API_KEY`): Used for backup/secondary TTS generation. (Get an API key from [Lemonfox](https://lemonfox.ai/)).
3. **OpenAI API Key** (`OPENAI_API_KEY`): Make sure this is already loaded. Brainrot uses `gpt-5-mini` dynamically to write the scripts.

### GCS Bucket for Brainrot Assets:
Brainrot uses its own dedicated Google Cloud Storage bucket (`BRAINROT_GCS_BUCKET_NAME`) for storing character visuals, gameplay backgrounds, and audio clips. It is kept separate from your standard `shortclipr-clips` bucket so you can apply different lifecycle rules (e.g., you don't want to auto-delete your asset library!).

1. Go to **Google Cloud Console → Cloud Storage → Buckets**.
2. **Create a new bucket** (e.g., `shortclipr-brainrot-assets`).
3. Set the region to match your Cloud Run services (e.g., `us-central1`).
4. **Permissions**: Go to the Permissions tab, click **Grant Access**, add principal `allUsers`, and assign the role **Storage Object Viewer**. (This is required so the frontend can display character previews and gameplay thumbnails).

---

## 3. Update Existing Cloud Run Services

You must update the environment variables on the existing Cloud Run services and deploy a new revision.

### Update `shortclipr-api`
Go to **Cloud Run → shortclipr-api → Edit & Deploy New Revision → Variables & Secrets**:
- Add `BRAINROT_GCS_BUCKET_NAME` = `shortclipr-brainrot-assets`
- Add `UNREALSPEECH_API_KEY` = `your_unrealspeech_key` (preferably via Secret Manager)
- Add `LEMONFOX_API_KEY` = `your_lemonfox_key` (preferably via Secret Manager)
- *(Ensure `OPENAI_API_KEY` is already present).*
- **Click Deploy**.

### Update `shortclipr-ffmpeg-worker` (All Regions)
Go to **Cloud Run → shortclipr-ffmpeg-worker-{region} → Edit & Deploy New Revision → Variables & Secrets**:
- Add `BRAINROT_GCS_BUCKET_NAME` = `shortclipr-brainrot-assets`
- Add `UNREALSPEECH_API_KEY` = `your_unrealspeech_key`
- Add `LEMONFOX_API_KEY` = `your_lemonfox_key`
- *(Ensure `OPENAI_API_KEY` is already present).*
- **Click Deploy**.

### (Optional) Deploy a Dedicated Brainrot Worker
To prevent Brainrot renders from competing with normal YouTube Shorts encodes, you can deploy a dedicated worker pool:
1. Create a new Cloud Build trigger using the newly provided `backend/cloudbuild-brainrot-worker.yaml`.
2. This creates `shortclipr-brainrot-worker-{region}`.
3. Configure it with the exact same environment variables as the FFmpeg worker listed above.

### Update `shortclipr-watcher`
To tell the system to use your dedicated Brainrot workers (and to prevent overload), go to **Cloud Run → shortclipr-watcher → Edit & Deploy New Revision → Variables & Secrets**:
- Add `BRAINROT_WORKER_URLS` = `your_brainrot_worker_url` (comma-separated if multiple regions)
- Add `BRAINROT_WORKER_REGIONS` = `us-central1` (match the regions of your urls)
- Add `BRAINROT_REGION_SOFT_CAP` = `4` (adjust based on your region quota, typically 4)
- *(Note: If you skip adding `BRAINROT_WORKER_URLS`, the watcher will automatically fall back to processing Brainrot jobs on the `FFMPEG_WORKER_URLS` pool).*
- **Click Deploy**.

---

## 4. Admin Setup & Asset Seeding

Once the backend possesses the new environment variables, the APIs will start working, but your Brainrot Studio will be empty (no gameplay backgrounds, no characters, no voices).

### A. Add Characters
Characters are loaded via `GET /brainrot/characters`. (See `backend/app/pipeline/brainrot_characters.py` and `docs/brainrot/characters.json` for how the app expects the character schema to look). Ensure character image assets are placed correctly where the app can retrieve them (typically expected in the static library or GCS).

### B. Seed Gameplay Assets & Audio via Admin Panel
1. Navigate to your app's admin panel (Make sure your email is listed in the `ADMIN_EMAILS` env variable on the API).
2. Go to the **Brainrot Admin Module** (`BrainrotAdminPanel.jsx`).
3. **Upload Gameplay clips**: Upload raw gameplay footage (e.g., Minecraft Parkour). The backend will automatically trigger background processing to trim, split into 120s segments, reframe to 9:16 vertical, and upload to the `BRAINROT_GCS_BUCKET_NAME`.
4. **Upload Audio/SFX**: Upload background music and sound effects so users can select them in the Brainrot Studio.

### C. Synthesize Voice Previews
In the Brainrot Admin Panel, trigger the **Voice Generation** command. 
This issues a `POST /brainrot/admin/voices/generate` request. The backend will loop through all available voices in your TTS providers, generate a short "test" phrase, and save it to the Brainrot GCS Bucket so users can preview voices instantly in the frontend picker.

---

## 5. End-to-End Test

1. Visit the **Brainrot Studio** in your frontend app.
2. Select 1 or 2 characters.
3. Provide a prompt (e.g., "Argue about why water isn't wet").
4. Select a background gameplay clip and click Generate.
5. In your Google Cloud Console, check the logs for your `shortclipr-ffmpeg-worker` to watch the process:
   - Generating script (`gpt-5-mini`)
   - Downloading assets
   - Generating TTS
   - FFmpeg rendering
   - Uploading final Brainrot clip!
