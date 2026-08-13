-- ═══════════════════════════════════════════════════════════════════
-- Migration 010: Brainrot split-worker support
-- ═══════════════════════════════════════════════════════════════════
--
-- Adds region-tracking columns to brainrot_jobs so the watcher can:
--   1. Track which API worker region is processing the script/TTS stage
--   2. Track which Brainrot FFmpeg worker region is doing the render
--
-- Also adds pg_notify triggers so the watcher wakes immediately on:
--   - INSERT (new brainrot job created)  → channel 'brainrot_new'
--   - status UPDATE to 'api_done'        → channel 'brainrot_api_done'
--
-- This mirrors the main pipeline's new_job / api_done LISTEN channels.
-- ═══════════════════════════════════════════════════════════════════

-- Add region-tracking columns (nullable — only set when a worker claims the job)
ALTER TABLE brainrot_jobs
    ADD COLUMN IF NOT EXISTS target_api_region      TEXT,
    ADD COLUMN IF NOT EXISTS target_brainrot_region TEXT;

-- Index the 'api_done' status for fast FFmpeg queue claim queries
CREATE INDEX IF NOT EXISTS idx_brainrot_jobs_api_done
    ON brainrot_jobs(status, updated_at)
    WHERE status = 'api_done';

-- ── pg_notify triggers ────────────────────────────────────────────

-- Fires on INSERT: wakes the watcher to dispatch the new job to the API stage
CREATE OR REPLACE FUNCTION notify_brainrot_new()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('brainrot_new', NEW.job_id::text);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brainrot_new ON brainrot_jobs;
CREATE TRIGGER trg_brainrot_new
    AFTER INSERT ON brainrot_jobs
    FOR EACH ROW EXECUTE FUNCTION notify_brainrot_new();


-- Fires when the API stage worker flips status to 'api_done':
-- wakes the watcher to dispatch the FFmpeg render stage
CREATE OR REPLACE FUNCTION notify_brainrot_api_done()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'api_done' AND OLD.status != 'api_done' THEN
        PERFORM pg_notify('brainrot_api_done', NEW.job_id::text);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brainrot_api_done ON brainrot_jobs;
CREATE TRIGGER trg_brainrot_api_done
    AFTER UPDATE ON brainrot_jobs
    FOR EACH ROW EXECUTE FUNCTION notify_brainrot_api_done();

-- ── updated_at auto-update ─────────────────────────────────────────
-- Ensure updated_at stays current for the reconciler's stuck-job sweep

CREATE OR REPLACE FUNCTION set_brainrot_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brainrot_updated_at ON brainrot_jobs;
CREATE TRIGGER trg_brainrot_updated_at
    BEFORE UPDATE ON brainrot_jobs
    FOR EACH ROW EXECUTE FUNCTION set_brainrot_updated_at();
