BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    full_name text NOT NULL DEFAULT '',
    avatar_url text,
    google_sub text,
    password_hash text,
    plan text NOT NULL DEFAULT 'free',
    subscription_status text NOT NULL DEFAULT 'inactive',
    dodo_subscription_id text,
    plan_expires_at timestamptz,
    dodo_event_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_normalized CHECK (email = lower(email))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cycle_started_at timestamptz NOT NULL DEFAULT date_trunc('month', now()),
    cycle_ends_at timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month',
    total_credits integer NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
    spent_credits integer NOT NULL DEFAULT 0 CHECK (spent_credits >= 0),
    reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT credit_account_not_overdrawn CHECK (spent_credits + reserved_credits <= total_credits)
);

CREATE TABLE IF NOT EXISTS projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL,
    brief text NOT NULL,
    clip_type text NOT NULL,
    department text NOT NULL CHECK (department IN ('learn','story','engage')),
    language text NOT NULL,
    voice_id text NOT NULL,
    visual_style text NOT NULL,
    narration_script text,
    audio_object text,
    timestamps_object text,
    duration_seconds integer NOT NULL CHECK (duration_seconds IN (15,20,30,45,60)),
    aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('9:16','1:1','16:9')),
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('draft','queued','planning','rendering','complete','failed','cancelled')),
    progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    credits_reserved integer NOT NULL CHECK (credits_reserved >= 0),
    credits_settled integer CHECK (credits_settled >= 0),
    pipeline_revision text NOT NULL DEFAULT 'v1',
    output_object text,
    poster_object text,
    output_url text,
    poster_url text,
    error_code text,
    error_message text,
    cancelled_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_owner_created_idx ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_status_created_idx ON projects(status, created_at);

CREATE TABLE IF NOT EXISTS project_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    stage text,
    progress integer CHECK (progress BETWEEN 0 AND 100),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_events_project_idx ON project_events(project_id, created_at);

CREATE TABLE IF NOT EXISTS job_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    job_class text NOT NULL CHECK (job_class IN ('api','render')),
    status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','leased','running','complete','failed','cancelled')),
    pipeline_revision text NOT NULL DEFAULT 'v1',
    due_at timestamptz NOT NULL DEFAULT now(),
    lease_token uuid,
    lease_expires_at timestamptz,
    worker_region text,
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, job_class, pipeline_revision)
);
CREATE INDEX IF NOT EXISTS job_attempts_ready_idx ON job_attempts(job_class, status, due_at);
CREATE INDEX IF NOT EXISTS job_attempts_lease_idx ON job_attempts(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS scene_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_index integer NOT NULL,
    start_frame integer NOT NULL,
    end_frame integer NOT NULL,
    complexity text NOT NULL CHECK (complexity IN ('light','medium','heavy')),
    assigned_model text NOT NULL,
    program jsonb NOT NULL,
    status text NOT NULL DEFAULT 'planned',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, scene_index)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    entry_type text NOT NULL CHECK (entry_type IN ('grant','reserve','release','settle','refund','adjustment')),
    amount integer NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS showcase_clips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    department text NOT NULL CHECK (department IN ('learn','story','engage')),
    aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('9:16','1:1','16:9')),
    video_object text NOT NULL,
    poster_object text,
    video_url text NOT NULL,
    poster_url text,
    published boolean NOT NULL DEFAULT false,
    featured boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS showcase_published_sort_idx ON showcase_clips(published, featured DESC, sort_order, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS showcase_single_featured_idx ON showcase_clips(featured) WHERE featured;

CREATE TABLE IF NOT EXISTS dodo_webhook_events (
    id text PRIMARY KEY,
    event_type text NOT NULL,
    event_created_at timestamptz,
    payload jsonb NOT NULL,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tiktok_events_log (
    event_id text PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    event_name text NOT NULL,
    status text NOT NULL,
    response jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta_events_log (LIKE tiktok_events_log INCLUDING ALL);
CREATE TABLE IF NOT EXISTS google_ads_events_log (LIKE tiktok_events_log INCLUDING ALL);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','credit_accounts','projects','job_attempts','scene_plans','showcase_clips'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER touch_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', table_name, table_name);
  END LOOP;
END $$;

COMMIT;
