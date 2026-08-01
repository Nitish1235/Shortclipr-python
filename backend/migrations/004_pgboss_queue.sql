-- ────────────────────────────────────────────────────────────
-- pg-boss queue columns on the jobs table.
--
-- Replaces Google Cloud Tasks with Postgres LISTEN/NOTIFY + a
-- watcher service. The jobs table itself becomes the queue —
-- no external queue service needed.
--
-- New status flow:
--   created → dispatched → processing → completed / failed
--
-- Safe to re-run (IF NOT EXISTS / idempotent guards).
-- ────────────────────────────────────────────────────────────

-- Which worker region the watcher dispatched this job to
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_region TEXT;

-- Dispatch retry counter (incremented on each failed dispatch attempt)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Delayed dispatch: watcher ignores rows where start_after > NOW()
-- Used for exponential backoff on retry
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_after TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- When the watcher dispatched to the worker (NULL = not yet dispatched)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- Full payload the watcher sends to /internal/pipeline/run
-- Stored at INSERT time so the watcher doesn't need to reconstruct it
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS queue_payload JSONB;


-- ── Indexes for the watcher's hot paths ─────────────────────

-- Claim query: SELECT ... WHERE status='created' AND start_after <= NOW()
-- Partial index — only 'created' rows are scanned, completed/failed are excluded
CREATE INDEX IF NOT EXISTS idx_jobs_queue_claim
    ON jobs(start_after, created_at)
    WHERE status = 'created';

-- Per-region active job count: used by watcher to enforce soft cap
CREATE INDEX IF NOT EXISTS idx_jobs_active_region
    ON jobs(target_region)
    WHERE status IN ('dispatched', 'processing');


-- ── Migrate any existing 'queued' rows to the new status ────
-- During rollout, jobs inserted by the old Cloud Tasks path sit
-- at status='queued'. Move them to 'created' so the watcher picks
-- them up. Safe no-op if no 'queued' rows exist.
UPDATE jobs SET status = 'created' WHERE status = 'queued';
