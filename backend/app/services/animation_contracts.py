"""Contracts and guardrails for ShortClipr's shot-based 2D animation pipeline."""
from __future__ import annotations

import re
from typing import Any

STYLE_IDS = {"paper-cutout", "risograph", "comic", "70s-poster", "engraving", "blueprint", "line", "pixel-art"}
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

def validate_visual_bible(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Visual bible must be an object")
    style = value.get("style_id", "paper-cutout")
    if style not in STYLE_IDS:
        raise ValueError(f"Unsupported visual style: {style}")
    characters = value.get("characters", [])
    props = value.get("props", [])
    environments = value.get("environments", [])
    if not all(isinstance(x, list) for x in (characters, props, environments)):
        raise ValueError("Visual bible characters, props and environments must be arrays")
    if len(characters) > 20 or len(props) > 40 or len(environments) > 20:
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
    value["style_id"] = style
    value["characters"] = characters
    value["props"] = props
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


_DRAW_HELPER_CALL = re.compile(r"(?<![\\w$.])\\b(draw[A-Z][A-Za-z0-9_]*)\\s*\\(")
_DRAW_HELPER_DECL = re.compile(
    r"\\bfunction\\s+(draw[A-Z][A-Za-z0-9_]*)\\s*\\(|"
    r"\\b(?:const|let|var)\\s+(draw[A-Z][A-Za-z0-9_]*)\\s*=\\s*(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)"
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
    for source in shot_sources:
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

def validate_generated_fragment(source: Any, label: str, max_chars: int) -> str:
    if not isinstance(source, str) or not 20 <= len(source) <= max_chars:
        raise ValueError(f"{label} source length is outside allowed bounds")
    for pattern in _BLOCKED_PATTERNS:
        if re.search(pattern, source):
            raise ValueError(f"{label} contains a disallowed runtime capability")
    return source
