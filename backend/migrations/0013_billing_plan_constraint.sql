BEGIN;

-- The original checkout table used the retired plan names `pro` and `studio`.
-- Current Dodo products are Starter, Creator, and Studio.
ALTER TABLE billing_checkout_sessions
    DROP CONSTRAINT IF EXISTS billing_checkout_sessions_plan_check;

ALTER TABLE billing_checkout_sessions
    ADD CONSTRAINT billing_checkout_sessions_plan_check
    CHECK (plan IN ('starter', 'creator', 'studio'));

COMMIT;
