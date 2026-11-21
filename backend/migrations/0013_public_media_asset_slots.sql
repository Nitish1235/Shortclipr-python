BEGIN;

-- Public media can now be assigned to stable content slots shared by the
-- landing page, product pages, guides and editorial pages. Existing slot names
-- remain valid; the slug constraint keeps arbitrary paths out of the key.
ALTER TABLE landing_media_slots
  DROP CONSTRAINT IF EXISTS landing_media_slots_slot_check;

ALTER TABLE landing_media_slots
  ADD CONSTRAINT landing_media_slots_slot_check
  CHECK (slot ~ '^[a-z][a-z0-9_-]{1,95}$');

COMMIT;
