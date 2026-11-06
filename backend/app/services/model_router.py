from dataclasses import dataclass
from typing import Literal

from ..core.config import Settings


Complexity = Literal["light", "medium", "heavy"]


TERRA_OPERATIONS = {
    "moving_camera",
    "multi_character_blocking",
    "three_dimensional_layout",
    "advanced_particle_field",
    "dense_occlusion",
    "complex_morph",
    "physics_like_motion",
}


@dataclass(frozen=True)
class ModelAssignment:
    model: str
    effort: str
    reason: str


def assign_scene_model(complexity: Complexity, operations: list[str], settings: Settings) -> ModelAssignment:
    demanding_operations = sorted(TERRA_OPERATIONS.intersection(operations))
    if complexity == "heavy" or demanding_operations:
        reason = "heavy scene" if complexity == "heavy" else f"requires {', '.join(demanding_operations)}"
        return ModelAssignment(settings.OPENAI_TERRA_MODEL, settings.OPENAI_REASONING_EFFORT_TERRA, reason)
    return ModelAssignment(settings.OPENAI_LUNA_MODEL, settings.OPENAI_REASONING_EFFORT_LUNA, "bounded declarative scene")


def planner_assignment(settings: Settings) -> ModelAssignment:
    return ModelAssignment(settings.OPENAI_LUNA_MODEL, settings.OPENAI_REASONING_EFFORT_LUNA, "high-volume structured planning")
