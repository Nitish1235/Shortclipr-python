BEGIN;

CREATE TABLE IF NOT EXISTS voice_catalog (
    voice_id text PRIMARY KEY,
    name text NOT NULL,
    language text NOT NULL,
    description text,
    preview_object text,
    preview_url text,
    enabled boolean NOT NULL DEFAULT true,
    provider text NOT NULL DEFAULT 'unrealspeech',
    generated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_catalog_enabled_language_idx ON voice_catalog(enabled, language, name);
DROP TRIGGER IF EXISTS touch_voice_catalog_updated_at ON voice_catalog;
CREATE TRIGGER touch_voice_catalog_updated_at BEFORE UPDATE ON voice_catalog FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
