-- ═══════════════════════════════════════════════════════════════════
-- Migration 016: Brainrot gets its own plan/credits — fully separate
-- from YT-Shorts, as its own paid product. Before this, jobs.py and
-- brainrot.py both hit the same credits_used/credits_limit columns via
-- reserve_credits()/release_credits() — one shared pool for two products.
-- ═══════════════════════════════════════════════════════════════════
--
-- Mirrors the existing plan / credits_used / credits_limit /
-- credits_reset_at columns exactly, just brainrot-scoped and fully
-- independent — nothing here is read or written by any YT-Shorts code
-- path. reserve_brainrot_credits() / release_brainrot_credits() in
-- db/supabase.py are the brainrot-scoped forks of reserve_credits()/
-- release_credits() that read/write these; brainrot.py, brainrot_stage.py,
-- and watcher/dispatcher.py's _refund_brainrot_job() all switch to them.
--
-- Tier structure + prices: see backend/app/core/brainrot_plan_limits.py.
-- Real Dodo Payments product/price IDs for the paid brainrot tiers are
-- still pending — see DODO_PRODUCT_BRAINROT_* in config.py and
-- BRAINROT_PRODUCT_IDS in payments.py. Until those are filled in,
-- checkout for a paid brainrot plan returns 503 "not configured" —
-- same graceful-degradation behavior an unconfigured YT-Shorts tier has.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS brainrot_plan             TEXT        NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS brainrot_credits_used     INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS brainrot_credits_limit    INTEGER     NOT NULL DEFAULT 2;
ALTER TABLE users ADD COLUMN IF NOT EXISTS brainrot_credits_reset_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_brainrot_plan ON users(brainrot_plan);

COMMENT ON COLUMN users.brainrot_plan IS
    'Brainrot-specific plan tier — fully independent of `plan` (YT-Shorts). See brainrot_plan_limits.py.';
COMMENT ON COLUMN users.brainrot_credits_used IS
    'Brainrot clips generated this billing month — independent counter from credits_used, reset on its own brainrot_credits_reset_at cycle.';
COMMENT ON COLUMN users.brainrot_credits_limit IS
    'Max brainrot clips/month for the current brainrot_plan — independent of credits_limit (YT-Shorts).';
