-- ═══════════════════════════════════════════════════════════════════
-- Migration 014: Brainrot credit reservation + retry-exhaustion
-- ═══════════════════════════════════════════════════════════════════
--
-- Two gaps this closes, found in a billing-correctness audit:
--
-- 1. Brainrot jobs never reserved a credit at all (POST /brainrot/jobs
--    had no reserve_credits() call) — every brainrot clip was free
--    regardless of plan. Now fixed at the API layer (reserves 1 credit,
--    stored as payload->>'reserved_credits'); this migration doesn't add
--    a column for that since it already lives in the existing payload
--    JSONB, no schema change needed for the reservation itself.
--
-- 2. brainrot_jobs had no retry_count, so a permanently-stuck dispatch
--    (e.g. a dead API/FFmpeg worker) retried forever in the watcher's
--    reconcile_stuck() sweep — never completing, never failing, and its
--    reserved credit sitting in limbo indefinitely. Mirrors the `jobs`
--    table's existing retry_count + give-up-after-MAX_RETRIES pattern.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE brainrot_jobs ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN brainrot_jobs.retry_count IS
    'Dispatch retry attempts (API or FFmpeg stage). At config.MAX_RETRIES the watcher gives up, marks the job failed, and refunds its reserved credit — see release_brainrot_api_for_retry / release_brainrot_ffmpeg_for_retry in watcher/dispatcher.py.';
