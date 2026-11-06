BEGIN;

CREATE TABLE IF NOT EXISTS project_email_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient text NOT NULL,
    notification_type text NOT NULL CHECK (notification_type IN ('ready')),
    status text NOT NULL CHECK (status IN ('sending','sent','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    provider_message_id text,
    last_error text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, notification_type)
);

CREATE INDEX IF NOT EXISTS project_email_notifications_status_idx ON project_email_notifications(status, updated_at);
DROP TRIGGER IF EXISTS touch_project_email_notifications_updated_at ON project_email_notifications;
CREATE TRIGGER touch_project_email_notifications_updated_at BEFORE UPDATE ON project_email_notifications
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
