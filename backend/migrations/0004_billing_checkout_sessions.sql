BEGIN;

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
    session_id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan text NOT NULL CHECK (plan IN ('studio','pro')),
    status text NOT NULL DEFAULT 'created',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS billing_checkout_sessions_user_idx ON billing_checkout_sessions(user_id, created_at DESC);

COMMIT;
