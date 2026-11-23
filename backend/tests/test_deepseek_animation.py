import unittest

from app.services.deepseek_animation import DeepSeekAnimationCompiler
from app.services.animation_contracts import (
    find_unresolved_draw_helpers,
    validate_draw_helper_definitions,
    validate_draw_helper_specs,
    validate_draw_helper_dependency_graph,
    extract_shared_draw_helpers,
    replace_shared_draw_helpers,
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


class VisualQAContextTests(unittest.TestCase):
    def test_visual_qa_context_preserves_bible_and_reviewable_storyboard_fields(self):
        bible = {
            "style_id": "cinematic-editorial",
            "characters": [{"id": "char_engineer", "design": {"silhouette": "hard hat"}}],
        }
        scenes = [{
            "index": 0,
            "start_frame": 0,
            "end_frame": 90,
            "visual_objective": "Reveal the bridge hinge",
            "composition": "Low angle with the hinge in foreground",
            "focal_entity": "prop_hinge",
            "internal_debug_field": "must not leak into QA prompt",
        }]
        context = DeepSeekAnimationCompiler._visual_qa_context(bible, scenes)
        self.assertEqual(context["visual_bible"], bible)
        self.assertEqual(len(context["storyboard"]), 1)
        self.assertEqual(context["storyboard"][0]["focal_entity"], "prop_hinge")
        self.assertNotIn("internal_debug_field", context["storyboard"][0])


class TargetedShotRepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_repair_replaces_only_requested_shot_and_keeps_shared_library(self):
        import json
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler.client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(return_value=SimpleNamespace(
                        choices=[SimpleNamespace(
                            message=SimpleNamespace(content=json.dumps({
                                "draw_body": "g.save(); drawBridge(g, 20, 20); g.restore();"
                            })),
                            finish_reason="stop",
                        )],
                        usage=SimpleNamespace(
                            prompt_tokens=100, completion_tokens=50,
                            prompt_tokens_details=None, completion_tokens_details=None,
                            prompt_tokens_cache_hit=0, total_tokens=150,
                        ),
                    ))
                )
            )
        )
        compiler.model = "deepseek-flash"
        compiler.max_output_tokens = 4096
        original_body = "g.save(); drawBridge(g, 1, 1); g.restore();"
        shots = [
            {
                "index": index, "start_frame": index * 30, "end_frame": (index + 1) * 30,
                "name": f"Shot {index}", "draw_body": original_body,
                "mechanism_actions": [], "mechanisms": [], "transition_out": "cut",
            }
            for index in range(3)
        ]
        bundle = {
            "schema_version": 1, "duration": 3, "logical": [1600, 900],
            "style_id": "cinematic-editorial", "art_direction": {},
            "art_direction_instructions": "Editorial 2D shapes",
            "visual_bible": {"style_id": "cinematic-editorial", "characters": [], "props": [], "environments": []},
            "scenes": [
                {
                    "index": index, "start_frame": index * 30, "end_frame": (index + 1) * 30,
                    "characters": [], "props": [], "environment": "",
                }
                for index in range(3)
            ],
            "shared_js": "function drawBridge(g,x,y){ g.beginPath(); g.moveTo(x,y); g.lineTo(x+2,y+2); g.stroke(); }",
            "shots": shots,
        }
        result = await compiler.repair_shot(
            bundle,
            1,
            [{
                "shot_index": 1, "severity": "high", "category": "composition",
                "issue": "The bridge is too small in frame.",
                "recommendation": "Increase the bridge scale and keep it inside the canvas.",
                "evidence_sample_indices": [3],
            }],
        )
        self.assertEqual(result["repaired_shot_index"], 1)
        self.assertEqual(result["unchanged_shot_indices"], [0, 2])
        self.assertEqual(result["repair_bundle"]["shots"][0]["draw_body"], original_body)
        self.assertEqual(result["repair_bundle"]["shots"][2]["draw_body"], original_body)
        self.assertNotEqual(result["repair_bundle"]["shots"][1]["draw_body"], original_body)
        self.assertEqual(bundle["shots"][1]["draw_body"], original_body)
        self.assertIn("drawShot_0", result["scene_js"])
        self.assertIn("drawShot_1", result["scene_js"])
        self.assertIn("drawShot_2", result["scene_js"])
        compiler.client.chat.completions.create.assert_awaited_once()


