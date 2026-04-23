-- ShortClipr Users Table Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    google_sub TEXT DEFAULT '',
    plan TEXT DEFAULT 'free',
    credits_used INTEGER DEFAULT 0,
    credits_limit INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- If table already exists, add any missing columns safely
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_limit INTEGER DEFAULT 3;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create jobs table if it doesn't exist
CREATE TABLE IF NOT EXISTS jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    youtube_url TEXT NOT NULL,
    video_title TEXT DEFAULT '',
    video_duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    current_step TEXT DEFAULT '',
    clip_count INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Create clips table if it doesn't exist
CREATE TABLE IF NOT EXISTS clips (
    clip_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(job_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    clip_url TEXT DEFAULT '',
    thumbnail_url TEXT DEFAULT '',
    duration FLOAT DEFAULT 0,
    start_time FLOAT DEFAULT 0,
    end_time FLOAT DEFAULT 0,
    transcript_snippet TEXT DEFAULT '',
    viral_score FLOAT DEFAULT 0,
    top_title TEXT DEFAULT '',
    bottom_tag TEXT DEFAULT '',
    caption_style TEXT DEFAULT 'minimal',
    ai_reason TEXT DEFAULT '',
    editor_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Supabase Realtime on jobs and clips (for live frontend updates)
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE clips;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
