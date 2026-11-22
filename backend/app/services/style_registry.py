"""Deterministic visual-direction resolution for new and legacy projects.

Public UI labels are separate from renderer style IDs so the UI can evolve
without changing persisted project records or old animation artifacts.
"""
from __future__ import annotations

from typing import Any

# UI choices resolve to dedicated art systems where implemented; other choices retain legacy mappings.
UI_STYLE_ALIASES: dict[str, str | None] = {
    "AI Auto": None,
    "Editorial": "cinematic-editorial",
    "Cinematic": "70s-poster",
    "Diagrammatic": "isometric-technical",
    "Paper craft": "layered-paper",
}

LEGACY_STYLE_IDS = frozenset({
    "paper-cutout", "risograph", "comic", "70s-poster",
    "engraving", "blueprint", "line", "pixel-art",
})

SUPPORTED_STYLE_IDS = LEGACY_STYLE_IDS | frozenset({"cinematic-editorial", "isometric-technical", "layered-paper"})


def resolve_visual_style(value: Any) -> str | None:
    """Resolve a stored UI label or legacy style ID to a renderer style ID."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Project visual_style must be a non-empty string")
    normalized = value.strip()
    if normalized in UI_STYLE_ALIASES:
        return UI_STYLE_ALIASES[normalized]
    if normalized in SUPPORTED_STYLE_IDS:
        return normalized
    raise ValueError(f"Unsupported visual direction: {normalized}")


def apply_visual_direction(visual_bible: dict[str, Any], requested: str | None) -> dict[str, Any]:
    """Enforce an explicit user choice after model output has been validated."""
    if requested is not None:
        visual_bible["style_id"] = requested
    return visual_bible
