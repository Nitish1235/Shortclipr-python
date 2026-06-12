-- ============================================================
-- ShortClipr — Full Database Schema
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- ✅ Safe to re-run on any existing DB.
--    Every statement uses IF NOT EXISTS / ON CONFLICT guards.
--    New columns are added via ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--    so they silently no-op when already present.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- TABLE: users
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    -- Identity
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        UNIQUE NOT NULL,
    full_name       TEXT        NOT NULL DEFAULT '',
    avatar_url      TEXT        NOT NULL DEFAULT '',
    google_sub      TEXT        NOT NULL DEFAULT '',

    -- Plan & shorts quota
    -- credits_limit = max shorts/clips per billing month
    -- Free plan default = 1 (changed from old default of 3)
    plan            TEXT        NOT NULL DEFAULT 'free',
    credits_used    INTEGER     NOT NULL DEFAULT 0,
    credits_limit   INTEGER     NOT NULL DEFAULT 1,

    -- Monthly video-hours quota
    -- video_minutes_limit = max total source-video minutes per billing month
    -- video_minutes_used  = running total this month (ceiling-rounded per job)
    -- Free plan default = 30 min/month, 30 min max per single video
    video_minutes_used    INTEGER     NOT NULL DEFAULT 0,
    video_minutes_limit   INTEGER     NOT NULL DEFAULT 30,

    -- Billing-cycle reset tracker
    -- Set to date_trunc('month', NOW()) on first use / on upgrade.
    -- Both credits_used and video_minutes_used are zeroed when the
    -- current calendar month exceeds this value.
    credits_reset_at  TIMESTAMPTZ,

    -- Social publishing tokens (YouTube refresh token, etc.)
    -- Stored as JSONB: {"youtube": {"refresh_token": "...", ...}}
    social_tokens   JSONB                DEFAULT '{}',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ          DEFAULT NOW()
);

-- ── Idempotent column additions (safe on existing deployments) ─
-- Run these even if the table already exists so older DBs get new columns.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name           TEXT        NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url          TEXT        NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub          TEXT        NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan                TEXT        NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_used        INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_limit       INTEGER     NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS video_minutes_used  INTEGER     NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS video_minutes_limit INTEGER     NOT NULL DEFAULT 30;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_tokens       JSONB        DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ          DEFAULT NOW();

-- ── Backfill video_minutes_limit for existing rows that have it as 0 ─
-- Sets each user's limit based on their current plan.
-- Safe to run multiple times (WHERE clause prevents double-apply).
UPDATE users SET video_minutes_limit = CASE plan
    WHEN 'free'        THEN 30
    WHEN 'starter'     THEN 300
    WHEN 'starter_100' THEN 300
    WHEN 'starter_250' THEN 600
    WHEN 'pro_500'     THEN 1080
    WHEN 'pro_1000'    THEN 2100
    WHEN 'pro_2000'    THEN 3600
    WHEN 'pro'         THEN 3600
    ELSE 30
END
WHERE video_minutes_limit = 0 OR video_minutes_limit IS NULL;

-- ── Backfill credits_limit for existing rows still at old default of 3 ─
UPDATE users SET credits_limit = CASE plan
    WHEN 'free'        THEN 1
    WHEN 'starter'     THEN 20
    WHEN 'starter_100' THEN 100
    WHEN 'starter_250' THEN 250
    WHEN 'pro_500'     THEN 500
    WHEN 'pro_1000'    THEN 1000
    WHEN 'pro_2000'    THEN 2000
    WHEN 'pro'         THEN 999999
    ELSE 1
END
WHERE credits_limit = 3;  -- old default — only update rows that were never explicitly set


-- ────────────────────────────────────────────────────────────
-- TABLE: jobs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    job_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    youtube_url     TEXT        NOT NULL,
    video_title     TEXT        NOT NULL DEFAULT '',
    video_duration  INTEGER     NOT NULL DEFAULT 0,   -- source video length in seconds
    status          TEXT        NOT NULL DEFAULT 'queued',
    -- status values: queued | processing | completed | failed | error
    progress        INTEGER     NOT NULL DEFAULT 0,   -- 0–100 percent
    current_step    TEXT        NOT NULL DEFAULT '',
    clip_count      INTEGER     NOT NULL DEFAULT 0,
    error_message   TEXT                 DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- Idempotent column additions
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_title    TEXT    NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_duration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_message  TEXT             DEFAULT '';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ;


-- ────────────────────────────────────────────────────────────
-- TABLE: clips
-- ────────────────────────────────────────────────────────────
-- NOTE: column is `video_url` (not `clip_url`) — matches Dashboard.jsx
CREATE TABLE IF NOT EXISTS clips (
    clip_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID        NOT NULL REFERENCES jobs(job_id)  ON DELETE CASCADE,
    user_id             UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
    video_url           TEXT        NOT NULL DEFAULT '',  -- GCS public URL for the mp4
    thumbnail_url       TEXT                 DEFAULT '',
    duration            FLOAT       NOT NULL DEFAULT 0,   -- clip length in seconds
    start_time          FLOAT       NOT NULL DEFAULT 0,   -- start offset in source video
    end_time            FLOAT       NOT NULL DEFAULT 0,
    transcript_snippet  TEXT                 DEFAULT '',
    viral_score         FLOAT       NOT NULL DEFAULT 0,
    top_title           TEXT                 DEFAULT '',
    bottom_tag          TEXT                 DEFAULT '',
    caption_style       TEXT        NOT NULL DEFAULT 'minimal',
    ai_reason           TEXT                 DEFAULT '',
    editor_config       JSONB       NOT NULL DEFAULT '{}',  -- subtitle/editor state
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions
ALTER TABLE clips ADD COLUMN IF NOT EXISTS thumbnail_url      TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS transcript_snippet TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS top_title          TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS bottom_tag         TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS ai_reason          TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS editor_config      JSONB NOT NULL DEFAULT '{}';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS raw_video_url      TEXT  DEFAULT '';
ALTER TABLE clips ADD COLUMN IF NOT EXISTS captions_data      JSONB NOT NULL DEFAULT '[]';


-- ────────────────────────────────────────────────────────────
-- REALTIME (Supabase WAL-based live updates)
-- Enables frontend to receive INSERT / UPDATE events without polling
-- ────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE clips;


-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_plan         ON users(plan);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id       ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status        ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_user_status   ON jobs(user_id, status);  -- for concurrent-job check
CREATE INDEX IF NOT EXISTS idx_jobs_created_at    ON jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clips_job_id       ON clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id      ON clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_viral_score  ON clips(viral_score DESC);


-- ────────────────────────────────────────────────────────────
-- PLAN LIMITS REFERENCE  (comment — not a table)
-- ────────────────────────────────────────────────────────────
--
--  Plan           $/mo   credits_limit  video_minutes_limit  max per video
--  ─────────────────────────────────────────────────────────────────────
--  free             $0          1             30 min            30 min
--  starter_100     $10        100            300 min (5 h)     120 min (2 h)
--  starter_250     $25        250            600 min (10 h)    120 min (2 h)
--  pro_500         $45        500           1080 min (18 h)    180 min (3 h)
--  pro_1000        $79       1000           2100 min (35 h)    180 min (3 h)
--  pro_2000       $145       2000           3600 min (60 h)    180 min (3 h)
--  ─────────────────────────────────────────────────────────────────────
--  Legacy plans (existing subscribers — do not remove)
--  starter          —          20            300 min (5 h)     120 min (2 h)
--  pro              —       999999           3600 min (60 h)   360 min (6 h)
-- ────────────────────────────────────────────────────────────
