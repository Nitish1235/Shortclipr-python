import unittest

from app.services.deepseek_animation import DeepSeekAnimationCompiler


class ShotVisualContextTests(unittest.TestCase):
    def test_context_includes_only_entities_used_by_shot(self):
        bible = {
            "style_id": "paper-cutout",
            "style_notes": "Layered paper textures",
            "characters": [
                {"id": "char_a", "design": {"silhouette": "round"}},
                {"id": "char_b", "design": {"silhouette": "tall"}},
            ],
            "props": [
                {"id": "prop_map", "design": "folded map"},
                {"id": "prop_key", "design": "brass key"},
            ],
            "environments": [
                {"id": "env_forest", "design": "pine forest"},
                {"id": "env_city", "design": "city street"},
            ],
        }
        scene = {
            "characters": ["char_a"],
            "props": ["prop_map"],
            "environment": "env_forest",
        }

        result = DeepSeekAnimationCompiler._shot_visual_context(bible, scene)

        self.assertEqual(result["style_id"], "paper-cutout")
        self.assertEqual([x["id"] for x in result["characters"]], ["char_a"])
        self.assertEqual([x["id"] for x in result["props"]], ["prop_map"])
        self.assertEqual([x["id"] for x in result["environments"]], ["env_forest"])
        self.assertEqual(result["style_notes"], "Layered paper textures")


if __name__ == "__main__":
    unittest.main()
