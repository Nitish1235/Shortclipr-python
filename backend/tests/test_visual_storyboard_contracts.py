from __future__ import annotations

import pytest

from app.services.animation_contracts import validate_scene_plan, validate_visual_bible


def test_legacy_visual_bible_gets_backward_compatible_spatial_defaults():
    bible = validate_visual_bible({
        "style_id": "paper-cutout",
        "characters": [{"id": "char_hero", "design": "red coat"}],
        "props": [{"id": "prop_bridge", "design": "wooden bridge"}],
        "environments": [{"id": "env_river", "design": "river valley"}],
    })
    assert bible["schema_version"] == 2
    assert bible["environments"][0]["spatial_layout"]
    assert bible["environments"][0]["midground"] == "river valley"
    assert bible["props"][0]["components"] == []
    assert bible["characters"][0]["scale_reference"] == ""


def test_visual_bible_rejects_malformed_prop_components():
    with pytest.raises(ValueError, match="Prop components"):
        validate_visual_bible({
            "style_id": "layered-paper",
            "props": [{"id": "prop_bridge", "design": "bridge", "components": "deck"}],
        })


def test_storyboard_adds_defaults_for_legacy_shots():
    scenes = validate_scene_plan([
        {"start_frame": 0, "end_frame": 30},
        {"start_frame": 30, "end_frame": 60},
        {"start_frame": 60, "end_frame": 90},
    ], 90)
    assert scenes[0]["shot_scale"] == "medium"
    assert scenes[0]["depth_layers"] == ["background", "subject", "foreground"]
    assert scenes[0]["visual_objective"] == scenes[0]["visual_description"]


def test_storyboard_preserves_rich_composition_direction():
    scenes = validate_scene_plan([
        {"start_frame": 0, "end_frame": 30, "shot_scale": "extreme_wide",
         "composition": "bridge dominates upper third", "depth_layers": ["sky", "bridge", "river"]},
        {"start_frame": 30, "end_frame": 60},
        {"start_frame": 60, "end_frame": 90},
    ], 90)
    assert scenes[0]["shot_scale"] == "extreme_wide"
    assert scenes[0]["depth_layers"] == ["sky", "bridge", "river"]


def test_storyboard_rejects_unknown_shot_scale_and_empty_depth_layers():
    with pytest.raises(ValueError, match="shot_scale"):
        validate_scene_plan([
            {"start_frame": 0, "end_frame": 30, "shot_scale": "drone"},
            {"start_frame": 30, "end_frame": 60},
            {"start_frame": 60, "end_frame": 90},
        ], 90)
    with pytest.raises(ValueError, match="depth_layers"):
        validate_scene_plan([
            {"start_frame": 0, "end_frame": 30, "depth_layers": []},
            {"start_frame": 30, "end_frame": 60},
            {"start_frame": 60, "end_frame": 90},
        ], 90)


def _bridge_mechanism_bible():
    return {
        "style_id": "isometric-technical",
        "props": [
            {"id": "prop_deck", "design": "bridge deck"},
            {"id": "prop_actuator", "design": "hydraulic actuator"},
        ],
        "mechanisms": [{
            "id": "mechanism_lift",
            "name": "Deck lift",
            "principle": "The actuator extends and the deck rotates around a fixed hinge",
            "components": [
                {"prop_id": "prop_deck", "part": "deck", "role": "rotating load"},
                {"prop_id": "prop_actuator", "part": "rod", "role": "linear driver"},
            ],
            "joints": [{
                "type": "revolute", "between": ["deck", "frame"], "anchor": "fixed hinge",
            }],
            "motion_constraints": ["deck rotates around the fixed hinge"],
            "action_patterns": [{
                "id": "raise",
                "description": "Raise the deck",
                "driver": "actuator rod extends",
                "followers": ["deck rotates upward"],
                "relationship": "linked actuator extension and deck rotation",
            }],
        }],
    }


def test_mechanism_contract_accepts_linked_components_and_motion_pattern():
    bible = validate_visual_bible(_bridge_mechanism_bible())
    mechanism = bible["mechanisms"][0]
    assert mechanism["components"][0]["prop_id"] == "prop_deck"
    assert mechanism["action_patterns"][0]["driver"] == "actuator rod extends"


def test_mechanism_contract_rejects_unknown_component_prop():
    bible = _bridge_mechanism_bible()
    bible["mechanisms"][0]["components"][0]["prop_id"] = "prop_missing"
    with pytest.raises(ValueError, match="declared prop_id"):
        validate_visual_bible(bible)


