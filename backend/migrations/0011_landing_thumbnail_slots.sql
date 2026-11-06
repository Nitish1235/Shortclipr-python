BEGIN;

-- Ordered portrait images below the landing workflow. Uploading one slot
-- leaves the five other images and the independently curated video reel alone.
ALTER TABLE landing_media_slots DROP CONSTRAINT IF EXISTS landing_media_slots_slot_check;
ALTER TABLE landing_media_slots ADD CONSTRAINT landing_media_slots_slot_check CHECK (
    slot IN ('landing_hero_background', 'screening_feature', 'screening_side',
             'landing_thumbnail_1', 'landing_thumbnail_2', 'landing_thumbnail_3',
             'landing_thumbnail_4', 'landing_thumbnail_5', 'landing_thumbnail_6')
);
ALTER TABLE landing_media_slots ADD CONSTRAINT landing_thumbnail_image_only CHECK (
    slot NOT LIKE 'landing_thumbnail_%' OR media_kind = 'image'
);

COMMIT;
