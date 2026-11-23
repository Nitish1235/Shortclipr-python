import unittest

from app.services.deepseek_animation import (
    COMPILER_VERSION,
    RUNTIME_CONTRACT_VERSION,
    DeepSeekAnimationCompiler,
)
from app.services.animation_contracts import (
    find_unresolved_draw_helpers,
    find_unresolved_film_draw_helpers,
    validate_draw_helper_definitions,
    validate_draw_helper_specs,
    validate_draw_helper_dependencies,
    validate_draw_helper_dependency_graph,
    extract_shared_draw_helpers,
    replace_shared_draw_helpers,
)


class ShotGenerationStageTests(unittest.TestCase):
    def test_layout_spec_requires_composition_and_meaningful_layers(self):
        layout = {
            "composition": "Bridge deck runs diagonally from lower left to upper right.",
            "camera": "Low three-quarter view.",
            "focal_subject": "prop_bridge_deck",
            "depth_layers": [
                {"layer": "background", "content": "River valley", "purpose": "Establish scale"},
                {"layer": "midground", "content": "Bridge structure", "purpose": "Show the engineering subject"},
            ],
            "lighting": "Warm side light from upper left.",
            "style_application": "Cut-paper silhouettes with restrained grain.",
            "continuity": "Keep the deck geometry and palette consistent.",
        }
        self.assertEqual(
            DeepSeekAnimationCompiler._validate_shot_layout(layout, "Shot 1"),
            layout,
        )
        invalid = dict(layout)
        invalid["depth_layers"] = [
            {"layer": "midground", "content": "Bridge", "purpose": "Subject"},
            {"layer": "midground", "content": "River", "purpose": "Context"},
        ]
        with self.assertRaisesRegex(ValueError, "duplicate depth layer"):
            DeepSeekAnimationCompiler._validate_shot_layout(invalid, "Shot 1")

    def test_motion_spec_requires_complete_action_arc(self):
        motion = {
            "initial_state": "Deck is horizontal above the river.",
            "primary_action": "Deck rotates upward around the hinge.",
            "final_state": "Deck settles at the raised angle.",
            "timing": "Pause, accelerate, then ease into the final position.",
            "secondary_motion": "Water continues flowing.",
            "camera_motion": "Locked camera.",
            "mechanism_motion": "Use the declared pivot kinematics.",
            "physical_constraints": {
                "motion_type": "static",
                "anchors": [],
                "relationships": [],
                "constraints": [],
                "forces_and_effects": [],
                "collision_rules": [],
                "motion_profile": {
                    "start": "none", "acceleration": "none", "peak": "none",
                    "deceleration": "none", "settle": "holds steady",
                },
            },
        }
        self.assertEqual(
            DeepSeekAnimationCompiler._validate_shot_motion(motion, "Shot 1"),
            motion,
        )
        invalid = dict(motion)
        invalid["primary_action"] = ""
        with self.assertRaisesRegex(ValueError, "primary_action"):
            DeepSeekAnimationCompiler._validate_shot_motion(invalid, "Shot 1")


class ShotStructuredResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_requests_json_mode_and_parses_single_response(self):
        import json
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler.model = "deepseek-chat"
        compiler.client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(return_value=SimpleNamespace(
                        choices=[SimpleNamespace(
                            message=SimpleNamespace(content=json.dumps({"composition": "diagonal"})),
                            finish_reason="stop",
                        )],
                        usage=None,
                    ))
                )
            )
        )

        result = await compiler._json_object_completion(
            "Return JSON.",
            "Create the layout.",
            1000,
            "Shot 1 visual composition",
        )

        self.assertEqual(result, {"composition": "diagonal"})
        kwargs = compiler.client.chat.completions.create.await_args.kwargs
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        compiler.client.chat.completions.create.assert_awaited_once()

    async def test_invalid_structured_response_fails_without_retry(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler.model = "deepseek-chat"
        compiler.client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(return_value=SimpleNamespace(
                        choices=[SimpleNamespace(
                            message=SimpleNamespace(content='{"layout":"broken\nvalue"}'),
                            finish_reason="stop",
                        )],
                        usage=None,
                    ))
                )
            )
        )

        with self.assertRaisesRegex(RuntimeError, "invalid structured JSON"):
            await compiler._json_object_completion(
                "Return JSON.",
                "Create the layout.",
                1000,
                "Shot 1 visual composition",
            )
        compiler.client.chat.completions.create.assert_awaited_once()


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
        self.assertEqual(context["function_registry"], [])
        self.assertEqual(context["function_specs"], [])
        helper_context = DeepSeekAnimationCompiler._visual_qa_context(
            bible, scenes, [{
                "name": "drawHinge",
                "category": "visual",
                "signature": "function drawHinge(g, x)",
                "purpose": "Draw the hinge",
                "visual_target": "A visible hinge",
                "dependencies": [],
                "required_by_shots": [0],
                "version": 1,
            }],
        )
        self.assertEqual(helper_context["function_registry"][0]["name"], "drawHinge")
        self.assertEqual(helper_context["function_registry"][0]["required_by_shots"], [0])


class TargetedSharedHelperRepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_repairs_only_registered_helper_and_preserves_shot_sources(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler.client = object()
        compiler.max_output_tokens = 12000
        compiler._code_completion = AsyncMock(side_effect=[
            "function drawBridge(g, x) { drawMissingDecoration(g, x); g.fillRect(x, 0, 20, 10); }",
            "function drawBridge(g, x) { g.fillStyle = '#222'; g.fillRect(x, 0, 20, 10); }",
        ])
        spec = {
            "name": "drawBridge",
            "category": "visual",
            "signature": "function drawBridge(g, x)",
            "purpose": "Draw the bridge deck.",
            "coordinate_system": "Logical canvas pixels.",
            "origin": "The deck left edge.",
            "visual_target": "A readable horizontal deck silhouette.",
            "style_requirements": "Use the existing film palette.",
            "animation_behavior": "Static.",
            "dependencies": [],
            "acceptance_criteria": [
                "Deck is visible at the specified x coordinate.",
                "Deck has a consistent 20 pixel width.",
            ],
            "required_by_shots": [0],
            "version": 1,
        }
        paint_tower_spec = {
            "name": "paintTower",
            "category": "visual",
            "signature": "function paintTower(g, x)",
            "purpose": "Draw the reusable tower component.",
            "coordinate_system": "Logical canvas pixels.",
            "origin": "The tower base.",
            "visual_target": "A stable tower silhouette.",
            "style_requirements": "Use the same film palette.",
            "animation_behavior": "Static.",
            "dependencies": [],
            "acceptance_criteria": ["Has a clear tower silhouette.", "Remains stable across shots."],
            "required_by_shots": [],
            "version": 1,
        }
        original_body = "drawBridge(g, 30);"
        bundle = {
            "schema_version": 1,
            "duration": 3,
            "logical": [1080, 1920],
            "style_id": "cinematic-editorial",
            "shared_js": (
                "function drawBridge(g, x) { g.fillRect(x, 0, 10, 10); }\n"
                "function paintTower(g, x) { g.fillRect(x, 0, 5, 20); }"
            ),
            "shots": [{
                "index": 0,
                "name": "Bridge",
                "start_frame": 0,
                "end_frame": 90,
                "draw_body": original_body,
                "required_helpers": ["drawBridge"],
                "used_helpers": ["drawBridge"],
                "mechanism_actions": [],
                "mechanisms": [],
                "transition_out": "cut",
            }],
            "helper_manifest": {
                "schema_version": 1,
                "functions": [spec, paint_tower_spec],
                "shots": [{"index": 0, "required_helpers": ["drawBridge"], "required_entities": []}],
            },
            "function_specs": [spec, paint_tower_spec],
            "function_registry": [
                {
                    "name": "drawBridge",
                    "category": "visual",
                    "signature": spec["signature"],
                    "dependencies": [],
                    "required_by_shots": [0],
                    "version": 1,
                },
                {
                    "name": "paintTower",
                    "category": "visual",
                    "signature": paint_tower_spec["signature"],
                    "dependencies": [],
                    "required_by_shots": [],
                    "version": 1,
                },
            ],
            "visual_bible": {},
            "art_direction": {},
            "art_direction_instructions": "Cinematic editorial.",
        }
        findings = [{
            "shot_index": 0,
            "severity": "high",
            "confidence": 0.9,
            "evidence_sample_indices": [0],
            "issue": "The bridge deck appears too narrow.",
            "recommendation": "Increase the deck's visible width.",
        }]

        result = await compiler.repair_shared_helpers(bundle, ["drawBridge"], findings)

        self.assertIn("g.fillRect(x, 0, 20, 10)", result["repair_bundle"]["shared_js"])
        self.assertIn("function paintTower(g, x)", result["repair_bundle"]["shared_js"])
        self.assertEqual(result["repair_bundle"]["shots"][0]["draw_body"], original_body)
        self.assertEqual(result["repaired_function_names"], ["drawBridge"])
        self.assertEqual(result["repair_bundle"]["function_specs"][0]["version"], 2)
        self.assertEqual(result["repair_bundle"]["helper_manifest"]["functions"][0]["version"], 2)
        self.assertEqual(result["repair_bundle"]["function_registry"][0]["version"], 2)
        self.assertEqual(result["helper_manifest"]["functions"][0]["version"], 2)
        self.assertEqual(result["function_registry"][0]["version"], 2)
        self.assertEqual(compiler._code_completion.await_count, 2)
        repair_prompt = compiler._code_completion.await_args_list[1].args[1]
        self.assertIn("drawMissingDecoration", repair_prompt)


class TargetedShotRepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_repair_replaces_only_requested_shot_and_keeps_shared_library(self):
        import json
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        responses = [
            SimpleNamespace(
                choices=[SimpleNamespace(
                    message=SimpleNamespace(
                        content="g.save(); drawMissing(g, 20, 20); g.restore();"
                    ),
                    finish_reason="stop",
                )],
                usage=SimpleNamespace(
                    prompt_tokens=100, completion_tokens=50,
                    prompt_tokens_details=None, completion_tokens_details=None,
                    prompt_tokens_cache_hit=0, total_tokens=150,
                ),
            ),
            SimpleNamespace(
                choices=[SimpleNamespace(
                    message=SimpleNamespace(
                        content="g.save(); drawBridge(g, 20, 20); g.restore();"
                    ),
                    finish_reason="stop",
                )],
                usage=SimpleNamespace(
                    prompt_tokens=100, completion_tokens=50,
                    prompt_tokens_details=None, completion_tokens_details=None,
                    prompt_tokens_cache_hit=0, total_tokens=150,
                ),
            ),
        ]
        compiler.client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=AsyncMock(side_effect=responses))
            )
        )
        compiler.model = "deepseek-flash"
        compiler.max_output_tokens = 4096
        original_body = "g.save(); drawBridge(g, 1, 1); g.restore();"
        shots = [
            {
                "index": index, "start_frame": index * 30, "end_frame": (index + 1) * 30,
                "name": f"Shot {index}", "draw_body": original_body,
                "required_helpers": ["drawBridge"], "used_helpers": ["drawBridge"],
                "mechanism_actions": [], "mechanisms": [], "transition_out": "cut",
            }
            for index in range(3)
        ]
        bridge_spec = {
            "name": "drawBridge", "category": "visual",
            "signature": "function drawBridge(g, x, y)",
            "purpose": "Draw the bridge.", "coordinate_system": "local",
            "origin": "left", "visual_target": "Bridge deck",
            "style_requirements": "Editorial", "animation_behavior": "Static",
            "dependencies": [], "acceptance_criteria": ["Visible", "Consistent"],
            "required_by_shots": [0, 1, 2], "version": 1,
        }
        helper_manifest = {
            "schema_version": 1,
            "functions": [bridge_spec],
            "shots": [
                {"index": index, "required_helpers": ["drawBridge"], "required_entities": []}
                for index in range(3)
            ],
        }
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
            "helper_manifest": helper_manifest,
            "function_specs": [bridge_spec],
            "function_registry": [{
                "name": "drawBridge", "category": "visual",
                "signature": bridge_spec["signature"], "dependencies": [],
                "required_by_shots": [0, 1, 2], "version": 1,
            }],
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
        self.assertEqual(compiler.client.chat.completions.create.await_count, 2)
        repair_prompt = compiler.client.chat.completions.create.await_args_list[1].kwargs["messages"][1]["content"]
        self.assertIn("drawMissing", repair_prompt)
        self.assertIn("REJECTED CANDIDATE", repair_prompt)


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
        function paintTower(g, x) { g.fillRect(x, 0, 5, 20); }
        """
        replacement = "function drawBridge(g, x) { g.fillRect(x, 0, 20, 10); }"
        extracted = extract_shared_draw_helpers(shared, ["drawBridge"])
        self.assertIn("g.fillRect(x, 0, 10, 10)", extracted["drawBridge"])
        updated = replace_shared_draw_helpers(shared, replacement, ["drawBridge"])
        self.assertIn('const palette = { ink: "#111" };', updated)
        self.assertIn("g.fillRect(x, 0, 20, 10)", updated)
        self.assertIn("function paintTower(g, x)", updated)
        self.assertNotIn("g.fillRect(x, 0, 10, 10)", updated)

    def test_rejects_missing_or_duplicate_top_level_declarations(self):
        with self.assertRaisesRegex(ValueError, "found 0"):
            extract_shared_draw_helpers("function paintTower(g) {}", ["drawBridge"])
        duplicate = "function drawBridge(g) {} function drawBridge(g) {}"
        with self.assertRaisesRegex(ValueError, "found 2"):
            extract_shared_draw_helpers(duplicate, ["drawBridge"])


class DrawingHelperImplementationDependencyTests(unittest.TestCase):
    def test_declared_dependencies_must_match_calls_in_shared_implementations(self):
        source = """
        function drawPropGear(g) { g.fillRect(0, 0, 8, 8); }
        function drawCharacterEngineer(g) {
            drawPropGear(g);
            g.fillRect(10, 10, 20, 30);
        }
        """
        specs = [
            {"name": "drawPropGear", "dependencies": []},
            {"name": "drawCharacterEngineer", "dependencies": ["drawPropGear"]},
        ]
        validate_draw_helper_dependencies(source, specs)

    def test_missing_dependency_declaration_is_rejected_before_shot_generation(self):
        source = """
        function drawPropGear(g) { g.fillRect(0, 0, 8, 8); }
        function drawCharacterEngineer(g) {
            drawPropGear(g);
            g.fillRect(10, 10, 20, 30);
        }
        """
        specs = [
            {"name": "drawPropGear", "dependencies": []},
            {"name": "drawCharacterEngineer", "dependencies": []},
        ]
        with self.assertRaisesRegex(ValueError, "dependency manifest does not match"):
            validate_draw_helper_dependencies(source, specs)

    def test_declared_but_unused_dependency_is_rejected(self):
        source = """
        function drawPropGear(g) { g.fillRect(0, 0, 8, 8); }
        function drawCharacterEngineer(g) { g.fillRect(10, 10, 20, 30); }
        """
        specs = [
            {"name": "drawPropGear", "dependencies": []},
            {"name": "drawCharacterEngineer", "dependencies": ["drawPropGear"]},
        ]
        with self.assertRaisesRegex(ValueError, "dependency manifest does not match"):
            validate_draw_helper_dependencies(source, specs)


class DrawingHelperDependencyGraphTests(unittest.TestCase):
    def test_accepts_acyclic_dependencies(self):
        validate_draw_helper_dependency_graph([
            {"name": "drawBridge", "dependencies": ["paintTower"]},
            {"name": "paintTower", "dependencies": []},
        ])

    def test_rejects_circular_dependencies(self):
        with self.assertRaisesRegex(ValueError, "Circular drawing helper dependency"):
            validate_draw_helper_dependency_graph([
                {"name": "drawBridge", "dependencies": ["paintTower"]},
                {"name": "paintTower", "dependencies": ["drawBridge"]},
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


class VisualContinuityContractTests(unittest.TestCase):
    def test_contract_reuses_canonical_visual_bible_entities_without_mutation(self):
        from app.services.shot_design_contracts import build_visual_continuity_contract

        bible = {
            "style_id": "cinematic-editorial",
            "style_notes": "Muted technical palette",
            "characters": [{"id": "char_engineer", "design": {"jacket": "orange"}}],
            "props": [{"id": "prop_bridge", "design": "steel bascule deck"}],
            "environments": [{"id": "env_river", "design": "river valley"}],
            "mechanisms": [],
        }
        original = __import__("copy").deepcopy(bible)

        contract = build_visual_continuity_contract(bible)

        self.assertEqual(contract["characters"], bible["characters"])
        self.assertEqual(contract["props"], bible["props"])
        self.assertEqual(contract["environments"], bible["environments"])
        self.assertEqual(contract["style"]["style_id"], "cinematic-editorial")
        self.assertTrue(contract["identity_invariants"])
        self.assertTrue(contract["state_change_policy"])
        self.assertEqual(bible, original)

    def test_shot_contract_filters_entities_and_includes_mechanism_component_props(self):
        from app.services.shot_design_contracts import (
            build_visual_continuity_contract,
            build_shot_continuity_context,
        )

        bible = {
            "style_id": "isometric-technical",
            "characters": [
                {"id": "char_a", "design": "engineer"},
                {"id": "char_b", "design": "observer"},
            ],
            "props": [
                {"id": "prop_deck", "design": "bridge deck"},
                {"id": "prop_counterweight", "design": "counterweight"},
                {"id": "prop_unrelated", "design": "tree"},
            ],
            "environments": [
                {"id": "env_river", "design": "river"},
                {"id": "env_city", "design": "city"},
            ],
            "mechanisms": [{
                "id": "mechanism_lift",
                "components": [
                    {"prop_id": "prop_deck", "part": "deck"},
                    {"prop_id": "prop_counterweight", "part": "counterweight"},
                ],
            }],
        }
        contract = build_visual_continuity_contract(bible)
        context = build_shot_continuity_context(contract, {
            "characters": ["char_a"],
            "props": ["prop_unrelated"],
            "environment": "env_river",
            "mechanism_actions": [{"mechanism_id": "mechanism_lift"}],
        })

        self.assertEqual([item["id"] for item in context["characters"]], ["char_a"])
        self.assertEqual(
            {item["id"] for item in context["props"]},
            {"prop_deck", "prop_counterweight", "prop_unrelated"},
        )
        self.assertEqual([item["id"] for item in context["environments"]], ["env_river"])
        self.assertEqual([item["id"] for item in context["mechanisms"]], ["mechanism_lift"])


class PhysicalMotionContractTests(unittest.TestCase):
    @staticmethod
    def _physical_constraints():
        return {
            "motion_type": "mechanical",
            "anchors": [
                {"entity_id": "prop_deck", "point": "fixed hinge", "role": "rotation pivot"},
            ],
            "relationships": [
                {
                    "source_entity_id": "prop_deck",
                    "target_entity_id": "prop_counterweight",
                    "relationship": "cable-linked counterweight",
                    "behavior": "moves in response to deck rotation",
                },
            ],
            "constraints": [
                {"entity_id": "prop_deck", "rule": "rotates around the fixed hinge"},
            ],
            "forces_and_effects": [],
            "collision_rules": [],
            "motion_profile": {
                "start": "brief hold",
                "acceleration": "smoothly accelerates",
                "peak": "main raising movement",
                "deceleration": "slows near the target angle",
                "settle": "holds at the raised position",
            },
        }

    def test_validates_physical_constraints_and_normalizes_profile(self):
        from app.services.shot_design_contracts import validate_physical_constraints

        result = validate_physical_constraints(
            self._physical_constraints(),
            "Shot 1",
            {"prop_deck", "prop_counterweight"},
        )

        self.assertEqual(result["motion_type"], "mechanical")
        self.assertEqual(result["anchors"][0]["entity_id"], "prop_deck")
        self.assertEqual(result["motion_profile"]["settle"], "holds at the raised position")

    def test_rejects_unknown_entity_references(self):
        from app.services.shot_design_contracts import validate_physical_constraints

        value = self._physical_constraints()
        value["relationships"][0]["target_entity_id"] = "invented_component"
        with self.assertRaisesRegex(ValueError, "unknown entity"):
            validate_physical_constraints(
                value, "Shot 1", {"prop_deck", "prop_counterweight"},
            )

    def test_rejects_invalid_motion_type_and_incomplete_motion_profile(self):
        from app.services.shot_design_contracts import validate_physical_constraints

        value = self._physical_constraints()
        value["motion_type"] = "teleportation"
        with self.assertRaisesRegex(ValueError, "unsupported motion_type"):
            validate_physical_constraints(
                value, "Shot 1", {"prop_deck", "prop_counterweight"},
            )

        value = self._physical_constraints()
        del value["motion_profile"]["settle"]
        with self.assertRaisesRegex(ValueError, "motion_profile.settle"):
            validate_physical_constraints(
                value, "Shot 1", {"prop_deck", "prop_counterweight"},
            )

    def test_shot_motion_validator_requires_physical_contract(self):
        motion = {
            "initial_state": "The deck is horizontal.",
            "primary_action": "The deck rotates upward around its hinge.",
            "final_state": "The deck is raised.",
            "timing": "Accelerates and settles.",
            "secondary_motion": "The counterweight follows the cable.",
            "camera_motion": "Locked camera.",
            "mechanism_motion": "Use supplied validated pivot kinematics.",
            "physical_constraints": self._physical_constraints(),
        }

        result = DeepSeekAnimationCompiler._validate_shot_motion(
            motion, "Shot 1", {"prop_deck", "prop_counterweight"},
        )

        self.assertEqual(result["physical_constraints"]["motion_type"], "mechanical")
        invalid = dict(motion)
        invalid.pop("physical_constraints")
        with self.assertRaisesRegex(ValueError, "physical_constraints must be an object"):
            DeepSeekAnimationCompiler._validate_shot_motion(
                invalid, "Shot 1", {"prop_deck", "prop_counterweight"},
            )



class SharedHelperScopeRegressionTests(unittest.TestCase):
    def test_helper_definition_must_be_top_level_and_unique(self):
        nested = """
        function drawWrapper(g) {
            function drawRequested(g) { g.fillRect(0, 0, 10, 10); }
        }
        """
        with self.assertRaisesRegex(ValueError, "top-level"):
            validate_draw_helper_definitions(nested, ["drawRequested"])

        duplicate = (
            "function drawRequested(g) { g.fillRect(0, 0, 2, 2); }"
            "function drawRequested(g) { g.fillRect(0, 0, 3, 3); }"
        )
        with self.assertRaisesRegex(ValueError, "exactly once"):
            validate_draw_helper_definitions(duplicate, ["drawRequested"])

    def test_compiled_program_rejects_unresolved_helpers_before_render(self):
        bridge_spec = {
            "name": "drawBridge", "category": "visual",
            "signature": "function drawBridge(g)",
            "purpose": "Draw the bridge.", "coordinate_system": "local",
            "origin": "left", "visual_target": "Bridge deck",
            "style_requirements": "Line", "animation_behavior": "Static",
            "dependencies": [], "acceptance_criteria": ["Visible", "Consistent"],
            "required_by_shots": [0], "version": 1,
        }
        valid_bundle = {
            "shared_js": "function drawBridge(g) { g.fillRect(0, 0, 10, 10); }",
            "shots": [{
                "index": 0, "start_frame": 0, "end_frame": 30, "name": "Bridge",
                "draw_body": "drawBridge(g);",
                "required_helpers": ["drawBridge"], "used_helpers": ["drawBridge"],
            }],
            "helper_manifest": {
                "schema_version": 1, "functions": [bridge_spec],
                "shots": [{"index": 0, "required_helpers": ["drawBridge"], "required_entities": []}],
            },
            "function_specs": [bridge_spec],
            "function_registry": [{
                "name": "drawBridge", "category": "visual",
                "signature": bridge_spec["signature"], "dependencies": [],
                "required_by_shots": [0], "version": 1,
            }],
            "duration": 1, "logical": [1600, 900], "style_id": "line",
        }
        source = DeepSeekAnimationCompiler._assemble_film(
            valid_bundle["shared_js"], valid_bundle["shots"], 1, [1600, 900], "line",
        )
        DeepSeekAnimationCompiler.validate_compiled_program({
            "compiler_version": COMPILER_VERSION,
            "runtime_contract_version": RUNTIME_CONTRACT_VERSION,
            "scene_js": source,
            "repair_bundle": valid_bundle,
        })

        invalid_source = source.replace("drawBridge(g);", "drawMissingWheel(g);")
        with self.assertRaisesRegex(ValueError, "drawMissingWheel"):
            DeepSeekAnimationCompiler.validate_compiled_program({
                "compiler_version": COMPILER_VERSION,
                "runtime_contract_version": RUNTIME_CONTRACT_VERSION,
                "scene_js": invalid_source,
                "repair_bundle": valid_bundle,
            })

    def test_compiled_program_rejects_top_level_shot_manifest_drift(self):
        bridge_spec = {
            "name": "drawBridge", "category": "visual",
            "signature": "function drawBridge(g)",
            "purpose": "Draw the bridge.", "coordinate_system": "local",
            "origin": "left", "visual_target": "Bridge deck",
            "style_requirements": "Line", "animation_behavior": "Static",
            "dependencies": [], "acceptance_criteria": ["Visible", "Consistent"],
            "required_by_shots": [0], "version": 1,
        }
        shot = {
            "index": 0, "start_frame": 0, "end_frame": 30, "name": "Bridge",
            "draw_body": "drawBridge(g);", "required_helpers": ["drawBridge"],
            "mechanism_actions": [], "mechanisms": [],
        }
        bundle = {
            "shared_js": "function drawBridge(g) { g.fillRect(0, 0, 10, 10); }",
            "shots": [shot],
            "helper_manifest": {
                "schema_version": 1, "functions": [bridge_spec],
                "shots": [{"index": 0, "required_helpers": ["drawBridge"], "required_entities": []}],
            },
            "function_specs": [bridge_spec],
            "function_registry": [{
                "name": "drawBridge", "category": "visual",
                "signature": bridge_spec["signature"], "dependencies": [],
                "required_by_shots": [0], "version": 1,
            }],
            "duration": 1, "logical": [1600, 900], "style_id": "line",
        }
        source = DeepSeekAnimationCompiler._assemble_film(
            bundle["shared_js"], [shot], 1, [1600, 900], "line",
        )
        program = {
            "compiler_version": COMPILER_VERSION,
            "runtime_contract_version": RUNTIME_CONTRACT_VERSION,
            "scene_js": source, "repair_bundle": bundle,
            "helper_manifest": bundle["helper_manifest"],
            "function_specs": bundle["function_specs"],
            "function_registry": bundle["function_registry"],
            "shot_count": 1, "style": "line",
            "shot_manifest": [{
                "index": 0, "start_frame": 0, "end_frame": 30,
                "name": "Bridge", "mechanism_ids": [], "transition_out": "cut",
            }],
        }
        DeepSeekAnimationCompiler.validate_compiled_program(program)
        program["shot_manifest"][0]["name"] = "Different"
        with self.assertRaisesRegex(ValueError, "Top-level shot manifest"):
            DeepSeekAnimationCompiler.validate_compiled_program(program)

    def test_compiled_program_rejects_artifacts_from_previous_contract_version(self):
        with self.assertRaisesRegex(ValueError, "obsolete compiler version"):
            DeepSeekAnimationCompiler.validate_compiled_program({
                "compiler_version": "function-first-v1",
                "runtime_contract_version": 1,
                "scene_js": "function drawShot_0(g,t,e,a) { g.fillRect(0,0,1,1); }",
                "repair_bundle": {},
            })

    def test_compiled_program_rejects_scene_and_repair_bundle_drift(self):
        bridge_spec = {
            "name": "drawBridge", "category": "visual",
            "signature": "function drawBridge(g)",
            "purpose": "Draw the bridge.", "coordinate_system": "local",
            "origin": "left", "visual_target": "Bridge deck",
            "style_requirements": "Line", "animation_behavior": "Static",
            "dependencies": [], "acceptance_criteria": ["Visible", "Consistent"],
            "required_by_shots": [0], "version": 1,
        }
        bundle = {
            "shared_js": "function drawBridge(g) { g.fillRect(0, 0, 10, 10); }",
            "shots": [{
                "index": 0, "start_frame": 0, "end_frame": 30, "name": "Bridge",
                "draw_body": "drawBridge(g);",
                "required_helpers": ["drawBridge"], "used_helpers": ["drawBridge"],
            }],
            "helper_manifest": {
                "schema_version": 1, "functions": [bridge_spec],
                "shots": [{"index": 0, "required_helpers": ["drawBridge"], "required_entities": []}],
            },
            "function_specs": [bridge_spec],
            "function_registry": [{
                "name": "drawBridge", "category": "visual",
                "signature": bridge_spec["signature"], "dependencies": [],
                "required_by_shots": [0], "version": 1,
            }],
            "duration": 1, "logical": [1600, 900], "style_id": "line",
        }
        different_shots = [{
            **bundle["shots"][0],
            "draw_body": "drawBridge(g); g.fillRect(1, 1, 2, 2);",
        }]
        different_source = DeepSeekAnimationCompiler._assemble_film(
            bundle["shared_js"], different_shots, 1, [1600, 900], "line",
        )
        with self.assertRaisesRegex(ValueError, "does not match"):
            DeepSeekAnimationCompiler.validate_compiled_program({
                "compiler_version": COMPILER_VERSION,
                "runtime_contract_version": RUNTIME_CONTRACT_VERSION,
                "scene_js": different_source,
                "repair_bundle": bundle,
            })


class TemplateExpressionHelperValidationTests(unittest.TestCase):
    def test_compiled_program_requires_repair_bundle(self):
        with self.assertRaisesRegex(ValueError, "required repair_bundle"):
            DeepSeekAnimationCompiler.validate_compiled_program({
                "scene_js": "function drawShot_0(g,t,e,a) { g.fillRect(0,0,1,1); }",
            })

    def test_finds_unresolved_helpers_inside_template_expressions(self):
        source = """
        function drawShot_0(g, t, env, absoluteTime) {
            const label = `Wheel: ${drawProp_wheel(g, 10, 20)}`;
            g.fillText(label, 0, 0);
        }
        """
        self.assertEqual(
            find_unresolved_film_draw_helpers(source),
            ["drawProp_wheel"],
        )

    def test_ignores_helper_names_in_template_text_but_checks_interpolations(self):
        source = """
        function drawWheel(g) { g.fillRect(0, 0, 10, 10); }
        function drawShot_0(g, t, env, absoluteTime) {
            const label = `drawMissing(g) is only documentation`;
            const visual = `${drawWheel?.(g)} ${drawMissing(g)}`;
        }
        """
        self.assertEqual(
            find_unresolved_film_draw_helpers(source),
            ["drawMissing"],
        )



class BoundedGenerationRepairTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_shared_or_shot_fragment_is_retried_with_exact_contract_error(self):
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler._code_completion = AsyncMock(side_effect=[
            "function drawScene(g) { drawCharacter(g); }",
            "function drawScene(g) { g.fillRect(0, 0, 10, 10); }",
        ])

        def validate(source):
            if "drawCharacter(" in source:
                raise ValueError("Drawing helper drawCharacter is not declared in the shared API")

        result = await compiler._validated_fragment(
            "Return executable JavaScript.",
            "Generate a scene body.",
            2000,
            "draw_body",
            "Shot 1",
            10000,
            validator=validate,
        )

        self.assertIn("fillRect", result)
        self.assertEqual(compiler._code_completion.await_count, 2)
        repair_prompt = compiler._code_completion.await_args_list[1].args[1]
        self.assertIn("drawCharacter is not declared", repair_prompt)
        self.assertIn("REJECTED CANDIDATE", repair_prompt)
        self.assertIn("drawCharacter(g)", repair_prompt)

    async def test_fragment_generation_fails_closed_after_three_invalid_attempts(self):
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler._code_completion = AsyncMock(return_value=(
            "function drawScene(g) { drawUnknown(g); }"
        ))

        def reject(_source):
            raise ValueError("drawUnknown is not in the verified helper library")

        with self.assertRaisesRegex(ValueError, "after 3 generation attempts"):
            await compiler._validated_fragment(
                "Return executable JavaScript.",
                "Generate a scene body.",
                2000,
                "draw_body",
                "Shot 1",
                10000,
                validator=reject,
            )
        self.assertEqual(compiler._code_completion.await_count, 3)

    async def test_invalid_layout_or_motion_json_is_retried_with_validation_feedback(self):
        from unittest.mock import AsyncMock

        compiler = DeepSeekAnimationCompiler.__new__(DeepSeekAnimationCompiler)
        compiler._json_object_completion = AsyncMock(side_effect=[
            {"composition": ""},
            {"composition": "A clear diagonal bridge composition."},
        ])

        def validate(value):
            if not value.get("composition", "").strip():
                raise ValueError("composition must be non-empty")
            return value

        result = await compiler._validated_json_object_completion(
            "Return JSON only.",
            "Design a composition.",
            1000,
            "Shot 1 visual composition",
            validate,
        )

        self.assertEqual(result["composition"], "A clear diagonal bridge composition.")
        self.assertEqual(compiler._json_object_completion.await_count, 2)
        repair_prompt = compiler._json_object_completion.await_args_list[1].args[1]
        self.assertIn("composition must be non-empty", repair_prompt)
        self.assertIn("REJECTED JSON CANDIDATE", repair_prompt)


if __name__ == "__main__":
    unittest.main()
