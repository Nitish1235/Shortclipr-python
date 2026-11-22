import unittest

from fastapi import HTTPException

from app.models.schemas import CreateProjectRequest
from app.routers.projects import enforce_plan_duration


class ProjectDurationEntitlementTests(unittest.TestCase):
    def test_free_plan_allows_ten_second_short(self):
        enforce_plan_duration("free", 10)

    def test_api_schema_accepts_ten_second_projects(self):
        payload = CreateProjectRequest(
            brief="Explain how a bridge is built",
            clip_type="Animated explainer",
            department="learn",
            language="English",
            voice_id="scarlett",
            visual_style="AI Auto",
            duration_seconds=10,
            aspect_ratio="9:16",
        )
        self.assertEqual(payload.duration_seconds, 10)

    def test_free_plan_rejects_longer_short(self):
        with self.assertRaises(HTTPException) as raised:
            enforce_plan_duration("free", 15)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("10-second", raised.exception.detail)

    def test_paid_plans_keep_existing_duration_options(self):
        for duration in (15, 20, 30, 45, 60):
            enforce_plan_duration("starter", duration)


if __name__ == "__main__":
    unittest.main()
