-- ═══════════════════════════════════════════════════════════════════
-- Migration 007: Post-queue feedback survey + free download reward
-- ═══════════════════════════════════════════════════════════════════
--
-- Right after a user queues a job, the frontend offers a short 3-question
-- survey (where they found us, why they're here, what's stopping them
-- from upgrading) plus a free-text comment. Submitting unlocks ONE free
-- clip download for a free-plan user (see app/api/editor.py's download
-- endpoint) — reward is scoped to the specific job they gave feedback on,
-- and to the account overall (UNIQUE(user_id) below means a user can only
-- ever submit once, so there's only ever one reward to consume).
--
-- reward_clip_id starts NULL (reward unused) and gets set to whichever
-- clip_id the user actually downloads for free — the first download
-- consumes it; re-downloading that SAME clip afterward stays allowed
-- (app-level idempotency check, not enforced here).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS job_feedback (
    feedback_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id               UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    source               TEXT,   -- Q1: where they found ShortClipr (fixed option or "other")
    source_other         TEXT,   -- free text when source = 'other'

    visit_reason         TEXT,   -- Q2: why they're here today
    visit_reason_other   TEXT,

    blocker              TEXT,   -- Q3: what's stopping them from upgrading
    blocker_other        TEXT,

    comment              TEXT,   -- free-text: met expectations? liked/disliked?

    reward_clip_id       UUID REFERENCES clips(clip_id) ON DELETE SET NULL,
    -- ^ NULL = the free-download reward from this submission hasn't been
    --   used yet. Set once, on first download, by consume_feedback_reward().

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id)
    -- ^ One feedback submission ever, per account — enforces the "one
    --   free download reward, ever" rule at the DB level too, not just
    --   by hiding the survey client-side after first submit.
);

-- Admin looks up feedback per-job (GET /admin/jobs/{job_id}/feedback).
CREATE INDEX IF NOT EXISTS idx_job_feedback_job_id ON job_feedback(job_id);

COMMENT ON COLUMN job_feedback.reward_clip_id IS
    'NULL = free download reward unused. Set to the clip_id the user downloaded for free once consumed.';
COMMENT ON TABLE job_feedback IS
    'Post-queue product survey (3 MC questions + comment). One row per user ever — UNIQUE(user_id).';
