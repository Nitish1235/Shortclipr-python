-- A direct-upload background for the Story Machine hero joins the two
-- existing screening placements. Curated clips continue to power the reel
-- and the signed-in Studio dashboard.
ALTER TABLE landing_media_slots DROP CONSTRAINT IF EXISTS landing_media_slots_slot_check;
ALTER TABLE landing_media_slots ADD CONSTRAINT landing_media_slots_slot_check
    CHECK (slot IN ('landing_hero_background', 'screening_feature', 'screening_side'));
