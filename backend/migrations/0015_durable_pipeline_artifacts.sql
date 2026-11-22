BEGIN;

-- Durable outputs for each expensive generation stage. Retries resume from the
-- last completed artifact instead of regenerating story, animation or narration.
CREATE TABLE IF NOT EXISTS project_pipeline_artifacts (
    project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    story_plan jsonb,
    animation_program jsonb,
    audio_object text,
    timestamps_object text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_pipeline_artifacts_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS touch_project_pipeline_artifacts_updated_at ON project_pipeline_artifacts;
CREATE TRIGGER touch_project_pipeline_artifacts_updated_at
BEFORE UPDATE ON project_pipeline_artifacts
FOR EACH ROW EXECUTE FUNCTION touch_pipeline_artifacts_updated_at();

COMMIT;
