-- ═══════════════════════════════════════════════════════════════════
-- Migration 005: Split workers — API worker + FFmpeg worker
-- ═══════════════════════════════════════════════════════════════════
--
-- Splits the unified worker into two specialized Cloud Run services:
--   • API Worker    (4 vCPU + 2GB, ~12 concurrent) — metadata / transcript / GPT
--   • FFmpeg Worker (4 vCPU + 8GB, ~2 concurrent)  — DASH / encode / upload
--
-- Handoff mechanism:
--   1. API worker writes `ffmpeg_payload` (JSONB) with clip timestamps + options
--   2. API worker sets status='api_done' → trigger fires pg_notify('api_done', job_id)
--   3. Watcher LISTENs on 'api_done' → claims + dispatches to FFmpeg worker
--   4. FFmpeg worker reads ffmpeg_payload from DB, runs its stage, completes job
--
-- Status flow (new):
--   created → api_processing → api_done → ffmpeg_processing → completed / failed
-- ═══════════════════════════════════════════════════════════════════

-- ── Columns on jobs table ──────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'api';
-- ^ 'api' while waiting for / running the API stage
--   'ffmpeg' after api_done — waiting for / running the FFmpeg stage
--   Used by the watcher's per-stage queue queries.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_api_region    TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_ffmpeg_region TEXT;
-- ^ Two separate region assignments — the API and FFmpeg workers for a job
--   can be in different regions (watcher picks each independently based on
--   per-pool load).

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS api_dispatched_at    TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS api_completed_at     TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ffmpeg_dispatched_at TIMESTAMPTZ;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ffmpeg_payload JSONB;
-- ^ Written by API worker on success. Contains everything the FFmpeg worker
--   needs to run its stage WITHOUT re-doing the API work:
--     {
--       "timestamps":     [{"start", "end", "title", "reason", "viral_score", ...}, ...],
--       "options":        {...merged pipeline options...},
--       "video_metadata": {"title": "...", "duration": 3600},
--       "gateway_start": 0, "gateway_end": 3600,
--       "transcript":     [...trimmed to gateway window...],
--       "stream_url":     "...",  -- cached; re-resolved if expired
--       "audio_url":      "...",
--       "user_agent":     "..."
--     }

-- ── Partial indexes for the watcher's dual-queue queries ───────

-- API queue: jobs waiting for API stage
CREATE INDEX IF NOT EXISTS idx_jobs_api_queue
    ON jobs(created_at)
    WHERE status = 'created' AND pipeline_stage = 'api';

-- FFmpeg queue: jobs whose API stage is done, waiting for FFmpeg
CREATE INDEX IF NOT EXISTS idx_jobs_ffmpeg_queue
    ON jobs(api_completed_at)
    WHERE status = 'api_done';

-- Per-region active-job counting (soft cap enforcement)
CREATE INDEX IF NOT EXISTS idx_jobs_api_active_region
    ON jobs(target_api_region)
    WHERE status = 'api_processing' AND target_api_region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_ffmpeg_active_region
    ON jobs(target_ffmpeg_region)
    WHERE status = 'ffmpeg_processing' AND target_ffmpeg_region IS NOT NULL;

-- ── Trigger: notify watcher when a job reaches 'api_done' ──────
-- Complements the API-side pg_notify('new_job', ...) fired by jobs.py.
-- Using a trigger for api_done (instead of app-code pg_notify) makes the
-- notification atomic with the status change — impossible for the API
-- worker to update status and crash before firing the notify.
CREATE OR REPLACE FUNCTION notify_api_done() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'api_done' AND OLD.status IS DISTINCT FROM 'api_done' THEN
        PERFORM pg_notify('api_done', NEW.job_id::TEXT);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_api_done_notify ON jobs;
CREATE TRIGGER jobs_api_done_notify
    AFTER UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION notify_api_done();

-- ── Migrate any in-flight rows from the old status vocabulary ──
-- 004 introduced 'created'/'dispatched'/'processing'. 005 splits 'processing'
-- into 'api_processing' → 'api_done' → 'ffmpeg_processing'. During rollout:
--   - 'created' rows haven't started yet — set pipeline_stage='api' so the
--     new watcher picks them up on the API queue.
--   - 'dispatched' rows were about to run the unified pipeline — same treatment,
--     let them re-enter the API queue (idempotent; API stage is safe to retry).
--   - 'processing' rows are actively running the unified pipeline; leave them
--     alone — they'll complete naturally under the OLD orchestrator that was
--     serving them when they were dispatched.
UPDATE jobs SET pipeline_stage = 'api'
WHERE status IN ('created', 'dispatched') AND pipeline_stage IS DISTINCT FROM 'api';

-- ── Column comments (documentation, no runtime effect) ─────────
COMMENT ON COLUMN jobs.pipeline_stage        IS 'Which stage of the split pipeline: "api" or "ffmpeg"';
COMMENT ON COLUMN jobs.target_api_region     IS 'Region assigned by watcher for API-stage worker';
COMMENT ON COLUMN jobs.target_ffmpeg_region  IS 'Region assigned by watcher for FFmpeg-stage worker';
COMMENT ON COLUMN jobs.api_dispatched_at     IS 'When watcher dispatched to an API worker';
COMMENT ON COLUMN jobs.api_completed_at      IS 'When API worker finished + wrote ffmpeg_payload';
COMMENT ON COLUMN jobs.ffmpeg_dispatched_at  IS 'When watcher dispatched to an FFmpeg worker';
COMMENT ON COLUMN jobs.ffmpeg_payload        IS 'Bundle of clip timestamps + options + transcript for the FFmpeg worker';
