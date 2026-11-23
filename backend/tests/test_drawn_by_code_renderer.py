import unittest

from app.services.drawn_by_code_renderer import DrawnByCodeRenderer, NonRetryableRenderError


class DrawnByCodeDiagnosticsTests(unittest.TestCase):
    def test_renderer_preflight_rejects_missing_shared_draw_helper(self):
        source = """
function drawShot_0(g, t, env, absoluteTime) {
    drawSkyHalftone(g, 0, 0, 900, 1600);
}
Motion.scene({ draw(g, t, env) { drawShot_0(g, t, env, t); } });
"""
        with self.assertRaisesRegex(NonRetryableRenderError, "drawSkyHalftone"):
            DrawnByCodeRenderer._validate_generated_helpers(source)

    def test_renderer_preflight_accepts_top_level_shared_draw_helper(self):
        source = """
function drawSkyHalftone(g, x, y, w, h) {}
function drawShot_0(g, t, env, absoluteTime) {
    drawSkyHalftone(g, 0, 0, 900, 1600);
}
Motion.scene({ draw(g, t, env) { drawShot_0(g, t, env, t); } });
"""
        DrawnByCodeRenderer._validate_generated_helpers(source)

    def test_renderer_preflight_rejects_helper_declared_inside_another_function(self):
        source = """
function drawWrapper(g) {
    function drawSkyHalftone(g, x, y, w, h) {}
}
function drawShot_0(g, t, env, absoluteTime) {
    drawSkyHalftone(g, 0, 0, 900, 1600);
}
Motion.scene({ draw(g, t, env) { drawShot_0(g, t, env, t); } });
"""
        with self.assertRaisesRegex(NonRetryableRenderError, "drawSkyHalftone"):
            DrawnByCodeRenderer._validate_generated_helpers(source)

    def test_renderer_preflight_ignores_comments_strings_and_object_methods(self):
        source = '''
// drawMissingFromComment(g);
const label = "drawMissingFromString(g)";
const api = {};
function drawShot_0(g, t, env, absoluteTime) {
    api.drawMethod(g);
}
Motion.scene({ draw(g, t, env) { drawShot_0(g, t, env, t); } });
'''
        DrawnByCodeRenderer._validate_generated_helpers(source)

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

    def test_drawn_by_code_engine_accepts_motion_qa_capture_arguments(self):
        from pathlib import Path

        engine = Path(__file__).resolve().parents[1] / "drawn_by_code" / "engine" / "render.mjs"
        source = engine.read_text(encoding="utf-8")
        self.assertIn("opt['qa-at']", source)
        self.assertIn("opt['qa-out']", source)
        self.assertIn("drawn_by_code.motion_qa.captured", source)
        self.assertIn("runtime_preflight", source)
        self.assertIn("drawn_by_code.runtime_error", source)
        # Runtime frame exceptions must not be swallowed by the optional QA PNG writer.
        self.assertNotIn("motion_qa.capture_failed", source)

    def test_renderer_runs_ast_linker_with_persisted_manifest(self):
        from pathlib import Path
        import json

        backend = Path(__file__).resolve().parents[1]
        linker = backend / "drawn_by_code" / "engine" / "validate-scene.mjs"
        package = json.loads(
            (backend / "drawn_by_code" / "package.json").read_text(encoding="utf-8")
        )
        renderer = (backend / "app" / "services" / "drawn_by_code_renderer.py").read_text(encoding="utf-8")

        self.assertTrue(linker.is_file())
        self.assertIn("acorn", package["dependencies"])
        self.assertIn("eslint-scope", package["dependencies"])
        self.assertIn("validate-scene.mjs", renderer)
        self.assertIn("helper-manifest.json", renderer)
        self.assertIn("canonical function/scope linking", renderer)


if __name__ == "__main__":
    unittest.main()
