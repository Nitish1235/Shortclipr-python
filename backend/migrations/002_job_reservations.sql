-- ────────────────────────────────────────────────────────────
-- Reserved video-minutes per job — needed for the stuck-job
-- reconciliation sweep (app/api/internal.py reconcile_stuck_jobs) to know
-- exactly how much to refund. clip_count already doubles as
-- reserved_credits (jobs.py sets it to the reserved amount before INSERT),
-- but reserved video-minutes had no per-job column until now — it only
-- ever lived transiently in the dispatch payload sent to the worker.
-- ────────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reserved_video_minutes NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at);
-- ^ used by reconcile_stuck_jobs to find status='queued' rows older than N minutes
