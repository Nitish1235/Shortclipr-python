import unittest

from fastapi import HTTPException
from app.routers.showcase import LANDING_COLLECTION_SLOTS, LANDING_MEDIA_SLOTS, LANDING_THUMBNAIL_SLOTS, landing_media_kind


class MediaPlacementTests(unittest.TestCase):
    def test_only_named_direct_upload_slots_are_accepted(self):
        self.assertEqual(
            LANDING_MEDIA_SLOTS,
            frozenset({"landing_hero_background", "landing_hero_clip", "screening_feature", "screening_side"})
            | frozenset(f"landing_thumbnail_{index}" for index in range(1, 7))
            | LANDING_COLLECTION_SLOTS | {"landing_hero_machine"},
        )

    def test_each_thumbnail_accepts_images_but_not_videos(self):
        for slot in LANDING_THUMBNAIL_SLOTS | LANDING_COLLECTION_SLOTS | {"landing_hero_machine"}:
            for content_type in ("image/jpeg", "image/png", "image/webp"):
                self.assertEqual(landing_media_kind(slot, content_type), "image")
            with self.assertRaises(HTTPException) as error:
                landing_media_kind(slot, "video/mp4")
            self.assertEqual(error.exception.status_code, 422)

    def test_other_media_slots_still_accept_video(self):
        self.assertEqual(landing_media_kind("screening_feature", "video/mp4"), "video")

    def test_unlisted_slot_and_unsafe_image_format_are_rejected(self):
        for slot, kind in (("landing_thumbnail_7", "image/png"), ("landing_thumbnail_1", "image/svg+xml")):
            with self.assertRaises(HTTPException) as error:
                landing_media_kind(slot, kind)
            self.assertEqual(error.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
