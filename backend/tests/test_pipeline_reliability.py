import asyncio
import unittest
from uuid import uuid4

from app.routers.internal import gather_cancel_on_error, maintain_worker_lease
from app.services.drawn_by_code_renderer import DrawnByCodeRenderer


class LeasePool:
    async def fetchval(self, _query, *_args):
        return uuid4()


class PipelineReliabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_parallel_generation_cancels_sibling_on_failure(self):
        sibling_started = asyncio.Event()
        sibling_cancelled = asyncio.Event()

        async def failing():
            await sibling_started.wait()
            raise RuntimeError("provider failed")

        async def sibling():
            sibling_started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                sibling_cancelled.set()
                raise

        with self.assertRaisesRegex(RuntimeError, "provider failed"):
            await gather_cancel_on_error(failing(), sibling())
        self.assertTrue(sibling_cancelled.is_set())

    async def test_worker_lease_can_be_renewed_for_active_attempt(self):
        async with maintain_worker_lease(
            LeasePool(), uuid4(), uuid4(), uuid4(), "render",
        ) as owned:
            self.assertTrue(owned)
            await asyncio.sleep(0)


class DrawnByCodeOutputTests(unittest.TestCase):
    def test_output_tail_joins_lines_with_newlines(self):
        self.assertEqual(
            DrawnByCodeRenderer._format_output_tail(["opening chromium", "page error: bad draw"]),
            "opening chromium\\npage error: bad draw",
        )

    def test_output_tail_is_bounded(self):
        self.assertEqual(
            len(DrawnByCodeRenderer._format_output_tail(["x" * 5000], max_chars=1200)),
            1200,
        )

    def test_empty_output_has_clear_marker(self):
        self.assertEqual(DrawnByCodeRenderer._format_output_tail([]), "no subprocess output")


if __name__ == "__main__":
    unittest.main()