class DrawingHelperContractTests(unittest.TestCase):
    def test_finds_missing_helper_used_by_shot(self):
        shared = "function drawBridge(g) { g.beginPath(); }"
        shots = ["drawBridge(g); drawPaperQuestionMark(g, 10, 20);"]
        self.assertEqual(
            find_unresolved_draw_helpers(shared, shots),
            ["drawPaperQuestionMark"],
        )

    def test_requires_custom_helpers_in_shared_scope(self):
        shared = "function drawBridge(g) { g.fillRect(0, 0, 10, 10); }"
        shots = [
            "function drawLocalGear(g) { g.fillRect(0, 0, 4, 4); } drawBridge(g); drawLocalGear(g); g.drawImage(img, 0, 0);"
        ]
        self.assertEqual(find_unresolved_draw_helpers(shared, shots), ["drawLocalGear"])

    def test_finds_missing_dependencies_inside_shared_helpers(self):
        shared = "function drawBridge(g) { drawMissingGear(g); }"
        self.assertEqual(find_unresolved_draw_helpers(shared, []), ["drawMissingGear"])

    def test_ignores_helper_names_in_comments_and_strings(self):
        shared = """
        // drawCommentOnly(g);
        function drawBridge(g) {
            const label = "drawStringOnly(g)";
            /* drawBlockCommentOnly(g); */
            g.fillRect(0, 0, 10, 10);
        }
        """
        self.assertEqual(find_unresolved_draw_helpers(shared, []), [])

    def test_nested_shared_helper_is_not_a_global_definition(self):
        shared = """
        function drawWrapper(g) {
            function drawNestedPart(g) { g.fillRect(0, 0, 10, 10); }
            drawNestedPart(g);
        }
        """
        self.assertEqual(find_unresolved_draw_helpers(shared, []), ["drawNestedPart"])

    def test_requires_generator_to_define_each_requested_helper(self):
        validate_draw_helper_definitions(
            "function drawPaperQuestionMark(g, x, y) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }",
            ["drawPaperQuestionMark"],
        )
        with self.assertRaisesRegex(ValueError, "drawPaperQuestionMark"):
            validate_draw_helper_definitions("function drawQuestion(g) {}", ["drawPaperQuestionMark"])
        with self.assertRaisesRegex(ValueError, "empty or incomplete"):
            validate_draw_helper_definitions("function drawPaperQuestionMark(g, x, y) {}", ["drawPaperQuestionMark"])
        with self.assertRaisesRegex(ValueError, "recursively call itself"):
            validate_draw_helper_definitions(
                "function drawPaperQuestionMark(g, x, y) { drawPaperQuestionMark(g, x, y); }",
                ["drawPaperQuestionMark"],
            )
        validate_draw_helper_definitions(
            "// function drawFake(g) { g.fillRect(0, 0, 1, 1); }\n"
            "function drawPaperQuestionMark(g, x, y) { g.fillRect(x, y, 4, 4); }",
            ["drawPaperQuestionMark"],
        )
        with self.assertRaisesRegex(ValueError, "no Canvas drawing operation"):
            validate_draw_helper_definitions("function drawPaperQuestionMark(g, x, y) { const unused = 1; }", ["drawPaperQuestionMark"])
        specification = {
            "name": "drawPaperQuestionMark",
            "signature": "function drawPaperQuestionMark(g, x, y)",
        }
        validate_draw_helper_definitions(
            "function drawPaperQuestionMark(g, x, y) { g.fillRect(x, y, 4, 4); }",
            ["drawPaperQuestionMark"],
            [specification],
        )
        with self.assertRaisesRegex(ValueError, "does not match its specification"):
            validate_draw_helper_definitions(
                "function drawPaperQuestionMark(g, x) { g.fillRect(x, 0, 4, 4); }",
                ["drawPaperQuestionMark"],
                [specification],
            )


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

    def test_shot_context_includes_props_backing_referenced_mechanisms(self):
        bible = {
            "style_id": "isometric-technical",
            "props": [
                {"id": "prop_deck", "design": "bridge deck"},
                {"id": "prop_actuator", "design": "hydraulic actuator"},
                {"id": "prop_unrelated", "design": "tree"},
            ],
            "mechanisms": [{
                "id": "mechanism_lift",
                "components": [
                    {"prop_id": "prop_deck", "part": "deck"},
                    {"prop_id": "prop_actuator", "part": "rod"},
                ],
            }],
        }
        scene = {
            "props": ["prop_unrelated"],
            "mechanism_actions": [{"mechanism_id": "mechanism_lift"}],
        }

        result = DeepSeekAnimationCompiler._shot_visual_context(bible, scene)

        self.assertEqual(
            {item["id"] for item in result["props"]},
            {"prop_deck", "prop_actuator", "prop_unrelated"},
        )
        self.assertEqual([item["id"] for item in result["mechanisms"]], ["mechanism_lift"])

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


