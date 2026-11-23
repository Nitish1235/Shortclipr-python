"""Deterministic drawing-function requirements derived from the storyboard and Visual Bible."""
from __future__ import annotations

import json
import re
from typing import Any


_ENTITY_GROUPS = (
    ("character", "characters", "drawCharacter", "function {name}(g, x, y, scale, pose, expression)"),
    ("prop", "props", "drawProp", "function {name}(g, x, y, scale, pose)"),
    ("environment", "environments", "drawEnvironment", "function {name}(g, x, y, scale, env)"),
)


def _pascal_identifier(value: str, entity_type: str) -> str:
    """Convert a Visual Bible ID into a stable suffix without duplicating its type prefix."""
    normalized = value
    for prefix in {
        "character": ("character_", "char_"),
        "prop": ("prop_",),
        "environment": ("environment_", "env_"),
    }[entity_type]:
        if normalized.lower().startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    parts = re.findall(r"[A-Za-z0-9]+", normalized)
    suffix = "".join(part[0].upper() + part[1:] for part in parts if part)
    if not suffix or suffix[0].isdigit():
        suffix = "Entity" + suffix
    return suffix


def build_required_function_manifest(
    visual_bible: dict[str, Any],
    scenes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the canonical, per-shot drawing API before any JavaScript is generated.

    Names are assigned by the backend from stable entity IDs. A shot cannot invent a
    helper name: its required API is completely determined by the validated storyboard.
    Mechanism component props are included whenever a shot animates that mechanism.
    """
    groups = {
        group_key: {entity["id"]: entity for entity in visual_bible.get(group_key, [])}
        for _, group_key, _, _ in _ENTITY_GROUPS
    }
    mechanisms = {
        mechanism["id"]: mechanism for mechanism in visual_bible.get("mechanisms", [])
    }
    required_by_entity: dict[tuple[str, str], list[int]] = {}
    shot_entities: dict[int, set[tuple[str, str]]] = {}

    for scene in scenes:
        shot_index = scene.get("index")
        if isinstance(shot_index, bool) or not isinstance(shot_index, int):
            raise ValueError("Function manifest requires an integer storyboard shot index")
        required: set[tuple[str, str]] = set()

        for entity_id in scene.get("characters", []):
            if entity_id not in groups["characters"]:
                raise ValueError(
                    f"Shot {shot_index + 1} references unknown character entity: {entity_id}"
                )
            required.add(("character", entity_id))

        for entity_id in scene.get("props", []):
            if entity_id not in groups["props"]:
                raise ValueError(f"Shot {shot_index + 1} references unknown prop entity: {entity_id}")
            required.add(("prop", entity_id))

        environment_id = scene.get("environment")
        if environment_id:
            if environment_id not in groups["environments"]:
                raise ValueError(
                    f"Shot {shot_index + 1} references unknown environment entity: {environment_id}"
                )
            required.add(("environment", environment_id))

        # The storyboard's focal_entity is an additional explicit visual reference.
        focal_entity = scene.get("focal_entity")
        if focal_entity:
            matches = [
                (kind, focal_entity)
                for kind, group_key, _, _ in _ENTITY_GROUPS
                if focal_entity in groups[group_key]
            ]
            if matches:
                required.add(matches[0])

        for action in scene.get("mechanism_actions", []):
            mechanism_id = action.get("mechanism_id")
            mechanism = mechanisms.get(mechanism_id)
            if mechanism is None:
                raise ValueError(
                    f"Shot {shot_index + 1} references unknown mechanism: {mechanism_id}"
                )
            for component in mechanism.get("components", []):
                prop_id = component.get("prop_id")
                if prop_id not in groups["props"]:
                    raise ValueError(
                        f"Mechanism {mechanism_id} references unknown component prop: {prop_id}"
                    )
                required.add(("prop", prop_id))

        shot_entities[shot_index] = required
        for key in required:
            required_by_entity.setdefault(key, []).append(shot_index)

    functions: list[dict[str, Any]] = []
    names: dict[str, tuple[str, str]] = {}
    group_lookup = {key: entities for key, entities in groups.items()}

    for kind, group_key, prefix, signature_template in _ENTITY_GROUPS:
        for entity_id, entity in group_lookup[group_key].items():
            key = (kind, entity_id)
            required_shots = sorted(required_by_entity.get(key, []))
            if not required_shots:
                continue
            name = prefix + _pascal_identifier(entity_id, kind)
            previous = names.get(name)
            if previous and previous != key:
                raise ValueError(
                    f"Visual Bible entity IDs collide as JavaScript helper {name}: "
                    f"{previous[1]} and {entity_id}"
                )
            names[name] = key
            signature = signature_template.format(name=name)
            design = entity.get("design", entity.get("appearance", ""))
            visual_target = design if isinstance(design, str) else json.dumps(design, ensure_ascii=False)
            functions.append({
                "id": f"{kind}:{entity_id}",
                "name": name,
                "category": "visual",
                "entity_type": kind,
                "entity_id": entity_id,
                "signature": signature,
                "purpose": f"Draw the canonical {kind} entity {entity_id} for every assigned shot.",
                "coordinate_system": "local_subject; coordinates are logical canvas units scaled from the declared origin",
                "origin": (
                    "ground/contact point" if kind in {"character", "prop"}
                    else "top-left of the environment's logical drawing area"
                ),
                "visual_target": visual_target[:1600],
                "style_requirements": (
                    f"Follow the film's binding art direction and preserve the canonical "
                    f"{kind} design across all shots."
                ),
                "animation_behavior": (
                    "Use pose and expression arguments for shot-specific state; keep identity "
                    "geometry and materials invariant."
                    if kind == "character"
                    else "Use pose for shot-specific orientation or mechanical state; keep the canonical design invariant."
                    if kind == "prop"
                    else "Draw a deterministic, reusable environment layer; keep its spatial identity invariant."
                ),
                "dependencies": [],
                "acceptance_criteria": [
                    f"Draws the actual Visual Bible {kind} {entity_id}, not a placeholder, label or generic icon.",
                    "Uses the exact declared signature and stable local coordinate system.",
                    "Preserves the same silhouette, palette and defining details whenever reused.",
                ],
                "required_by_shots": required_shots,
                "version": 1,
            })

    functions_by_key = {
        (item["entity_type"], item["entity_id"]): item["name"] for item in functions
    }
    shots = []
    for scene in scenes:
        shot_index = scene["index"]
        required_helpers = sorted(
            functions_by_key[key] for key in shot_entities.get(shot_index, set())
        )
        shots.append({
            "index": shot_index,
            "required_helpers": required_helpers,
            "required_entities": [
                {"type": kind, "id": entity_id}
                for kind, entity_id in sorted(shot_entities.get(shot_index, set()))
            ],
        })

    return {
        "schema_version": 1,
        "functions": functions,
        "shots": shots,
    }


def find_missing_required_helper_usage(
    source: str,
    required_helpers: list[str],
) -> list[str]:
    """Fast compiler-side guard; the render worker performs definitive AST scope checks."""
    missing = []
    for name in required_helpers:
        if not isinstance(name, str) or not re.fullmatch(r"draw[A-Z][A-Za-z0-9_]*", name):
            raise ValueError(f"Invalid required drawing helper name: {name!r}")
        if not re.search(rf"(?<![\w$.]){re.escape(name)}\s*\(", source):
            missing.append(name)
    return sorted(missing)
