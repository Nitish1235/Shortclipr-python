from datetime import datetime, timedelta, timezone
import unittest

from app.routers.admin_workers import worker_status


class FakePool:
    def __init__(self, regions, counts):
        self.regions = regions
        self.counts = counts

    async def fetch(self, _query):
        return self.regions

    async def fetchrow(self, _query):
        return self.counts


class AdminWorkerStatusTests(unittest.IsolatedAsyncioTestCase):
    async def test_reports_available_full_and_cooldown_regions(self):
        now = datetime.now(timezone.utc)
        regions = [
            {
                "job_class": "render", "region": "us-central1", "capacity": 5,
                "assigned": 3, "blocked_until": None, "last_error": None,
                "last_rejection_at": None, "last_success_at": now, "updated_at": now,
            },
            {
                "job_class": "render", "region": "europe-west1", "capacity": 5,
                "assigned": 5, "blocked_until": None, "last_error": None,
                "last_rejection_at": None, "last_success_at": now, "updated_at": now,
            },
            {
                "job_class": "api", "region": "us-central1", "capacity": 12,
                "assigned": 1, "blocked_until": now + timedelta(seconds=30),
                "last_error": "quota", "last_rejection_at": now,
                "last_success_at": None, "updated_at": now,
            },
        ]
        counts = {
            "queued_api": 2, "queued_render": 4, "running_api": 1,
            "running_render": 8, "failed_24h": 0,
        }

        result = await worker_status(None, FakePool(regions, counts))

        self.assertEqual([region["status"] for region in result["regions"]], ["available", "full", "cooldown"])
        self.assertEqual(result["regions"][0]["available"], 2)
        self.assertEqual(result["regions"][1]["available"], 0)
        self.assertEqual(result["queued_render"], 4)
        self.assertEqual(result["running_render"], 8)


if __name__ == "__main__":
    unittest.main()
