-- Persist Dodo subscription state so paid access has a hard server-side end.
-- Webhooks keep these timestamps current; request-time expiry enforcement in
-- app/db/supabase.py is the safety net when a webhook is delayed or missed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;


-- Existing paid rows predate lifecycle tracking. Give them a bounded migration
-- window instead of either revoking access immediately or leaving it permanent.
-- The next Dodo lifecycle webhook replaces this provisional deadline.
UPDATE users
SET plan_expires_at = NOW() + INTERVAL '31 days',
    subscription_status = 'legacy_active'
WHERE plan NOT IN ('free', 'marketer')
  AND plan_expires_at IS NULL;


CREATE INDEX IF NOT EXISTS idx_users_plan_expiry
    ON users(plan_expires_at)
    WHERE plan <> 'free';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_dodo_subscription_id
    ON users(dodo_subscription_id)
    WHERE dodo_subscription_id IS NOT NULL;

COMMENT ON COLUMN users.plan_expires_at IS
    'End of the currently paid ShortClipr billing period (Dodo next_billing_date). Paid access is downgraded after this timestamp.';
