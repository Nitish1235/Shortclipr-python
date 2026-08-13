-- ── 011_gameplay_dispatch.sql ────────────────────────────────────────────────
-- Adds watcher dispatch tracking columns to brainrot_gameplay_sources so the
-- gameplay YouTube clipping pipeline can be dispatched to the ffmpeg-worker
-- service (instead of running in-process on the API server).
--
-- Also stores video_id and category directly on the source row so the ffmpeg
-- worker can read everything it needs without a separate queue_payload JSONB.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add dispatch tracking columns
ALTER TABLE brainrot_gameplay_sources
    ADD COLUMN IF NOT EXISTS video_id            TEXT,
    ADD COLUMN IF NOT EXISTS category_cached     TEXT,
    ADD COLUMN IF NOT EXISTS target_ffmpeg_region TEXT,
    ADD COLUMN IF NOT EXISTS dispatched_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS retry_count         INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS start_after         TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Re-define the status check values (processing | ready | failed → created | processing | ready | failed)
-- 'created' = inserted by API, waiting for watcher to pick up
-- Existing rows stay 'processing' (they were launched in-process before this migration) — no back-fill needed.

-- Index: watcher polls for rows WHERE status='created' AND start_after <= NOW()
CREATE INDEX IF NOT EXISTS idx_brainrot_gameplay_sources_dispatch
    ON brainrot_gameplay_sources (status, start_after)
    WHERE status = 'created';

-- Index: reconcile sweep looks at dispatched_at for stuck rows
CREATE INDEX IF NOT EXISTS idx_brainrot_gameplay_sources_dispatched
    ON brainrot_gameplay_sources (status, dispatched_at)
    WHERE status = 'processing';

-- ── Postgres NOTIFY trigger ───────────────────────────────────────────────────
-- Fires pg_notify('gameplay_new', source_id) when a row with status='created'
-- is inserted. Watcher LISTENs on this channel for instant dispatch (no 15s
-- poll delay).

CREATE OR REPLACE FUNCTION notify_gameplay_new() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'created' THEN
        PERFORM pg_notify('gameplay_new', NEW.id::text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gameplay_new_trigger ON brainrot_gameplay_sources;
CREATE TRIGGER gameplay_new_trigger
    AFTER INSERT ON brainrot_gameplay_sources
    FOR EACH ROW
    EXECUTE FUNCTION notify_gameplay_new();

COMMENT ON COLUMN brainrot_gameplay_sources.video_id IS
    'YouTube video ID extracted by the API server — read by the ffmpeg worker to resolve DASH streams.';
COMMENT ON COLUMN brainrot_gameplay_sources.category_cached IS
    'Denormalised copy of category for the ffmpeg worker (avoids needing a separate queue_payload).';
COMMENT ON COLUMN brainrot_gameplay_sources.target_ffmpeg_region IS
    'Cloud Run region of the ffmpeg-worker instance currently processing this source.';
COMMENT ON COLUMN brainrot_gameplay_sources.dispatched_at IS
    'Timestamp when the watcher dispatched this source to the ffmpeg worker.';
COMMENT ON COLUMN brainrot_gameplay_sources.retry_count IS
    'How many times dispatch has been retried due to worker HTTP errors.';
COMMENT ON COLUMN brainrot_gameplay_sources.start_after IS
    'Earliest time this source may be dispatched (supports exponential backoff on retry).';
