BEGIN;

CREATE TABLE IF NOT EXISTS landing_media_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot text NOT NULL UNIQUE CHECK (slot IN ('screening_feature', 'screening_side')),
    title text NOT NULL CHECK (char_length(title) <= 100),
    caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 220),
    media_kind text NOT NULL CHECK (media_kind IN ('image', 'video')),
    media_object text NOT NULL,
    media_url text NOT NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS touch_landing_media_slots_updated_at ON landing_media_slots;
CREATE TRIGGER touch_landing_media_slots_updated_at BEFORE UPDATE ON landing_media_slots
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
