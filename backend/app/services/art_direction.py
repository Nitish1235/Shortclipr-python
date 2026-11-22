"""Versioned, deterministic art-direction contracts for Canvas 2D generation.

This stage translates a selected renderer style into concrete visual rules. It does
not claim that a palette/helper preset is a complete new illustration system.
"""
from __future__ import annotations

from typing import Any

ART_DIRECTION_SCHEMA_VERSION = 1

_STYLE_RULES: dict[str, dict[str, Any]] = {
    "paper-cutout": {
        "visual_identity": "Layered cut-paper illustration with visibly separated paper planes.",
        "shape_language": "Large simplified cut silhouettes, layered overlaps, slightly irregular cut edges; avoid thin wireframe outlines.",
        "materials": "Distinct paper stocks with restrained grain, tactile edges and clear layer separation.",
        "lighting": "Consistent soft directional light with cast shadows between paper layers.",
        "composition": "Foreground, middle ground and background must occupy distinct depth planes; use overlap to establish scale.",
        "color": "Warm paper base with a limited ink and accent palette; reserve accents for the focal action.",
        "camera": "Use deliberate wide, medium and detail framings; transitions may reveal or slide paper layers.",
        "avoid": ["flat single-plane scenes", "blueprint grids", "uniform thin outlines", "random decorative confetti"],
    },
    "risograph": {
        "visual_identity": "Editorial printmaking with bold shapes, controlled ink overlap and visible registration character.",
        "shape_language": "Graphic silhouettes, chunky contour shapes and selective halftone; avoid sketchy construction lines.",
        "materials": "Layered ink fields, restrained dot textures and deliberate overprint intersections.",
        "lighting": "Use value grouping and overlapping ink shapes rather than simulated photorealistic lighting.",
        "composition": "Strong editorial hierarchy, asymmetry, large focal forms and intentional negative space.",
        "color": "Two to four purposeful ink colors with clear contrast and limited accent use.",
        "camera": "Graphic reframing, crops and panel-like transitions; alternate wide context with detail crops.",
        "avoid": ["full-frame noisy halftone", "tiny repeated details", "default dark grid backgrounds"],
    },
    "70s-poster": {
        "visual_identity": "Retro editorial poster illustration with bold simplified forms and warm graphic color blocking.",
        "shape_language": "Organic geometric silhouettes, confident contour masses and layered flat shapes.",
        "materials": "Subtle printed-paper grain and restrained ink texture; no glossy digital gradients.",
        "lighting": "Graphic light and shadow blocks with consistent direction.",
        "composition": "Large readable hero subject, strong foreground framing and poster-like hierarchy.",
        "color": "Warm muted palette with one controlled high-contrast accent.",
        "camera": "Cinematic crop changes and graphic wipes; vary shot scale to reveal new information.",
        "avoid": ["overly distressed texture", "uniform centered layouts", "thin technical wireframes"],
    },
    "line": {
        "visual_identity": "Clean explanatory line illustration with selective filled areas and precise visual hierarchy.",
        "shape_language": "Confident varied line weights, closed readable silhouettes and restrained geometric construction.",
        "materials": "Use fill, line weight and sparse hatching to distinguish materials; do not render everything as an outline.",
        "lighting": "Minimal tonal shading that clarifies volume and overlap.",
        "composition": "Clear focal object, supporting callouts and ample negative space.",
        "color": "Neutral base with limited accent colors for the active mechanism or key information.",
        "camera": "Use close-ups and sectional views when they explain structure; avoid repeating identical full-scene diagrams.",
        "avoid": ["default grid backgrounds", "stick-figure people", "same-weight outlines everywhere"],
    },
    "blueprint": {
        "visual_identity": "Technical blueprint drawing reserved for subjects where engineering documentation is the intended visual language.",
        "shape_language": "Precise construction lines, dimensions and section marks with clear hierarchy.",
        "materials": "Differentiate components using line patterns, fills and labels rather than identical outlines.",
        "lighting": "Flat technical presentation; no faux cinematic lighting.",
        "composition": "Structured diagram layouts, sectional views and legible annotation zones.",
        "color": "Blueprint field with high-contrast technical marks and sparing highlight color.",
        "camera": "Orthographic/sectional framing; transitions should reveal components or assembly stages.",
        "avoid": ["using blueprint as the automatic default for every educational topic", "decorative grids without purpose"],
    },
    "comic": {
        "visual_identity": "Sequential graphic-novel illustration with panel-like staging and expressive silhouettes.",
        "shape_language": "Bold contour hierarchy, dynamic poses, graphic shadows and selective speed shapes.",
        "materials": "Ink contours, restrained halftone and purposeful texture blocks.",
        "lighting": "High-contrast graphic shadow shapes that support emotion and action.",
        "composition": "Dynamic diagonals, foreground framing and varied panel-like shot sizes.",
        "color": "Limited comic palette with strong focal contrast.",
        "camera": "Use motivated punch-ins, reaction shots and action cuts.",
        "avoid": ["same pose in every shot", "excessive speed lines", "crowded backgrounds"],
    },
    "engraving": {
        "visual_identity": "Etched illustration with deliberate crosshatching and historical print character.",
        "shape_language": "Careful contour drawing, hatch direction following form and layered tonal masses.",
        "materials": "Engraved line density distinguishes wood, stone, metal, water and atmosphere.",
        "lighting": "Tonal value built through controlled hatch density, not gradients.",
        "composition": "Readable silhouette first, detailed focal areas second; keep background hatch lighter.",
        "color": "Restrained monochrome or limited sepia with sparse accent.",
        "camera": "Illustrated wide establishing views and detailed engraved close-ups.",
        "avoid": ["uniform crosshatching across the whole frame", "illegible micro-lines"],
    },
    "pixel-art": {
        "visual_identity": "Deliberate low-resolution pixel illustration with a consistent pixel grid.",
        "shape_language": "Clustered pixel forms, stepped diagonals and controlled silhouette readability.",
        "materials": "Texture through intentional pixel clusters and palette ramps.",
        "lighting": "Discrete pixel value ramps; no smooth blur or gradients that break the pixel language.",
        "composition": "Strong readable clusters, clear scale and separated depth planes.",
        "color": "Small coordinated palette with carefully chosen ramps.",
        "camera": "Pixel-snapped movement and transitions; avoid subpixel jitter.",
        "avoid": ["anti-aliased vector edges", "random isolated pixels", "unbounded palette growth"],
    },
}


