CREATE TABLE IF NOT EXISTS tiktok_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Index for quick sorting by newest events in admin dashboard
CREATE INDEX idx_tiktok_events_created_at ON tiktok_events_log(created_at DESC);
