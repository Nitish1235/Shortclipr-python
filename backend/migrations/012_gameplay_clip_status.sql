-- Migration 012: Add curation status to brainrot_gameplay_clips
-- Allows admins to review clips and select/reject them.
-- New clips default to 'pending' (hidden from users until selected).

ALTER TABLE brainrot_gameplay_clips
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Add an index for efficient filtering by status
CREATE INDEX IF NOT EXISTS idx_brainrot_gameplay_clips_status
  ON brainrot_gameplay_clips(status);

-- OPTIONAL: If you want to immediately make all existing clips visible to users,
-- run this line too. Otherwise, they will all appear as 'pending' and you will
-- need to select them in the admin panel.
-- UPDATE brainrot_gameplay_clips SET status = 'selected' WHERE status = 'pending';
