BEGIN;

ALTER TABLE showcase_clips
    ADD COLUMN IF NOT EXISTS landing_visible boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS showcase_source_project_unique
    ON showcase_clips(source_project_id) WHERE source_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS showcase_landing_reel_idx
    ON showcase_clips(landing_visible, published, sort_order, created_at DESC);

COMMIT;
