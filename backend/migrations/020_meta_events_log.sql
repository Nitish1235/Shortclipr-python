CREATE TABLE IF NOT EXISTS meta_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_meta_events_created_at ON meta_events_log(created_at DESC);