class SharedHelperReplacementTests(unittest.TestCase):
    def test_replaces_only_requested_top_level_helper_and_preserves_other_source(self):
        shared = """
        const palette = { ink: "#111" };
        function drawBridge(g, x) { g.fillRect(x, 0, 10, 10); }
        function drawTower(g, x) { g.fillRect(x, 0, 5, 20); }
        """
        replacement = "function drawBridge(g, x) { g.fillRect(x, 0, 20, 10); }"
        extracted = extract_shared_draw_helpers(shared, ["drawBridge"])
        self.assertIn("g.fillRect(x, 0, 10, 10)", extracted["drawBridge"])
        updated = replace_shared_draw_helpers(shared, replacement, ["drawBridge"])
        self.assertIn('const palette = { ink: "#111" };', updated)
        self.assertIn("g.fillRect(x, 0, 20, 10)", updated)
        self.assertIn("function drawTower(g, x)", updated)
        self.assertNotIn("g.fillRect(x, 0, 10, 10)", updated)

    def test_rejects_missing_or_duplicate_top_level_declarations(self):
        with self.assertRaisesRegex(ValueError, "found 0"):
            extract_shared_draw_helpers("function drawTower(g) {}", ["drawBridge"])
        duplicate = "function drawBridge(g) {} function drawBridge(g) {}"
        with self.assertRaisesRegex(ValueError, "found 2"):
            extract_shared_draw_helpers(duplicate, ["drawBridge"])


class DrawingHelperDependencyGraphTests(unittest.TestCase):
    def test_accepts_acyclic_dependencies(self):
        validate_draw_helper_dependency_graph([
            {"name": "drawBridge", "dependencies": ["drawTower"]},
            {"name": "drawTower", "dependencies": []},
        ])

    def test_rejects_circular_dependencies(self):
        with self.assertRaisesRegex(ValueError, "Circular drawing helper dependency"):
            validate_draw_helper_dependency_graph([
                {"name": "drawBridge", "dependencies": ["drawTower"]},
                {"name": "drawTower", "dependencies": ["drawBridge"]},
            ])


class DrawingHelperSpecificationTests(unittest.TestCase):
    @staticmethod
    def _spec(name="drawSkyHalftone"):
        return {
            "name": name,
            "category": "effect",
            "purpose": "Render a restrained halftone texture over the sky region.",
            "signature": f"function {name}(g, x, y, width, height, time)",
            "coordinate_system": "logical_canvas coordinates in pixels",
            "origin": "Top-left corner of the clipped sky region; scale is expressed by width and height.",
            "visual_target": "Evenly spaced small dots with consistent density and low contrast.",
            "style_requirements": "Use the film palette and restrained editorial texture.",
            "animation_behavior": "Static texture; time is accepted for a stable shared signature and must not cause flicker.",
            "dependencies": [],
            "acceptance_criteria": [
                "Dots are visibly rendered inside the requested sky region.",
                "No dots appear outside the sky bounds and the effect does not obscure the focal subject.",
            ],
        }

    def test_validates_exact_required_function_specs(self):
        result = validate_draw_helper_specs(
            {"functions": [self._spec()]},
            ["drawSkyHalftone"],
        )
        self.assertEqual(result[0]["name"], "drawSkyHalftone")
        self.assertEqual(result[0]["category"], "effect")
        self.assertEqual(len(result[0]["acceptance_criteria"]), 2)

    def test_rejects_missing_or_unexpected_function_specs(self):
        with self.assertRaisesRegex(ValueError, "Missing drawing helper specifications"):
            validate_draw_helper_specs({"functions": []}, ["drawSkyHalftone"])
        with self.assertRaisesRegex(ValueError, "unexpected function name"):
            validate_draw_helper_specs(
                {"functions": [self._spec("drawOtherThing")]},
                ["drawSkyHalftone"],
            )

    def test_rejects_invalid_signature_and_dependencies(self):
        spec = self._spec()
        spec["signature"] = "function drawSkyHalftone(x, g)"
        with self.assertRaisesRegex(ValueError, "signature"):
            validate_draw_helper_specs({"functions": [spec]}, ["drawSkyHalftone"])

        spec = self._spec()
        spec["dependencies"] = ["window"]
        with self.assertRaisesRegex(ValueError, "dependencies"):
            validate_draw_helper_specs({"functions": [spec]}, ["drawSkyHalftone"])

    def test_rejects_duplicate_specs(self):
        with self.assertRaisesRegex(ValueError, "Duplicate drawing helper"):
            validate_draw_helper_specs(
                {"functions": [self._spec(), self._spec()]},
                ["drawSkyHalftone"],
            )


if __name__ == "__main__":
    unittest.main()
