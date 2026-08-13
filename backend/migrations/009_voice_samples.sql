-- ═══════════════════════════════════════════════════════════════════
-- Migration 009: Voice preview samples for the Brainrot voice picker
-- ═══════════════════════════════════════════════════════════════════
--
-- Admin auto-generates a short sample clip for every available TTS
-- voice (see POST /admin/brainrot/voices/generate). The frontend
-- voice picker reads these via GET /brainrot/voices and plays the
-- preview_url so users can hear each voice before selecting.

CREATE TABLE IF NOT EXISTS brainrot_voice_samples (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider         TEXT NOT NULL,        -- unrealspeech | lemonfox
    voice_id         TEXT NOT NULL,        -- exact API parameter value
    locale           TEXT NOT NULL,        -- en-US | en-GB
    gcs_url          TEXT NOT NULL,        -- public URL to the mp3 sample
    duration_seconds FLOAT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brainrot_voice_samples_unique
    ON brainrot_voice_samples(provider, voice_id);

COMMENT ON TABLE brainrot_voice_samples IS
    'Admin-generated TTS preview clips — one per (provider, voice_id) pair. Users hear these in the voice picker.';
