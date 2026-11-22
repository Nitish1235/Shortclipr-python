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
