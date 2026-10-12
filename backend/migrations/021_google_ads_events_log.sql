CREATE TABLE IF NOT EXISTS google_ads_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    email TEXT,
    product TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_google_ads_events_created_at
    ON google_ads_events_log(created_at DESC);
