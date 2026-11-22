import unittest

from app.services.deepseek_animation import DeepSeekAnimationCompiler
from app.services.animation_contracts import (
    find_unresolved_draw_helpers,
    validate_draw_helper_definitions,
)


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


class DrawingHelperContractTests(unittest.TestCase):
    def test_finds_missing_helper_used_by_shot(self):
        shared = "function drawBridge(g) { g.beginPath(); }"
        shots = ["drawBridge(g); drawPaperQuestionMark(g, 10, 20);"]
        self.assertEqual(
            find_unresolved_draw_helpers(shared, shots),
            ["drawPaperQuestionMark"],
        )

    def test_accepts_shared_and_shot_local_helpers(self):
        shared = "function drawBridge(g) {}"
        shots = [
            "function drawLocalGear(g) {} drawBridge(g); drawLocalGear(g); g.drawImage(img, 0, 0);"
        ]
        self.assertEqual(find_unresolved_draw_helpers(shared, shots), [])

    def test_finds_missing_dependencies_inside_shared_helpers(self):
        shared = "function drawBridge(g) { drawMissingGear(g); }"
        self.assertEqual(find_unresolved_draw_helpers(shared, []), ["drawMissingGear"])

    def test_requires_generator_to_define_each_requested_helper(self):
        validate_draw_helper_definitions(
            "function drawPaperQuestionMark(g, x, y) {}",
            ["drawPaperQuestionMark"],
        )
        with self.assertRaisesRegex(ValueError, "drawPaperQuestionMark"):
            validate_draw_helper_definitions("function drawQuestion(g) {}", ["drawPaperQuestionMark"])


class MechanismKinematicsContextTests(unittest.TestCase):
    def test_shot_context_includes_only_referenced_mechanism_specs(self):
        bible = {
            "style_id": "line",
            "mechanisms": [
                {"id": "mechanism_a", "kinematics": [{"type": "pivot", "part": "deck"}]},
                {"id": "mechanism_b", "kinematics": [{"type": "translation", "part": "carriage"}]},
            ],
        }
        scene = {"mechanism_actions": [{"mechanism_id": "mechanism_b"}]}
        context = DeepSeekAnimationCompiler._shot_visual_context(bible, scene)
        self.assertEqual([item["id"] for item in context["mechanisms"]], ["mechanism_b"])
        self.assertEqual(context["mechanisms"][0]["kinematics"][0]["type"], "translation")

    def test_style_runtime_exposes_mechanism_pose_helper(self):
        from pathlib import Path
        import re

        styles_path = Path(__file__).resolve().parents[1] / "drawn_by_code" / "styles" / "shortclipr.js"
        source = styles_path.read_text(encoding="utf-8")
        self.assertRegex(source, r"function mechanismPose\(spec,progress\)")
        self.assertIn("return {type:'pivot',part:spec.part,anchor,angle_rad:angle}", source)
        self.assertIn("return {type:'translation',part:spec.part,position:", source)
        self.assertIn("return {type:'actuator',part:spec.part,base,tip:", source)
        self.assertIn("return {type:'gear',part:spec.part,driver_part:spec.driver_part", source)
        self.assertIn("return {type:'pulley',part:spec.part,pulley_part:spec.pulley_part", source)
        self.assertIn("return {type:'cable',part:spec.part,points}", source)
        self.assertRegex(source, r"Object\.freeze\(\{mechanismPose,")




class MechanismAssemblyTests(unittest.TestCase):
    def test_assembler_injects_serialized_actions_and_mechanism_specs(self):
        source = DeepSeekAnimationCompiler._assemble_film(
            "function drawBridge(g) {}",
            [{
                "index": 0,
                "start_frame": 0,
                "end_frame": 30,
                "name": "Bridge lift",
                "draw_body": "drawBridge(g);",
                "mechanism_actions": [{
                    "mechanism_id": "mechanism_lift",
                    "pattern_id": "raise",
                    "action": "raise deck",
                    "start_progress": 0.1,
                    "end_progress": 0.9,
                }],
                "mechanisms": [{
                    "id": "mechanism_lift",
                    "kinematics": [{
                        "type": "pivot",
                        "part": "deck",
                        "anchor": {"x": 20, "y": 30},
                        "start_angle_deg": 0,
                        "end_angle_deg": 40,
                    }],
                }],
            }],
            duration=1,
            logical=[1600, 900],
            style_id="line",
        )
        self.assertIn("const mechanismActions = [{", source)
        self.assertIn('"mechanism_id":"mechanism_lift"', source)
        self.assertIn("const mechanisms = [{", source)
        self.assertIn('"type":"pivot"', source)
        self.assertIn("drawBridge(g);", source)


if __name__ == "__main__":
    unittest.main()
