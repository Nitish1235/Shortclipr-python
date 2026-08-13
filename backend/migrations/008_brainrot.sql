-- ═══════════════════════════════════════════════════════════════════
-- Migration 008: Brainrot Clips Maker — dialogue-driven video jobs
-- ═══════════════════════════════════════════════════════════════════
--
-- Second product surface on the same infra as the YouTube Shorts
-- clipper: user submits a title/script + 0-2 characters + a gameplay
-- background, AI writes a dialogue timeline, TTS voices it, and the
-- ffmpeg-worker composites character overlays + brainrot captions +
-- music/SFX into a vertical clip (see app/pipeline/brainrot_stage.py).
--
-- Kept as parallel tables rather than a `job_type` column on `jobs` —
-- the payload shape diverges too much (dialogue script, per-character
-- normalized positions, gameplay clip selection, voice assignment)
-- to share one JSONB shape cleanly, and `jobs` is written/read in a
-- lot of places that assume "YouTube URL in, N clips out" semantics.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS brainrot_jobs (
    job_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    status           TEXT NOT NULL DEFAULT 'created',
    -- created | generating_script | synthesizing_voice | rendering | complete | failed
    progress         INT NOT NULL DEFAULT 0,
    current_step     TEXT,

    payload          JSONB NOT NULL,
    -- {script_input, character_ids[], character_positions[{character_id,x,y,scale,rotation,side}],
    --  gameplay_clip_id, duration_seconds, caption_style, caption_color,
    --  voice_left, voice_right, tts_provider, music_asset_id, music_volume,
    --  intro_sfx_id, outro_sfx_id}

    scene_plan       JSONB,
    -- AI-generated dialogue timeline, written after the script-generation
    -- stage: [{speaker: "left"|"right"|"narrator", text, start, end, audio_path}]

    output_url       TEXT,
    error_message    TEXT,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brainrot_jobs_user_id ON brainrot_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_brainrot_jobs_user_status ON brainrot_jobs(user_id, status);
-- Watcher claim query filters on status alone across all users.
CREATE INDEX IF NOT EXISTS idx_brainrot_jobs_status ON brainrot_jobs(status);

ALTER PUBLICATION supabase_realtime ADD TABLE brainrot_jobs;

COMMENT ON COLUMN brainrot_jobs.payload IS
    'User-submitted job config — mirrors the queue_payload/ffmpeg_payload JSONB pattern from the jobs table.';
COMMENT ON COLUMN brainrot_jobs.scene_plan IS
    'AI dialogue timeline with real TTS-derived start/end timestamps per line — written by brainrot_script.py + tts.py, consumed by brainrot_composite.py.';
COMMENT ON TABLE brainrot_jobs IS
    'Brainrot Clips Maker jobs — dialogue-driven character videos over a gameplay background. Parallel to jobs table, not merged into it.';


-- ── Gameplay background library ───────────────────────────────────
-- Admin uploads a raw gameplay recording; the processing step rejects
-- the first 30s (unstable footage / recording artifacts) and splits
-- the rest into <=120s full-screen-reframed clips. One source row can
-- fan out into many selectable clip rows.

CREATE TABLE IF NOT EXISTS brainrot_gameplay_sources (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category         TEXT NOT NULL,
    -- e.g. minecraft, subway_surfers, gta, geometry_dash, satisfying, driving
    title            TEXT,
    gcs_path         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'processing',
    -- processing | ready | failed
    error_message    TEXT,
    uploaded_by      UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brainrot_gameplay_clips (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id        UUID NOT NULL REFERENCES brainrot_gameplay_sources(id) ON DELETE CASCADE,
    category         TEXT NOT NULL,
    gcs_path         TEXT NOT NULL,
    thumbnail_url    TEXT,
    duration_seconds FLOAT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brainrot_gameplay_clips_category ON brainrot_gameplay_clips(category);
CREATE INDEX IF NOT EXISTS idx_brainrot_gameplay_sources_status ON brainrot_gameplay_sources(status);

COMMENT ON TABLE brainrot_gameplay_sources IS
    'Admin-uploaded raw gameplay recordings, pending/processed into brainrot_gameplay_clips.';
COMMENT ON TABLE brainrot_gameplay_clips IS
    'Selectable <=120s full-screen-reframed gameplay background clips, derived from a source recording.';


-- ── Music + SFX library ────────────────────────────────────────────
-- Admin-uploaded, shared across all users. Ships empty in Phase 1 —
-- populated later with properly-licensed tracks via the admin upload
-- endpoints (Phase 3).

CREATE TABLE IF NOT EXISTS brainrot_audio_assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type       TEXT NOT NULL,
    -- music | sfx
    category         TEXT,
    -- sfx: vine_boom, death, laugh, shock, suspense, whoosh, notification, bruh
    name             TEXT NOT NULL,
    gcs_path         TEXT NOT NULL,
    duration_seconds FLOAT,
    uploaded_by      UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brainrot_audio_assets_type ON brainrot_audio_assets(asset_type, category);

COMMENT ON TABLE brainrot_audio_assets IS
    'Shared music + SFX library for brainrot clips. asset_type=music tracks get volume-ducked 20-40%%; asset_type=sfx are one-shot intro/outro stingers.';
