-- User-facing credits represent finished render seconds.  This enables the
-- Free plan's one 15-second short and the paid plans' monthly minute pools.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_duration_seconds_check;
ALTER TABLE projects ADD CONSTRAINT projects_duration_seconds_check
    CHECK (duration_seconds IN (15,20,30,45,60));

ALTER TABLE billing_checkout_sessions DROP CONSTRAINT IF EXISTS billing_checkout_sessions_plan_check;
ALTER TABLE billing_checkout_sessions ADD CONSTRAINT billing_checkout_sessions_plan_check
    CHECK (plan IN ('starter','creator','studio'));

UPDATE credit_accounts AS account
SET total_credits = 15,
    spent_credits = 0,
    reserved_credits = 0,
    cycle_started_at = date_trunc('month', now()),
    cycle_ends_at = date_trunc('month', now()) + interval '1 month'
FROM users
WHERE users.id = account.user_id
  AND users.plan = 'free'
  AND account.total_credits = 0;
