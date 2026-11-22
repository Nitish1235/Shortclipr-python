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
