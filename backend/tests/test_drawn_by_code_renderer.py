import unittest

from app.services.drawn_by_code_renderer import DrawnByCodeRenderer


class DrawnByCodeDiagnosticsTests(unittest.TestCase):
    def test_output_tail_preserves_recent_lines(self):
        self.assertEqual(
            DrawnByCodeRenderer._format_output_tail(["launching chromium", "page error: bad draw"]),
            "launching chromium\npage error: bad draw",
        )

    def test_output_tail_is_bounded(self):
        value = DrawnByCodeRenderer._format_output_tail(["x" * 5000], max_chars=1200)
        self.assertEqual(len(value), 1200)

    def test_empty_output_has_clear_marker(self):
        self.assertEqual(DrawnByCodeRenderer._format_output_tail([]), "no subprocess output")

    def test_motion_qa_samples_three_interior_frames_per_shot(self):
        samples = DrawnByCodeRenderer._motion_qa_samples([
            {"index": 0, "start_frame": 0, "end_frame": 90, "name": "Bridge reveal",
             "mechanism_ids": ["bridge_lift"]},
            {"index": 1, "start_frame": 90, "end_frame": 180, "name": "Bridge rises",
             "mechanism_ids": ["bridge_lift"]},
        ])
        self.assertEqual(len(samples), 6)
        self.assertEqual([item["frame"] for item in samples], [13, 44, 76, 103, 134, 166])
        self.assertTrue(all(item["time_seconds"] == round(item["frame"] / 30, 6) for item in samples))
        self.assertEqual(samples[0]["mechanism_ids"], ["bridge_lift"])

    def test_motion_qa_samples_skip_invalid_shots_and_cap_manifest(self):
        manifest = [
            {"index": 0, "start_frame": 4, "end_frame": 4},
            *[
                {"index": index, "start_frame": index * 30, "end_frame": (index + 1) * 30}
                for index in range(1, 15)
            ],
        ]
        samples = DrawnByCodeRenderer._motion_qa_samples(manifest)
        self.assertEqual(len(samples), 12 * 3)
        self.assertNotIn(4, [item["frame"] for item in samples])

    def test_motion_qa_is_disabled_for_legacy_programs_without_manifest(self):
        self.assertEqual(DrawnByCodeRenderer._motion_qa_samples(None), [])


if __name__ == "__main__":
    unittest.main()
