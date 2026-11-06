import os
import unittest
from unittest.mock import patch

import httpx

from watcher.main import Dispatcher, WorkerTarget, is_region_rejection, targets


class CapacityPool:
    def __init__(self, counts):
        self.counts = counts

    async def fetch(self, _query, _job_class):
        return [{"worker_region": region, "count": count} for region, count in self.counts.items()]


class WatcherRoutingTests(unittest.IsolatedAsyncioTestCase):
    def test_two_regions_receive_matching_labels_and_shared_cap(self):
        values = {
            "FFMPEG_WORKER_URLS": "https://render-us.example,https://render-eu.example",
            "FFMPEG_WORKER_REGIONS": "us-central1,europe-west1",
            "FFMPEG_REGION_SOFT_CAP": "4",
        }
        with patch.dict(os.environ, values, clear=False):
            result = targets("FFMPEG_WORKER_URLS", "FFMPEG_WORKER_REGIONS", "FFMPEG_REGION_SOFT_CAP")
        self.assertEqual([(item.region, item.capacity) for item in result], [("us-central1", 4), ("europe-west1", 4)])

    def test_render_default_can_reserve_headroom_when_env_is_not_set(self):
        values = {
            "FFMPEG_WORKER_URLS": "https://render-us.example",
            "FFMPEG_WORKER_REGIONS": "us-central1",
        }
        with patch.dict(os.environ, values, clear=True):
            result = targets("FFMPEG_WORKER_URLS", "FFMPEG_WORKER_REGIONS", "FFMPEG_REGION_SOFT_CAP", 4)
        self.assertEqual(result[0].capacity, 4)

    async def test_ninth_render_waits_until_one_of_eight_slots_is_released(self):
        render_targets = [
            WorkerTarget("https://render-us.example", "us-central1", 4),
            WorkerTarget("https://render-eu.example", "europe-west1", 4),
        ]
        full = Dispatcher(CapacityPool({"us-central1": 4, "europe-west1": 4}), "secret", [], render_targets, 60)
        self.assertIsNone(await full.next_target("render"))

        released = Dispatcher(CapacityPool({"us-central1": 3, "europe-west1": 4}), "secret", [], render_targets, 60)
        self.assertEqual((await released.next_target("render")).region, "us-central1")

    def test_quota_rejection_is_safe_for_regional_failover(self):
        request = httpx.Request("POST", "https://render.example/internal/ffmpeg-stage/run")
        error = httpx.HTTPStatusError("quota", request=request, response=httpx.Response(429, request=request))
        self.assertTrue(is_region_rejection(error))
        server_error = httpx.HTTPStatusError("worker error", request=request, response=httpx.Response(500, request=request))
        self.assertFalse(is_region_rejection(server_error))
        self.assertTrue(is_region_rejection(httpx.ConnectError("unavailable", request=request)))
        self.assertFalse(is_region_rejection(ValueError("invalid job")))


if __name__ == "__main__":
    unittest.main()
