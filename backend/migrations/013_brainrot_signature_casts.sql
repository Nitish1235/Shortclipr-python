-- ═══════════════════════════════════════════════════════════════════
-- Migration 013: Brainrot signature casts — saved character pairs
-- ═══════════════════════════════════════════════════════════════════
--
-- Lets a creator save a favorite character pair ("my go-to duo") and
-- reload it in one tap instead of re-picking from the 105-character
-- roster every session. Per the studio design pass: the single highest-
-- leverage retention lever available, because it removes the hardest
-- decision (who's in this one) on every return visit.
--
-- character_ids stores the roster ids in side order [left, right] —
-- resolved against the live roster on load, not denormalized, so a
-- saved cast always reflects current character art/voice.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brainrot_signature_casts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label            TEXT,
    character_ids    TEXT[] NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brainrot_signature_casts_user_id ON brainrot_signature_casts(user_id);

COMMENT ON TABLE brainrot_signature_casts IS
    'User-saved character pairs for the Brainrot studio "signature cast" quick-load feature. character_ids is [left_id, right_id]; resolved against the live roster on load.';
