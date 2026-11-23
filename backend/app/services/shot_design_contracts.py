"""Shared visual continuity and physics-aware shot design contracts."""
from __future__ import annotations

from copy import deepcopy
from typing import Any


def build_visual_continuity_contract(visual_bible: dict[str, Any]) -> dict[str, Any]:
    """Build one immutable, video-wide identity reference from the validated visual bible.

    The visual bible remains the source of truth. This projection adds explicit rules
    without inventing or independently regenerating character/object descriptions.
    """
    return {
        "schema_version": 1,
        "style": {
            "style_id": visual_bible.get("style_id", ""),
            "style_notes": visual_bible.get("style_notes", ""),
        },
        "characters": deepcopy(visual_bible.get("characters", [])),
        "props": deepcopy(visual_bible.get("props", [])),
        "environments": deepcopy(visual_bible.get("environments", [])),
        "mechanisms": deepcopy(visual_bible.get("mechanisms", [])),
        "identity_invariants": [
            "Stable IDs identify the same entity throughout the entire film.",
            "Character silhouette, proportions, face, hair, clothing, palette and distinctive marks do not change between shots.",
            "Prop geometry, component identity, materials, colors and scale relationships remain stable.",
            "Environment identity, architecture, landmark placement and established spatial relationships remain stable.",
            "The film-wide art direction, palette, line treatment and lighting language remain coherent.",
        ],
        "state_change_policy": [
            "Pose, expression, position, orientation, articulation and interaction state may change when required by the storyboard.",
            "A state change must not silently redefine an entity's identity or canonical design.",
            "Damage, wetness, dirt, costume changes, construction changes or other persistent alterations require explicit story evidence.",
            "Mechanism components may move only according to declared mechanism actions and validated kinematics; do not alter their canonical geometry.",
        ],
    }


def build_shot_continuity_context(
    contract: dict[str, Any], scene: dict[str, Any],
) -> dict[str, Any]:
    """Project the video-wide contract to the entities relevant to one shot."""
    character_ids = set(scene.get("characters") or [])
    prop_ids = set(scene.get("props") or [])
    environment_id = scene.get("environment")
    mechanism_ids = {
        action.get("mechanism_id")
        for action in scene.get("mechanism_actions", [])
        if isinstance(action, dict)
    }
    mechanisms = [
        item for item in contract.get("mechanisms", [])
        if item.get("id") in mechanism_ids
    ]
    prop_ids.update(
        component.get("prop_id")
        for mechanism in mechanisms
        for component in mechanism.get("components", [])
        if isinstance(component, dict) and isinstance(component.get("prop_id"), str)
    )
    return {
        "schema_version": contract.get("schema_version", 1),
        "style": contract.get("style", {}),
        "characters": [
            item for item in contract.get("characters", [])
            if item.get("id") in character_ids
        ],
        "props": [
            item for item in contract.get("props", [])
            if item.get("id") in prop_ids
        ],
        "environments": [
            item for item in contract.get("environments", [])
            if item.get("id") == environment_id
        ],
        "mechanisms": mechanisms,
        "identity_invariants": contract.get("identity_invariants", []),
        "state_change_policy": contract.get("state_change_policy", []),
    }


def validate_physical_constraints(
    value: Any, label: str, valid_entity_ids: set[str],
) -> dict[str, Any]:
    """Validate references and shape of a shot's qualitative physical-motion contract.

    This validates descriptions and entity references only. It does not claim to
    simulate physics or replace the numeric mechanism-kinematics validator.
    """
    if not isinstance(value, dict):
        raise ValueError(f"{label} physical_constraints must be an object")

    motion_type = value.get("motion_type")
    allowed_motion_types = {
        "rigid_body", "articulated", "ballistic", "fluid", "elastic",
        "mechanical", "camera", "mixed", "static",
    }
    if not isinstance(motion_type, str) or motion_type not in allowed_motion_types:
        raise ValueError(f"{label} physical_constraints has an unsupported motion_type")

    def text_field(container: dict[str, Any], key: str, field_label: str) -> str:
        item = container.get(key)
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{label} physical_constraints requires non-empty {field_label}")
        return item.strip()

    def entity_id(item: dict[str, Any], key: str, field_label: str) -> str:
        identifier = item.get(key)
        if not isinstance(identifier, str) or identifier not in valid_entity_ids:
            raise ValueError(f"{label} physical_constraints {field_label} references an unknown entity")
        return identifier

    def entries(key: str, required: tuple[str, ...], references: tuple[str, ...]) -> list[dict[str, Any]]:
        items = value.get(key)
        if not isinstance(items, list) or len(items) > 16:
            raise ValueError(f"{label} physical_constraints {key} must be an array of at most 16 entries")
        normalized: list[dict[str, Any]] = []
        for index, raw in enumerate(items):
            if not isinstance(raw, dict):
                raise ValueError(f"{label} physical_constraints {key}[{index}] must be an object")
            item = dict(raw)
            for ref_key in references:
                entity_id(item, ref_key, f"{key}[{index}].{ref_key}")
            for field in required:
                text_field(item, field, f"{key}[{index}].{field}")
            normalized.append(item)
        return normalized

    anchors = entries("anchors", ("point", "role"), ("entity_id",))
    relationships = entries(
        "relationships", ("relationship", "behavior"),
        ("source_entity_id", "target_entity_id"),
    )
    constraints = entries("constraints", ("rule",), ("entity_id",))
    forces = entries("forces_and_effects", ("effect", "description"), ("entity_id",))
    collisions = entries(
        "collision_rules", ("response",), ("entity_a", "entity_b"),
    )
    profile = value.get("motion_profile")
    if not isinstance(profile, dict):
        raise ValueError(f"{label} physical_constraints motion_profile must be an object")
    profile_fields = ("start", "acceleration", "peak", "deceleration", "settle")
    normalized_profile = {
        field: text_field(profile, field, f"motion_profile.{field}")
        for field in profile_fields
    }
    return {
        "motion_type": motion_type,
        "anchors": anchors,
        "relationships": relationships,
        "constraints": constraints,
        "forces_and_effects": forces,
        "collision_rules": collisions,
        "motion_profile": normalized_profile,
    }
