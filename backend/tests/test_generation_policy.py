import unittest

from app.services.generation_policy import coding_effort, planning_effort
from app.services.animation_contracts import validate_generated_fragment


class GenerationPolicyTests(unittest.TestCase):
    def test_ordinary_story_planning_uses_low(self):
        self.assertEqual(planning_effort({"clip_type": "Animated explainer", "brief": "A simple story"}), "low")

    def test_fact_dense_planning_uses_medium(self):
        self.assertEqual(planning_effort({"clip_type": "Historical story", "brief": "Explain a timeline"}), "medium")

    def test_heavy_animation_code_uses_max(self):
        project = {"clip_type": "Animated explainer"}
        self.assertEqual(coding_effort({"complexity": "heavy"}, project), "max")

    def test_simple_animation_code_uses_medium(self):
        project = {"clip_type": "Animated explainer"}
        self.assertEqual(coding_effort({"complexity": "light"}, project), "medium")

    def test_validator_allows_harmless_window_word(self):
        source = "function draw(g) { /* window illustration */ g.fillRect(0, 0, 20, 20); }"
        self.assertEqual(validate_generated_fragment(source, "test", 1000), source)

    def test_validator_rejects_browser_global_property_access(self):
        source = "function draw(g) { window.location = 'https://example.com'; }"
        with self.assertRaises(ValueError):
            validate_generated_fragment(source, "test", 1000)


if __name__ == "__main__":
    unittest.main()
