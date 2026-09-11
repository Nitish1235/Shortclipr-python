-- ============================================================
-- Migration 018 — tutorial video (singleton table)
--
-- Stores the single admin-uploaded onboarding tutorial video.
-- CHECK (id = 1) keeps this to exactly one row; admin re-upload
-- is an INSERT ... ON CONFLICT (id) DO UPDATE. Empty/missing row
-- means "no tutorial uploaded yet" — hidden from users until then.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS is a no-op when the
-- table already exists.
-- ============================================================

CREATE TABLE IF NOT EXISTS tutorial_video (
    id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    video_url   TEXT NOT NULL,
    uploaded_by TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
