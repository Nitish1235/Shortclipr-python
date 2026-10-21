-- Make Dodo subscription updates safe under webhook retries and reordering.

CREATE TABLE IF NOT EXISTS dodo_webhook_events (
    webhook_id       TEXT PRIMARY KEY,
    event_type       TEXT NOT NULL,
    event_created_at TIMESTAMPTZ,
    processed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dodo_webhook_events_processed_at
    ON dodo_webhook_events(processed_at);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS dodo_event_at TIMESTAMPTZ;

COMMENT ON COLUMN users.dodo_event_at IS
    'Timestamp of the newest Dodo entitlement event applied to this user; older webhook deliveries are ignored.';

COMMENT ON TABLE dodo_webhook_events IS
    'Durable idempotency ledger for Dodo webhook-id values.';