def build_art_direction(
    style_id: str,
    *,
    requested_style: str | None,
    style_notes: str = "",
) -> dict[str, Any]:
    """Build the normalized art-direction contract for a validated renderer style."""
    if style_id not in _STYLE_RULES:
        raise ValueError(f"No art-direction profile registered for style: {style_id}")
    profile = _STYLE_RULES[style_id]
    return {
        "schema_version": ART_DIRECTION_SCHEMA_VERSION,
        "stage": "art_direction",
        "mode": "explicit" if requested_style is not None else "auto",
        "selected_by": "user" if requested_style is not None else "model",
        "style_id": style_id,
        "rationale": style_notes.strip()[:1000],
        "rules": {key: (list(value) if isinstance(value, list) else value)
                  for key, value in profile.items()},
    }


def validate_art_direction(value: Any, expected_style: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Art direction must be an object")
    if value.get("schema_version") != ART_DIRECTION_SCHEMA_VERSION:
        raise ValueError("Unsupported art-direction schema version")
    if value.get("stage") != "art_direction" or value.get("style_id") != expected_style:
        raise ValueError("Art direction does not match the selected visual style")
    if value.get("mode") not in {"explicit", "auto"}:
        raise ValueError("Invalid art-direction mode")
    if value.get("selected_by") not in {"user", "model"}:
        raise ValueError("Invalid art-direction selector")
    rules = value.get("rules")
    required = {"visual_identity", "shape_language", "materials", "lighting",
                "composition", "color", "camera", "avoid"}
    if not isinstance(rules, dict) or not required.issubset(rules):
        raise ValueError("Art direction is missing required visual rules")
    if not all(isinstance(rules[key], str) and rules[key].strip()
               for key in required - {"avoid"}):
        raise ValueError("Art-direction rules must be non-empty text")
    if not isinstance(rules["avoid"], list) or not all(
        isinstance(item, str) and item.strip() for item in rules["avoid"]
    ):
        raise ValueError("Art-direction avoid rules must be a list of strings")
    return value


def format_art_direction(value: dict[str, Any]) -> str:
    """Compact deterministic instruction block shared by planner and compiler."""
    rules = value["rules"]
    return "\n".join([
        f"ART DIRECTION CONTRACT v{value['schema_version']} — {value['style_id']}",
        f"Visual identity: {rules['visual_identity']}",
        f"Shape language: {rules['shape_language']}",
        f"Materials: {rules['materials']}",
        f"Lighting: {rules['lighting']}",
        f"Composition: {rules['composition']}",
        f"Color: {rules['color']}",
        f"Camera and transitions: {rules['camera']}",
        "Avoid: " + "; ".join(rules["avoid"]),
        f"Art director rationale: {value.get('rationale') or 'No additional rationale supplied.'}",
        "Treat these rules as binding across every shot. Do not silently change visual style.",
    ])
