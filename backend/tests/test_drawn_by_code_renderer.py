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


if __name__ == "__main__":
    unittest.main()
