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


KINEMATIC_MOTION_TYPES = {"pivot", "translation", "slider", "gear", "pulley", "cable", "actuator"}


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a finite number")
    number = float(value)
    if not number == number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{label} must be a finite number")
    return number


def _kinematic_point(value: Any, label: str) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a point object")
    return {
        "x": _finite_number(value.get("x"), f"{label} x"),
        "y": _finite_number(value.get("y"), f"{label} y"),
    }


def validate_kinematics(value: Any, component_parts: set[str]) -> dict[str, Any]:
    """Validate explicit 2D motion geometry; never infer geometry from prose."""
    if not isinstance(value, dict):
        raise ValueError("Mechanism kinematics entries must be objects")
    kind = value.get("type")
    if not isinstance(kind, str) or kind not in KINEMATIC_MOTION_TYPES:
        raise ValueError("Unsupported kinematics type")
    result = dict(value)
    part = result.get("part")
    if not isinstance(part, str) or part not in component_parts:
        raise ValueError("Kinematics part must reference a declared mechanism component")

    if kind == "pivot":
        anchor = _kinematic_point(result.get("anchor"), "Pivot anchor")
        start = _finite_number(result.get("start_angle_deg", 0), "Pivot start_angle_deg")
        end = _finite_number(result.get("end_angle_deg"), "Pivot end_angle_deg")
        if not -360 <= start <= 360 or not -360 <= end <= 360:
            raise ValueError("Pivot angles must be between -360 and 360 degrees")
        result.update(anchor=anchor, start_angle_deg=start, end_angle_deg=end)

    elif kind in {"translation", "slider"}:
        start = _kinematic_point(result.get("start"), "Translation start")
        end = _kinematic_point(result.get("end"), "Translation end")
        result.update(start=start, end=end)

    elif kind == "gear":
        driver_part = result.get("driver_part")
        if not isinstance(driver_part, str) or driver_part not in component_parts or driver_part == part:
            raise ValueError("Gear driver_part must reference a different declared mechanism component")
        driver_anchor = _kinematic_point(result.get("driver_anchor"), "Gear driver_anchor")
        anchor = _kinematic_point(result.get("anchor"), "Gear anchor")
        driver_radius = _finite_number(result.get("driver_radius"), "Gear driver_radius")
        driven_radius = _finite_number(result.get("driven_radius"), "Gear driven_radius")
        if driver_radius <= 0 or driven_radius <= 0:
            raise ValueError("Gear pitch radii must be positive")
        mesh = result.get("mesh", "external")
        if not isinstance(mesh, str) or mesh not in {"external", "internal"}:
            raise ValueError("Gear mesh must be external or internal")
        center_distance = ((anchor["x"] - driver_anchor["x"]) ** 2
                           + (anchor["y"] - driver_anchor["y"]) ** 2) ** 0.5
        expected_distance = (driver_radius + driven_radius if mesh == "external"
                             else abs(driver_radius - driven_radius))
        tolerance = max(0.5, expected_distance * 0.02)
        if abs(center_distance - expected_distance) > tolerance:
            raise ValueError("Gear center distance must match the declared pitch radii and mesh")
        driver_start = _finite_number(result.get("driver_start_angle_deg", 0), "Gear driver_start_angle_deg")
        driver_end = _finite_number(result.get("driver_end_angle_deg"), "Gear driver_end_angle_deg")
        driven_start = _finite_number(result.get("driven_start_angle_deg", 0), "Gear driven_start_angle_deg")
        result.update(
            driver_anchor=driver_anchor, anchor=anchor, driver_radius=driver_radius,
            driven_radius=driven_radius, mesh=mesh, driver_start_angle_deg=driver_start,
            driver_end_angle_deg=driver_end, driven_start_angle_deg=driven_start,
        )

    elif kind == "pulley":
        pulley_part = result.get("pulley_part")
        if not isinstance(pulley_part, str) or pulley_part not in component_parts or pulley_part == part:
            raise ValueError("Pulley pulley_part must reference a different declared mechanism component")
        anchor = _kinematic_point(result.get("anchor"), "Pulley anchor")
        start_position = _kinematic_point(result.get("start_position"), "Pulley start_position")
        axis = _kinematic_point(result.get("axis"), "Pulley travel axis")
        axis_length = (axis["x"] ** 2 + axis["y"] ** 2) ** 0.5
        if axis_length <= 1e-9:
            raise ValueError("Pulley travel axis must be non-zero")
        radius = _finite_number(result.get("radius"), "Pulley radius")
        if radius <= 0:
            raise ValueError("Pulley radius must be positive")
        start = _finite_number(result.get("start_angle_deg", 0), "Pulley start_angle_deg")
        end = _finite_number(result.get("end_angle_deg"), "Pulley end_angle_deg")
        direction = result.get("direction", 1)
        if isinstance(direction, bool) or not isinstance(direction, int) or direction not in {-1, 1}:
            raise ValueError("Pulley direction must be -1 or 1")
        axis = {"x": axis["x"] / axis_length, "y": axis["y"] / axis_length}
        result.update(
            anchor=anchor, start_position=start_position, axis=axis, radius=radius,
            start_angle_deg=start, end_angle_deg=end, direction=direction,
        )

    elif kind == "cable":
        points_start = result.get("points_start")
        points_end = result.get("points_end")
        if (not isinstance(points_start, list) or not isinstance(points_end, list)
                or not 2 <= len(points_start) <= 24 or len(points_start) != len(points_end)):
            raise ValueError("Cable paths need matching arrays of 2–24 start/end points")
        result["points_start"] = [
            _kinematic_point(point, f"Cable start point {index}")
            for index, point in enumerate(points_start)
        ]
        result["points_end"] = [
            _kinematic_point(point, f"Cable end point {index}")
            for index, point in enumerate(points_end)
        ]

    else:  # hydraulic/pneumatic linear actuator
        base = _kinematic_point(result.get("base_anchor"), "Actuator base_anchor")
        rod = _kinematic_point(result.get("rod_anchor"), "Actuator rod_anchor")
        if ((rod["x"] - base["x"]) ** 2 + (rod["y"] - base["y"]) ** 2) <= 1e-18:
            raise ValueError("Actuator extension axis must be non-zero")
        minimum = _finite_number(result.get("min_length"), "Actuator min_length")
        maximum = _finite_number(result.get("max_length"), "Actuator max_length")
        if minimum <= 0 or maximum < minimum:
            raise ValueError("Actuator lengths must satisfy 0 < min_length <= max_length")
        result.update(base_anchor=base, rod_anchor=rod, min_length=minimum, max_length=maximum)
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


