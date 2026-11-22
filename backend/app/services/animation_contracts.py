"""Contracts and guardrails for ShortClipr's shot-based 2D animation pipeline."""
from __future__ import annotations

import re
from typing import Any

STYLE_IDS = {"paper-cutout", "risograph", "comic", "70s-poster", "engraving", "blueprint", "line", "pixel-art", "cinematic-editorial", "isometric-technical", "layered-paper"}
ASPECT_LOGICAL = {"9:16": [900, 1600], "1:1": [1000, 1000], "16:9": [1600, 900]}
MAX_SCENES = 12
MAX_SHARED_SOURCE = 100_000
MAX_SHOT_SOURCE = 45_000
MAX_FILM_SOURCE = 500_000

# Generated code runs in a browser page with a restrictive CSP. These lexical
# checks are defense in depth, not a substitute for process/container isolation.
_BLOCKED_PATTERNS = (
    r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\s*\(",
    r"\b(?:eval|Function)\s*\(",
    r"\b(?:process|require|globalThis|localStorage|sessionStorage|navigator|location)\b",
    r"\b(?:Date|performance)\s*\.",
    r"\bMath\s*\.\s*random\s*\(",
    r"\bimport\s*(?:\(|[('""{*])",
    r"\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(",
)


KINEMATIC_MOTION_TYPES = {"pivot", "translation", "actuator"}


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a finite number")
    number = float(value)
    if not number == number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{label} must be a finite number")
    return number


def validate_kinematics(value: Any, component_parts: set[str]) -> dict[str, Any]:
    """Validate explicit 2D motion geometry; never infer geometry from prose."""
    if not isinstance(value, dict):
        raise ValueError("Mechanism kinematics entries must be objects")
    kind = value.get("type")
    if kind not in KINEMATIC_MOTION_TYPES:
        raise ValueError("Kinematics type must be pivot, translation or actuator")
    result = dict(value)
    part = result.get("part")
    if not isinstance(part, str) or part not in component_parts:
        raise ValueError("Kinematics part must reference a declared mechanism component")
    if kind == "pivot":
        anchor = result.get("anchor")
        if not isinstance(anchor, dict):
            raise ValueError("Pivot kinematics require a numeric anchor")
        x = _finite_number(anchor.get("x"), "Pivot anchor x")
        y = _finite_number(anchor.get("y"), "Pivot anchor y")
        start = _finite_number(result.get("start_angle_deg", 0), "Pivot start_angle_deg")
        end = _finite_number(result.get("end_angle_deg"), "Pivot end_angle_deg")
        if not -360 <= start <= 360 or not -360 <= end <= 360:
            raise ValueError("Pivot angles must be between -360 and 360 degrees")
        result.update(anchor={"x": x, "y": y}, start_angle_deg=start, end_angle_deg=end)
    elif kind == "translation":
        start, end = result.get("start"), result.get("end")
        if not isinstance(start, dict) or not isinstance(end, dict):
            raise ValueError("Translation kinematics require start and end points")
        result.update(
            start={"x": _finite_number(start.get("x"), "Translation start x"),
                   "y": _finite_number(start.get("y"), "Translation start y")},
            end={"x": _finite_number(end.get("x"), "Translation end x"),
                 "y": _finite_number(end.get("y"), "Translation end y")},
        )
    else:
        base, rod = result.get("base_anchor"), result.get("rod_anchor")
        if not isinstance(base, dict) or not isinstance(rod, dict):
            raise ValueError("Actuator kinematics require base_anchor and rod_anchor points")
        result.update(
            base_anchor={"x": _finite_number(base.get("x"), "Actuator base x"),
                         "y": _finite_number(base.get("y"), "Actuator base y")},
            rod_anchor={"x": _finite_number(rod.get("x"), "Actuator rod x"),
                        "y": _finite_number(rod.get("y"), "Actuator rod y")},
        )
        minimum = _finite_number(result.get("min_length"), "Actuator min_length")
        maximum = _finite_number(result.get("max_length"), "Actuator max_length")
        if minimum <= 0 or maximum < minimum:
            raise ValueError("Actuator lengths must satisfy 0 < min_length <= max_length")
        result.update(min_length=minimum, max_length=maximum)
    return result


def validate_visual_bible(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Visual bible must be an object")
    style = value.get("style_id", "paper-cutout")
    if style not in STYLE_IDS:
        raise ValueError(f"Unsupported visual style: {style}")
    characters = value.get("characters", [])
    props = value.get("props", [])
    environments = value.get("environments", [])
    mechanisms = value.get("mechanisms", [])
    if not all(isinstance(x, list) for x in (characters, props, environments, mechanisms)):
        raise ValueError("Visual bible characters, props and environments must be arrays")
    if len(characters) > 20 or len(props) > 40 or len(environments) > 20 or len(mechanisms) > 20:
        raise ValueError("Visual bible exceeds entity limits")
    seen: set[str] = set()
    for group_name, group in (("character", characters), ("prop", props), ("environment", environments)):
        for item in group:
            if not isinstance(item, dict):
                raise ValueError(f"Visual bible {group_name} entries must be objects")
            entity_id = item.get("id")
            if not isinstance(entity_id, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{1,63}", entity_id):
                raise ValueError(f"Invalid {group_name} ID")
            if entity_id in seen:
                raise ValueError(f"Duplicate visual bible ID: {entity_id}")
            seen.add(entity_id)
            if not isinstance(item.get("design", item.get("appearance", "")), (str, dict)):
                raise ValueError(f"{group_name} design must be text or an object")
    # Additive VisualBible v2 fields. Legacy persisted plans receive safe defaults.
    for environment in environments:
        environment.setdefault("spatial_layout", "clear foreground, midground and background")
        environment.setdefault("foreground", "")
        environment.setdefault("midground", str(environment.get("design", "")))
        environment.setdefault("background", "")
        environment.setdefault("scale_reference", "")
        environment.setdefault("atmosphere", "")
        for key in ("spatial_layout", "foreground", "midground", "background", "scale_reference", "atmosphere"):
            if not isinstance(environment[key], str):
                raise ValueError(f"Environment {key} must be text")
    for prop in props:
        prop.setdefault("material", "")
        prop.setdefault("relative_scale", "")
        prop.setdefault("components", [])
        prop.setdefault("anchors", [])
        prop.setdefault("moving_parts", [])
        for key in ("material", "relative_scale"):
            if not isinstance(prop[key], str):
                raise ValueError(f"Prop {key} must be text")
        for key in ("components", "anchors", "moving_parts"):
            if not isinstance(prop[key], list) or not all(isinstance(x, str) for x in prop[key]):
                raise ValueError(f"Prop {key} must be an array of text")
    for character in characters:
        character.setdefault("scale_reference", "")
        if not isinstance(character["scale_reference"], str):
            raise ValueError("Character scale_reference must be text")
    value["schema_version"] = max(2, int(value.get("schema_version", 1)))
    value["style_id"] = style
    value["characters"] = characters
    value["props"] = props
    mechanism_ids: set[str] = set()
    prop_ids = {item["id"] for item in props}
    for mechanism in mechanisms:
        if not isinstance(mechanism, dict):
            raise ValueError("Visual bible mechanisms must contain objects")
        mechanism_id = mechanism.get("id")
        if not isinstance(mechanism_id, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{1,63}", mechanism_id):
            raise ValueError("Invalid mechanism ID")
        if mechanism_id in seen or mechanism_id in mechanism_ids:
            raise ValueError(f"Duplicate visual bible ID: {mechanism_id}")
        mechanism_ids.add(mechanism_id)
        for key in ("name", "principle"):
            if not isinstance(mechanism.get(key, ""), str):
                raise ValueError(f"Mechanism {key} must be text")
        components = mechanism.setdefault("components", [])
        if not isinstance(components, list) or not components or len(components) > 20:
            raise ValueError("Mechanism components must contain 1–20 entries")
        component_parts: set[str] = set()
        for component in components:
            if not isinstance(component, dict) or component.get("prop_id") not in prop_ids:
                raise ValueError("Mechanism component must reference a declared prop_id")
            if not isinstance(component.get("part"), str) or not component["part"].strip():
                raise ValueError("Mechanism component part must be named")
            if component["part"] in component_parts:
                raise ValueError("Mechanism component part names must be unique")
            component_parts.add(component["part"])
            if not isinstance(component.get("role", ""), str):
                raise ValueError("Mechanism component role must be text")
        if "kinematics" in mechanism:
            kinematics = mechanism["kinematics"]
            if not isinstance(kinematics, list) or not 1 <= len(kinematics) <= 20:
                raise ValueError("Mechanism kinematics must contain 1–20 motion definitions")
            mechanism["kinematics"] = [
                validate_kinematics(item, component_parts) for item in kinematics
            ]
        joints = mechanism.setdefault("joints", [])
        if not isinstance(joints, list) or len(joints) > 20:
            raise ValueError("Mechanism joints must be an array of at most 20 entries")
        for joint in joints:
            if not isinstance(joint, dict) or not isinstance(joint.get("type"), str) or not isinstance(joint.get("anchor"), str):
                raise ValueError("Mechanism joints require a type and anchor")
            between = joint.get("between")
            if not isinstance(between, list) or len(between) != 2 or not all(isinstance(x, str) and x.strip() for x in between):
                raise ValueError("Mechanism joint between must name exactly two parts")
        constraints = mechanism.setdefault("motion_constraints", [])
        if not isinstance(constraints, list) or not all(isinstance(x, str) for x in constraints):
            raise ValueError("Mechanism motion_constraints must be an array of text")
        patterns = mechanism.setdefault("action_patterns", [])
        if not isinstance(patterns, list) or len(patterns) > 12:
            raise ValueError("Mechanism action_patterns must be an array of at most 12 entries")
        pattern_ids: set[str] = set()
        for pattern in patterns:
            if not isinstance(pattern, dict):
                raise ValueError("Mechanism action patterns must be objects")
            pattern_id = pattern.get("id")
            if not isinstance(pattern_id, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]{1,63}", pattern_id) or pattern_id in pattern_ids:
                raise ValueError("Invalid or duplicate mechanism action pattern ID")
            pattern_ids.add(pattern_id)
            for key in ("description", "driver", "relationship"):
                if not isinstance(pattern.get(key), str) or not pattern[key].strip():
                    raise ValueError(f"Mechanism action pattern {key} is required")
            followers = pattern.get("followers")
            if not isinstance(followers, list) or not all(isinstance(x, str) and x.strip() for x in followers):
                raise ValueError("Mechanism action pattern followers must be an array of named parts")
    value["mechanisms"] = mechanisms
    value["environments"] = environments
    return value

def validate_scene_plan(scenes: Any, total_frames: int) -> list[dict[str, Any]]:
    if not isinstance(scenes, list) or not 3 <= len(scenes) <= MAX_SCENES:
        raise ValueError(f"Scene plan must contain 3–{MAX_SCENES} shots")
    cursor = 0
    normalized = []
    for index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise ValueError("Every shot must be an object")
        start = scene.get("start_frame")
        end = scene.get("end_frame")
        if not isinstance(start, int) or not isinstance(end, int):
            raise ValueError("Shot frame boundaries must be integers")
        if start != cursor or end <= start or end > total_frames:
            raise ValueError("Shot ranges must be contiguous, non-overlapping and within film duration")
        scene["index"] = index
        scene["start_frame"] = start
        scene["end_frame"] = end
        scene.setdefault("purpose", f"Shot {index + 1}")
        scene.setdefault("visual_description", scene["purpose"])
        scene.setdefault("complexity", "medium")
        scene.setdefault("characters", [])
        scene.setdefault("props", [])
        scene.setdefault("environment", "")
        scene.setdefault("action", scene["visual_description"])
        scene.setdefault("camera", "locked composition")
        scene.setdefault("transition_out", "cut")
        # Storyboard v2 direction. Defaults preserve old saved plans.
        scene.setdefault("visual_objective", scene["visual_description"])
        scene.setdefault("composition", "clear focal hierarchy with intentional negative space")
        scene.setdefault("shot_scale", "medium")
        scene.setdefault("camera_position", scene["camera"])
        scene.setdefault("depth_layers", ["background", "subject", "foreground"])
        scene.setdefault("focal_entity", "")
        scene.setdefault("visual_change", scene["action"])
        scene.setdefault("continuity_note", "")
        scene.setdefault("mechanism_actions", [])
        for key in ("visual_objective", "composition", "camera_position", "focal_entity", "visual_change", "continuity_note"):
            if not isinstance(scene[key], str):
                raise ValueError(f"Shot {key} must be text")
        if scene["shot_scale"] not in {"extreme_wide", "wide", "medium", "close_up", "extreme_close_up", "detail", "overhead", "isometric"}:
            raise ValueError("Shot shot_scale is unsupported")
        if not isinstance(scene["depth_layers"], list) or not scene["depth_layers"] or len(scene["depth_layers"]) > 6 or not all(isinstance(x, str) and x.strip() for x in scene["depth_layers"]):
            raise ValueError("Shot depth_layers must contain 1–6 named layers")
        if not isinstance(scene["mechanism_actions"], list) or len(scene["mechanism_actions"]) > 8:
            raise ValueError("Shot mechanism_actions must be an array of at most 8 entries")
        for action in scene["mechanism_actions"]:
            if not isinstance(action, dict):
                raise ValueError("Shot mechanism actions must be objects")
            for key in ("mechanism_id", "pattern_id", "action"):
                if not isinstance(action.get(key), str) or not action[key].strip():
                    raise ValueError(f"Shot mechanism action {key} is required")
            for key in ("start_progress", "end_progress"):
                if key in action and (not isinstance(action[key], (int, float)) or not 0 <= action[key] <= 1):
                    raise ValueError(f"Shot mechanism action {key} must be between 0 and 1")
            if action.get("start_progress", 0) >= action.get("end_progress", 1):
                raise ValueError("Shot mechanism action progress range must increase")
            if "easing" in action and action["easing"] not in {"linear", "in_out", "ease_in", "ease_out"}:
                raise ValueError("Shot mechanism action easing is unsupported")
        if scene["complexity"] not in {"light", "medium", "heavy"}:
            scene["complexity"] = "medium"
        for key in ("characters", "props"):
            if not isinstance(scene[key], list) or not all(isinstance(x, str) for x in scene[key]):
                raise ValueError(f"Shot {key} must be an array of IDs")
        normalized.append(scene)
        cursor = end
    if cursor != total_frames:
        raise ValueError("Shot plan must cover the complete film duration")
    return normalized


_DRAW_HELPER_CALL = re.compile(r"(?<![\w$.])\b(draw[A-Z][A-Za-z0-9_]*)\s*\(")
_DRAW_HELPER_DECL = re.compile(
    r"\bfunction\s+(draw[A-Z][A-Za-z0-9_]*)\s*\(|"
    r"\b(?:const|let|var)\s+(draw[A-Z][A-Za-z0-9_]*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)"
)


def find_unresolved_draw_helpers(shared_source: str, shot_sources: list[str]) -> list[str]:
    """Return unqualified drawX() calls that have no shared or shot-local definition.

    Only the project helper naming convention (draw + Uppercase) is checked. Canvas
    methods such as g.drawImage are property calls and intentionally excluded.
    """
    shared = {
        name
        for match in _DRAW_HELPER_DECL.finditer(shared_source)
        for name in match.groups()
        if name
    }
    unresolved: set[str] = set()
    for source in [shared_source, *shot_sources]:
        local = {
            name
            for match in _DRAW_HELPER_DECL.finditer(source)
            for name in match.groups()
            if name
        }
        for name in _DRAW_HELPER_CALL.findall(source):
            if name not in shared and name not in local:
                unresolved.add(name)
    return sorted(unresolved)


def validate_draw_helper_definitions(source: str, required_names: list[str]) -> None:
    """Ensure a generated helper fragment actually defines every requested helper."""
    declared = {
        name
        for match in _DRAW_HELPER_DECL.finditer(source)
        for name in match.groups()
        if name
    }
    missing = sorted(set(required_names) - declared)
    if missing:
        raise ValueError("Generated helper library did not define: " + ", ".join(missing))
    for name in required_names:
        signature = re.search(
            rf"\bfunction\s+{re.escape(name)}\s*\(\s*g\s*(?:,|\))",
            source,
        )
        if not signature:
            raise ValueError(f"Generated helper {name} must accept the Canvas context as its first argument")

def validate_generated_fragment(source: Any, label: str, max_chars: int) -> str:
    if not isinstance(source, str) or not 20 <= len(source) <= max_chars:
        raise ValueError(f"{label} source length is outside allowed bounds")
    for pattern in _BLOCKED_PATTERNS:
        if re.search(pattern, source):
            raise ValueError(f"{label} contains a disallowed runtime capability")
    return source
