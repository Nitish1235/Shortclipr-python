BEGIN;

CREATE TABLE IF NOT EXISTS landing_media_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  media_kind text NOT NULL CHECK (media_kind IN ('image','video')),
  media_object text NOT NULL,
  media_url text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landing_media_revisions_slot_created_idx
  ON landing_media_revisions(slot, created_at DESC);

COMMIT;