def analyze_mechanism_motion(visual_bible: dict[str, Any], scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return non-blocking diagnostics for mechanism integration across shots.

    Structural references are validated separately and remain fatal. These
    diagnostics identify motion that is only qualitative and progress jumps
    between adjacent shots; they never rewrite authored motion.
    """
    mechanisms = {item["id"]: item for item in visual_bible.get("mechanisms", [])}
    diagnostics: list[dict[str, Any]] = []
    previous: dict[tuple[str, str], tuple[int, float]] = {}

    for scene in scenes:
        scene_index = scene["index"]
        for action in scene.get("mechanism_actions", []):
            mechanism_id = action["mechanism_id"]
            pattern_id = action["pattern_id"]
            mechanism = mechanisms[mechanism_id]
            key = (mechanism_id, pattern_id)
            start = float(action.get("start_progress", 0))
            end = float(action.get("end_progress", 1))

            if not mechanism.get("kinematics"):
                diagnostics.append({
                    "code": "qualitative_motion_only",
                    "severity": "info",
                    "scene_index": scene_index,
                    "mechanism_id": mechanism_id,
                    "pattern_id": pattern_id,
                    "message": "Mechanism action has no numeric kinematics; render it as qualitative motion only.",
                })

            prior = previous.get(key)
            if prior and prior[0] == scene_index - 1 and abs(prior[1] - start) > 1e-6:
                diagnostics.append({
                    "code": "progress_discontinuity",
                    "severity": "warning",
                    "scene_index": scene_index,
                    "previous_scene_index": prior[0],
                    "mechanism_id": mechanism_id,
                    "pattern_id": pattern_id,
                    "previous_end_progress": prior[1],
                    "next_start_progress": start,
                    "message": "Adjacent shots continue the same mechanism action with a progress discontinuity.",
                })
            previous[key] = (scene_index, end)

    return diagnostics


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
                if key in action:
                    progress = _finite_number(action[key], f"Shot mechanism action {key}")
                    if not 0 <= progress <= 1:
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
