"""Deterministic, topic-aware reasoning budgets for the generation pipeline."""
from __future__ import annotations

from typing import Any

# These subjects benefit from a little more planning care, but story planning
# should never consume the maximum coding/reasoning budget by default.
CAREFUL_TOPICS = {
    "historical story", "news & event recap", "maps & geography",
    "sports tactics", "myth-busting experiment", "comparisons & visual facts",
    "space & scale journey", "what-if simulation",
}
COMPLEX_TERMS = (
    "quantum", "relativity", "election", "war", "geopolit", "medical",
    "scientific", "physics", "economics", "legal", "timeline", "multiple countries",
    "compare", "versus", "data", "statistics", "historical",
)


def planning_effort(project: dict[str, Any], low: str = "low", medium: str = "medium") -> str:
    """Choose low for ordinary creative briefs, medium for fact-dense topics."""
    clip_type = str(project.get("clip_type", "")).strip().lower()
    brief = str(project.get("brief", "")).lower()
    careful = clip_type in CAREFUL_TOPICS or any(term in brief for term in COMPLEX_TERMS)
    return medium if careful else low


def coding_effort(scene: dict[str, Any] | None, project: dict[str, Any], medium: str = "medium", maximum: str = "max") -> str:
    """Use maximum reasoning for genuinely complex visual code, medium otherwise."""
    scene = scene or {}
    complexity = str(scene.get("complexity", "medium")).lower()
    clip_type = str(project.get("clip_type", "")).lower()
    action = " ".join(str(scene.get(k, "")) for k in ("action", "camera", "visual_description")).lower()
    demanding = complexity == "heavy" or clip_type in {
        "character comedy", "animated conversation", "architecture transformation",
        "maps & geography", "sports tactics", "what-if simulation",
    }
    demanding = demanding or any(term in action for term in (
        "multiple characters", "camera move", "transformation", "collision",
        "complex mechanism", "many moving", "match cut", "continuous tracking",
    ))
    return maximum if demanding else medium
