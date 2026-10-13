-- New ShortClipr accounts can explore the workflow and public examples, but
-- they do not receive generation credits. Existing account balances are left
-- unchanged; this migration only changes defaults for future rows.
ALTER TABLE users
    ALTER COLUMN credits_limit SET DEFAULT 0;

ALTER TABLE users
    ALTER COLUMN video_minutes_limit SET DEFAULT 0;

COMMENT ON COLUMN users.credits_limit IS
    'Monthly ShortClipr clip allowance. New free accounts start at 0; paid plans assign their purchased allowance.';
