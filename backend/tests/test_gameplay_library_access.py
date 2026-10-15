import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api import admin


CLIPS = [
    {"id": "newest", "title": "First preview"},
    {"id": "second", "title": "Second background"},
    {"id": "third", "title": "Third background"},
]


class GameplayLibraryAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_free_visitor_sees_one_preview_and_locked_count(self):
        with (
            patch.object(admin.settings, "GAMEPLAY_GCS_BUCKET_NAME", "test-bucket"),
            patch.object(admin, "_list_gameplay_sync", return_value=CLIPS),
        ):
            result = await admin.list_gameplay_clips(None)

        self.assertEqual(result["clips"], CLIPS[:1])
        self.assertEqual(result["count"], 3)
        self.assertEqual(result["locked_count"], 2)

    async def test_paid_user_sees_the_whole_library(self):
        with (
            patch.object(admin.settings, "GAMEPLAY_GCS_BUCKET_NAME", "test-bucket"),
            patch.object(admin, "_list_gameplay_sync", return_value=CLIPS),
            patch.object(admin, "decode_access_token", return_value=SimpleNamespace(sub="user-1")),
            patch.object(admin.db, "get_user", new=AsyncMock(return_value={"plan": "starter_30"})),
        ):
            result = await admin.list_gameplay_clips(SimpleNamespace(credentials="valid-token"))

        self.assertEqual(result["clips"], CLIPS)
        self.assertEqual(result["locked_count"], 0)

    async def test_free_account_does_not_unlock_from_a_token(self):
        with (
            patch.object(admin.settings, "GAMEPLAY_GCS_BUCKET_NAME", "test-bucket"),
            patch.object(admin, "_list_gameplay_sync", return_value=CLIPS),
            patch.object(admin, "decode_access_token", return_value=SimpleNamespace(sub="user-1")),
            patch.object(admin.db, "get_user", new=AsyncMock(return_value={"plan": "free"})),
        ):
            result = await admin.list_gameplay_clips(SimpleNamespace(credentials="valid-token"))

        self.assertEqual(result["clips"], CLIPS[:1])
        self.assertEqual(result["locked_count"], 2)


if __name__ == "__main__":
    unittest.main()