def test_mechanism_action_progress_is_bounded_and_ordered():
    scenes = validate_scene_plan([
        {"start_frame": 0, "end_frame": 30, "mechanism_actions": [{
            "mechanism_id": "mechanism_lift", "pattern_id": "raise",
            "action": "raise deck", "start_progress": 0.2, "end_progress": 0.9,
        }]},
        {"start_frame": 30, "end_frame": 60},
        {"start_frame": 60, "end_frame": 90},
    ], 90)
    assert scenes[0]["mechanism_actions"][0]["end_progress"] == 0.9


def test_mechanism_action_rejects_invalid_progress():
    with pytest.raises(ValueError, match="between 0 and 1"):
        validate_scene_plan([
            {"start_frame": 0, "end_frame": 30, "mechanism_actions": [{
                "mechanism_id": "mechanism_lift", "pattern_id": "raise",
                "action": "raise deck", "start_progress": -0.1, "end_progress": 0.9,
            }]},
            {"start_frame": 30, "end_frame": 60},
            {"start_frame": 60, "end_frame": 90},
        ], 90)


def test_legacy_visual_bible_and_shots_default_to_no_mechanisms():
    bible = validate_visual_bible({"style_id": "paper-cutout"})
    scenes = validate_scene_plan([
        {"start_frame": 0, "end_frame": 30},
        {"start_frame": 30, "end_frame": 60},
        {"start_frame": 60, "end_frame": 90},
    ], 90)
    assert bible["mechanisms"] == []
    assert scenes[0]["mechanism_actions"] == []



def test_mechanism_kinematics_validates_pivot_translation_and_actuator_geometry():
    bible = {
        "style_id": "isometric-technical",
        "props": [{"id": "prop_deck"}, {"id": "prop_rod"}],
        "mechanisms": [{
            "id": "mechanism_test",
            "components": [
                {"prop_id": "prop_deck", "part": "deck"},
                {"prop_id": "prop_rod", "part": "rod"},
            ],
            "action_patterns": [],
            "kinematics": [
                {"type": "pivot", "part": "deck", "anchor": {"x": 10, "y": 20},
                 "start_angle_deg": 0, "end_angle_deg": 60},
                {"type": "translation", "part": "deck", "start": {"x": 0, "y": 0},
                 "end": {"x": 100, "y": 0}},
                {"type": "actuator", "part": "rod", "base_anchor": {"x": 0, "y": 0},
                 "rod_anchor": {"x": 10, "y": 0}, "min_length": 10, "max_length": 40},
            ],
        }],
    }
    mechanism = validate_visual_bible(bible)["mechanisms"][0]
    assert [item["type"] for item in mechanism["kinematics"]] == [
        "pivot", "translation", "actuator"
    ]


def test_mechanism_kinematics_rejects_unknown_part_and_invalid_actuator_lengths():
    base = {
        "style_id": "isometric-technical",
        "props": [{"id": "prop_rod"}],
        "mechanisms": [{
            "id": "mechanism_test",
            "components": [{"prop_id": "prop_rod", "part": "rod"}],
            "action_patterns": [],
            "kinematics": [{"type": "actuator", "part": "missing",
                            "base_anchor": {"x": 0, "y": 0}, "rod_anchor": {"x": 10, "y": 0},
                            "min_length": 10, "max_length": 40}],
        }],
    }
    with pytest.raises(ValueError, match="declared mechanism component"):
        validate_visual_bible(base)
    base["mechanisms"][0]["kinematics"][0]["part"] = "rod"
    base["mechanisms"][0]["kinematics"][0]["min_length"] = 0
    with pytest.raises(ValueError, match="Actuator lengths"):
        validate_visual_bible(base)


def test_mechanism_action_rejects_unsupported_easing():
    with pytest.raises(ValueError, match="easing"):
        validate_scene_plan([
            {"start_frame": 0, "end_frame": 30, "mechanism_actions": [{
                "mechanism_id": "mechanism_lift", "pattern_id": "raise",
                "action": "raise deck", "easing": "elastic",
            }]},
            {"start_frame": 30, "end_frame": 60},
            {"start_frame": 60, "end_frame": 90},
        ], 90)


def test_mechanism_action_rejects_non_finite_progress():
    with pytest.raises(ValueError, match="finite number"):
        validate_scene_plan([
            {"start_frame": 0, "end_frame": 30, "mechanism_actions": [{
                "mechanism_id": "mechanism_lift", "pattern_id": "raise",
                "action": "raise deck", "start_progress": float("nan"),
            }]},
            {"start_frame": 30, "end_frame": 60},
            {"start_frame": 60, "end_frame": 90},
        ], 90)


