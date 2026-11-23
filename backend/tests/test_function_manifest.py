import unittest

from app.services.function_manifest import (
    build_required_function_manifest,
    find_missing_required_helper_usage,
)


class RequiredFunctionManifestTests(unittest.TestCase):
    def setUp(self):
        self.visual_bible = {
            "style_id": "isometric-technical",
            "characters": [
                {"id": "site_engineer", "design": "Engineer in a yellow hard hat"},
            ],
            "props": [
                {"id": "bridge_deck", "design": "Steel bridge deck"},
                {"id": "support_pier", "design": "Concrete support pier"},
                {"id": "lifting_cable", "design": "Braided steel cable"},
                {"id": "unused_crate", "design": "Wooden crate"},
            ],
            "environments": [
                {"id": "river_valley", "design": "Wide river valley"},
                {"id": "unused_city", "design": "Distant city"},
            ],
            "mechanisms": [{
                "id": "deck_lift",
                "name": "Deck lifting system",
                "principle": "Hydraulic lift",
                "components": [
                    {"prop_id": "bridge_deck", "part": "deck", "role": "moving deck"},
                    {"prop_id": "support_pier", "part": "pier", "role": "fixed support"},
                ],
                "action_patterns": [],
            }],
        }
        self.scenes = [
            {
                "index": 0, "characters": ["site_engineer"], "props": ["bridge_deck"],
                "environment": "river_valley", "mechanism_actions": [],
            },
            {
                "index": 1, "characters": [], "props": [],
                "environment": "river_valley",
                "mechanism_actions": [{"mechanism_id": "deck_lift", "pattern_id": "raise"}],
            },
        ]

    def test_manifest_assigns_stable_functions_and_shot_ownership(self):
        manifest = build_required_function_manifest(self.visual_bible, self.scenes)
        by_name = {item["name"]: item for item in manifest["functions"]}

        self.assertEqual(
            set(by_name),
            {
                "drawCharacterSiteEngineer",
                "drawPropBridgeDeck",
                "drawPropSupportPier",
                "drawEnvironmentRiverValley",
            },
        )
        self.assertEqual(by_name["drawPropBridgeDeck"]["required_by_shots"], [0, 1])
        self.assertEqual(by_name["drawPropSupportPier"]["required_by_shots"], [1])
        self.assertEqual(
            manifest["shots"][0]["required_helpers"],
            ["drawCharacterSiteEngineer", "drawEnvironmentRiverValley", "drawPropBridgeDeck"],
        )
        self.assertEqual(
            manifest["shots"][1]["required_helpers"],
            ["drawEnvironmentRiverValley", "drawPropBridgeDeck", "drawPropSupportPier"],
        )
        self.assertNotIn("drawPropUnusedCrate", by_name)
        self.assertNotIn("drawEnvironmentUnusedCity", by_name)

    def test_manifest_strips_redundant_entity_type_prefixes_from_ids(self):
        bible = {
            "characters": [{"id": "char_engineer", "design": "Engineer"}],
            "props": [{"id": "prop_load", "design": "Suspended load"}],
            "environments": [{"id": "env_river", "design": "River"}],
            "mechanisms": [],
        }
        scenes = [{
            "index": 0, "characters": ["char_engineer"], "props": ["prop_load"],
            "environment": "env_river", "mechanism_actions": [],
        }]
        manifest = build_required_function_manifest(bible, scenes)
        self.assertEqual(
            {item["name"] for item in manifest["functions"]},
            {"drawCharacterEngineer", "drawPropLoad", "drawEnvironmentRiver"},
        )

    def test_manifest_uses_exact_canonical_signatures(self):
        manifest = build_required_function_manifest(self.visual_bible, self.scenes)
        signatures = {item["name"]: item["signature"] for item in manifest["functions"]}
        self.assertEqual(
            signatures["drawCharacterSiteEngineer"],
            "function drawCharacterSiteEngineer(g, x, y, scale, pose, expression)",
        )
        self.assertEqual(
            signatures["drawPropBridgeDeck"],
            "function drawPropBridgeDeck(g, x, y, scale, pose)",
        )
        self.assertEqual(
            signatures["drawEnvironmentRiverValley"],
            "function drawEnvironmentRiverValley(g, x, y, scale, env)",
        )

    def test_unknown_visual_bible_references_fail_before_code_generation(self):
        invalid = [dict(self.scenes[0], props=["missing_prop"])]
        with self.assertRaisesRegex(ValueError, "unknown prop"):
            build_required_function_manifest(self.visual_bible, invalid)

    def test_unknown_mechanism_component_prop_fails(self):
        bible = dict(self.visual_bible)
        bible["mechanisms"] = [{
            **self.visual_bible["mechanisms"][0],
            "components": [{"prop_id": "missing_component", "part": "part", "role": "unknown"}],
        }]
        with self.assertRaisesRegex(ValueError, "unknown component prop"):
            build_required_function_manifest(bible, self.scenes)

    def test_colliding_ids_cannot_produce_ambiguous_function_names(self):
        bible = dict(self.visual_bible)
        bible["props"] = [
            {"id": "bridge-deck", "design": "Deck A"},
            {"id": "bridge_deck", "design": "Deck B"},
        ]
        scenes = [{
            "index": 0, "characters": [], "props": ["bridge-deck", "bridge_deck"],
            "environment": "", "mechanism_actions": [],
        }]
        with self.assertRaisesRegex(ValueError, "collide as JavaScript helper"):
            build_required_function_manifest(bible, scenes)


class RequiredFunctionUsageTests(unittest.TestCase):
    def test_requires_direct_call_to_each_assigned_helper(self):
        source = "drawPropBridgeDeck(g, 0, 0, 1, pose); drawEnvironmentRiver(g, 0, 0, 1, env);"
        self.assertEqual(
            find_missing_required_helper_usage(
                source,
                ["drawPropBridgeDeck", "drawEnvironmentRiver"],
            ),
            [],
        )

    def test_missing_assigned_helper_is_reported(self):
        self.assertEqual(
            find_missing_required_helper_usage(
                "drawPropBridgeDeck(g, 0, 0, 1, pose);",
                ["drawPropBridgeDeck", "drawPropCable"],
            ),
            ["drawPropCable"],
        )

    def test_object_method_does_not_satisfy_shared_helper_contract(self):
        self.assertEqual(
            find_missing_required_helper_usage(
                "assets.drawPropBridgeDeck(g, 0, 0, 1, pose);",
                ["drawPropBridgeDeck"],
            ),
            ["drawPropBridgeDeck"],
        )


if __name__ == "__main__":
    unittest.main()
