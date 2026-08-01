-- ═══════════════════════════════════════════════════════════════════
-- Migration 006: Clip retention + showcase protection
-- ═══════════════════════════════════════════════════════════════════
--
-- Two related changes:
--
-- 1. is_showcased flag on clips
--    When an admin adds a clip to the public showcase (admin.py), we mark
--    the SOURCE clip as showcased. The delete paths (user-triggered
--    DELETE /jobs/{job_id}, and any future scheduled retention sweep)
--    must skip showcased clips + their GCS files so admins can still
--    browse and re-edit them long-term. The showcase COPY under GCS
--    prefix `showcase/` is already independent — this protects the
--    ORIGINAL as well.
--
-- 2. Frontend retention window
--    Historically the UI hid clips older than 24 hours (Dashboard.jsx /
--    ClipsHistory.jsx filters). We're bumping that to 15 days in the
--    frontend — no DB change needed, the filter is client-side, but
--    documenting here so it's discoverable from one place.
--
-- No new deletion mechanism is being introduced. The DB row + GCS blob
-- for a non-showcased clip only get deleted when the user explicitly
-- deletes their job (or a GCS lifecycle rule fires, which is a separate
-- ops concern documented in deployment.md).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE clips ADD COLUMN IF NOT EXISTS is_showcased BOOLEAN NOT NULL DEFAULT FALSE;
-- ^ TRUE when this clip has been added to the public showcase by an admin.
--   Delete-guards in app/api/jobs.py + app/pipeline/uploader.py must
--   preserve rows/GCS files where this is TRUE.

-- Partial index for the "any showcased clips in this job?" lookup that
-- runs on every DELETE /jobs/{job_id}. Only indexes TRUE rows since
-- ~99% of clips are FALSE.
CREATE INDEX IF NOT EXISTS idx_clips_showcased
    ON clips(job_id)
    WHERE is_showcased = TRUE;

COMMENT ON COLUMN clips.is_showcased IS
    'TRUE = clip is featured on the public showcase carousel and must be preserved across job deletions.';
