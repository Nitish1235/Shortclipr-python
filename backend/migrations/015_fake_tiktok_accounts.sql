-- ═══════════════════════════════════════════════════════════════════
-- Migration 015: Fake TikTok account mockups — admin-only clip staging
-- ═══════════════════════════════════════════════════════════════════
--
-- Lets the admin build multiple mock TikTok profiles (avatar, handle,
-- display name, bio, stats) and file any generated clip — from either
-- product (YT-Shorts `clips` or Brainrot `brainrot_jobs`) — into one of
-- them, rendered as a TikTok-style profile grid in the admin panel.
--
-- Internal tool only: nothing here is public-facing or posted to TikTok.
-- Clips are referenced by URL (not copied to a new GCS location), so
-- deleting an account/clip row here never touches the source job/clip.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fake_tiktok_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle        TEXT NOT NULL,               -- without leading '@'
    display_name  TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT NOT NULL DEFAULT '',
    followers     TEXT NOT NULL DEFAULT '0',    -- display strings (admin-set, e.g. "12.4K")
    following     TEXT NOT NULL DEFAULT '0',
    likes         TEXT NOT NULL DEFAULT '0',
    verified      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fake_tiktok_account_clips (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID NOT NULL REFERENCES fake_tiktok_accounts(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,                -- 'ytshorts' | 'brainrot'
    job_id        TEXT NOT NULL,
    clip_id       TEXT,                         -- null for brainrot (one output per job)
    title         TEXT NOT NULL DEFAULT '',
    video_url     TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    caption       TEXT NOT NULL DEFAULT '',
    likes         TEXT NOT NULL DEFAULT '',
    comments      TEXT NOT NULL DEFAULT '',
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fake_tiktok_account_clips_account_id ON fake_tiktok_account_clips(account_id);

COMMENT ON TABLE fake_tiktok_accounts IS
    'Admin-only mock TikTok profiles used to preview/organize generated clips as a TikTok-style grid. Not connected to real TikTok.';
COMMENT ON TABLE fake_tiktok_account_clips IS
    'Clips filed into a mock account, referenced by URL from the source job (ytshorts clips or brainrot_jobs) — never copied.';
