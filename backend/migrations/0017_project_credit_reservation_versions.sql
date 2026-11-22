BEGIN;

-- Every manual requeue creates a new reservation generation. This keeps
-- reserve/release/settle ledger keys unique across multiple attempts.
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS credit_reservation_version integer NOT NULL DEFAULT 0
    CHECK (credit_reservation_version >= 0);

COMMIT;
