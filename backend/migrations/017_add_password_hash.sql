-- ============================================================
-- Migration 017 — add password_hash column to users
--
-- Enables email + password sign-in as an alternative to Google
-- OAuth. Only users who explicitly set a password can use it;
-- everyone else continues to sign in with Google as before.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is a no-op when the
-- column already exists.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
