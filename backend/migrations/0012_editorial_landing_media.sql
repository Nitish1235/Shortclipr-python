BEGIN;

-- Every image surface in the editorial landing page has an individually
-- replaceable placement. Existing hero and process slots remain stable.
ALTER TABLE landing_media_slots DROP CONSTRAINT IF EXISTS landing_media_slots_slot_check;
ALTER TABLE landing_media_slots ADD CONSTRAINT landing_media_slots_slot_check CHECK (
  slot IN (
    'landing_hero_background', 'landing_hero_machine',
    'screening_feature', 'screening_side',
    'landing_thumbnail_1', 'landing_thumbnail_2', 'landing_thumbnail_3',
    'landing_thumbnail_4', 'landing_thumbnail_5', 'landing_thumbnail_6',
    'collection_learn_1', 'collection_learn_2', 'collection_learn_3',
    'collection_story_1', 'collection_story_2', 'collection_story_3',
    'collection_engage_1', 'collection_engage_2', 'collection_engage_3'
  )
);
ALTER TABLE landing_media_slots ADD CONSTRAINT landing_editorial_image_only CHECK (
  slot NOT IN (
    'landing_hero_machine',
    'collection_learn_1', 'collection_learn_2', 'collection_learn_3',
    'collection_story_1', 'collection_story_2', 'collection_story_3',
    'collection_engage_1', 'collection_engage_2', 'collection_engage_3'
  ) OR media_kind = 'image'
);

COMMIT;