def test_mechanism_kinematics_rejects_non_finite_geometry():
    base = {
        "style_id": "isometric-technical",
        "props": [{"id": "prop_deck"}],
        "mechanisms": [{
            "id": "mechanism_test",
            "components": [{"prop_id": "prop_deck", "part": "deck"}],
            "action_patterns": [],
            "kinematics": [{"type": "pivot", "part": "deck",
                            "anchor": {"x": float("nan"), "y": 10},
                            "start_angle_deg": 0, "end_angle_deg": 40}],
        }],
    }
    with pytest.raises(ValueError, match="finite number"):
        validate_visual_bible(base)


def test_mechanism_kinematics_validates_gear_pulley_and_cable_paths():
    props = [
        {"id": "prop_gear_a"}, {"id": "prop_gear_b"},
        {"id": "prop_pulley"}, {"id": "prop_counterweight"}, {"id": "prop_cable"},
    ]
    components = [
        {"prop_id": "prop_gear_a", "part": "gear_a"},
        {"prop_id": "prop_gear_b", "part": "gear_b"},
        {"prop_id": "prop_pulley", "part": "pulley"},
        {"prop_id": "prop_counterweight", "part": "counterweight"},
        {"prop_id": "prop_cable", "part": "cable"},
    ]
    bible = {
        "style_id": "isometric-technical",
        "props": props,
        "mechanisms": [{
            "id": "mechanism_transmission",
            "components": components,
            "action_patterns": [],
            "kinematics": [
                {
                    "type": "gear", "part": "gear_b", "driver_part": "gear_a",
                    "anchor": {"x": 400, "y": 300}, "driver_anchor": {"x": 300, "y": 300},
                    "driver_radius": 50, "driven_radius": 25,
                    "driver_start_angle_deg": 0, "driver_end_angle_deg": 180,
                    "driven_start_angle_deg": 0, "mesh": "external",
                },
                {
                    "type": "pulley", "part": "counterweight", "pulley_part": "pulley",
                    "anchor": {"x": 450, "y": 180}, "radius": 30,
                    "start_angle_deg": 0, "end_angle_deg": 180,
                    "start_position": {"x": 500, "y": 420},
                    "axis": {"x": 0, "y": 4}, "direction": 1,
                },
                {
                    "type": "cable", "part": "cable",
                    "points_start": [{"x": 100, "y": 100}, {"x": 200, "y": 150}],
                    "points_end": [{"x": 100, "y": 100}, {"x": 260, "y": 150}],
                },
            ],
        }],
    }
    mechanism = validate_visual_bible(bible)["mechanisms"][0]
    gear, pulley, cable = mechanism["kinematics"]
    assert gear["driver_radius"] / gear["driven_radius"] == 2
    assert gear["mesh"] == "external"
    assert pulley["axis"] == {"x": 0, "y": 1}
    assert len(cable["points_start"]) == len(cable["points_end"]) == 2


def test_mechanism_kinematics_rejects_invalid_gear_pulley_and_cable_data():
    props = [{"id": "prop_a"}, {"id": "prop_b"}, {"id": "prop_c"}]
    components = [
        {"prop_id": "prop_a", "part": "gear_a"},
        {"prop_id": "prop_b", "part": "gear_b"},
        {"prop_id": "prop_c", "part": "cable"},
    ]
    base = {
        "style_id": "isometric-technical",
        "props": props,
        "mechanisms": [{
            "id": "mechanism_bad",
            "components": components,
            "action_patterns": [],
            "kinematics": [{
                "type": "gear", "part": "gear_b", "driver_part": "missing",
                "anchor": {"x": 0, "y": 0}, "driver_anchor": {"x": 10, "y": 0},
                "driver_radius": 10, "driven_radius": 5, "driver_end_angle_deg": 90,
            }],
        }],
    }
    with pytest.raises(ValueError, match="Gear driver_part"):
        validate_visual_bible(base)
    base["mechanisms"][0]["kinematics"] = [{
        "type": "pulley", "part": "gear_b", "pulley_part": "gear_a",
        "anchor": {"x": 0, "y": 0}, "radius": 20, "end_angle_deg": 90,
        "start_position": {"x": 10, "y": 0}, "axis": {"x": 0, "y": 0},
    }]
    with pytest.raises(ValueError, match="non-zero"):
        validate_visual_bible(base)
    base["mechanisms"][0]["kinematics"] = [{
        "type": "cable", "part": "cable",
        "points_start": [{"x": 0, "y": 0}],
        "points_end": [{"x": 10, "y": 0}],
    }]
    with pytest.raises(ValueError, match="2–24"):
        validate_visual_bible(base)
