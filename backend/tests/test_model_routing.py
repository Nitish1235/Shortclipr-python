import unittest

from app.core.config import Settings
from app.services.credits import estimate_credits
from app.services.model_router import assign_scene_model


class ModelRoutingTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(OPENAI_LUNA_MODEL="gpt-6-luna", OPENAI_TERRA_MODEL="gpt-6.1-terra")

    def test_light_declarative_scene_uses_luna(self):
        result = assign_scene_model("light", ["text_reveal", "chart_draw"], self.settings)
        self.assertEqual(result.model, "gpt-6-luna")

    def test_heavy_scene_uses_terra(self):
        result = assign_scene_model("heavy", ["moving_camera"], self.settings)
        self.assertEqual(result.model, "gpt-6.1-terra")

    def test_demanding_operation_escalates(self):
        result = assign_scene_model("medium", ["multi_character_blocking"], self.settings)
        self.assertEqual(result.model, "gpt-6.1-terra")

    def test_credit_estimate_is_duration_sensitive(self):
        self.assertGreater(estimate_credits("Animated explainer", 60, "AI Auto"), estimate_credits("Animated explainer", 15, "AI Auto"))

    def test_removed_clip_type_is_rejected(self):
        with self.assertRaises(ValueError):
            estimate_credits("Unsupported format", 30, "AI Auto")


if __name__ == "__main__":
    unittest.main()
