-- Give the Free plan one 10-second short per month.
-- Preserve spent and in-flight reserved render time for existing Free accounts.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_duration_seconds_check;
ALTER TABLE projects ADD CONSTRAINT projects_duration_seconds_check
    CHECK (duration_seconds IN (10, 15, 20, 30, 45, 60));

UPDATE credit_accounts AS account
SET total_credits = GREATEST(10, account.spent_credits + account.reserved_credits)
FROM users
WHERE users.id = account.user_id
  AND users.plan = 'free';
