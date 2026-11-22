import unittest

from app.core.config import Settings
from app.db import effective_pool_sizes


class DatabasePoolLimitTests(unittest.TestCase):
    def test_api_pool_is_capped_per_cloud_run_instance(self):
        settings = Settings(SERVICE_ROLE="api", DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=10)
        self.assertEqual(effective_pool_sizes(settings), (1, 2))

    def test_api_worker_pool_is_capped_per_cloud_run_instance(self):
        settings = Settings(SERVICE_ROLE="api-worker", DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=10)
        self.assertEqual(effective_pool_sizes(settings), (1, 1))

    def test_single_concurrency_ffmpeg_worker_uses_one_database_connection(self):
        settings = Settings(SERVICE_ROLE="ffmpeg-worker", DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=10)
        self.assertEqual(effective_pool_sizes(settings), (1, 1))

    def test_explicit_smaller_pool_setting_is_preserved(self):
        settings = Settings(SERVICE_ROLE="api", DB_POOL_MIN_SIZE=1, DB_POOL_MAX_SIZE=1)
        self.assertEqual(effective_pool_sizes(settings), (1, 1))

    def test_minimum_is_clamped_to_effective_maximum(self):
        settings = Settings(SERVICE_ROLE="ffmpeg-worker", DB_POOL_MIN_SIZE=4, DB_POOL_MAX_SIZE=10)
        self.assertEqual(effective_pool_sizes(settings), (1, 1))


if __name__ == "__main__":
    unittest.main()
