import json
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings


ANIMATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "visual_family": {"type": "string", "enum": ["typography", "diagram", "orbit", "bars", "timeline", "particles", "split", "counter", "bridge", "wave", "map", "mechanism"]},
        "headline": {"type": "string"},
        "caption": {"type": "string"},
        "primary_value": {"type": "string"},
        "motion": {"type": "string", "enum": ["sweep", "rise", "pulse", "trace", "cascade", "parallax"]},
        "density": {"type": "integer", "minimum": 2, "maximum": 18},
        "emphasis": {"type": "string", "enum": ["quiet", "balanced", "bold"]},
        "background": {"type": "string", "enum": ["ink", "paper", "midnight", "signal"]},
    },
    "required": ["visual_family", "headline", "caption", "primary_value", "motion", "density", "emphasis", "background"],
    "additionalProperties": False,
}


class SceneCompiler:
    """Turns a qualified scene brief into renderer-safe animation data, never executable code."""

    def __init__(self, settings: Settings):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

    async def compile(self, project: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        response = await self.client.responses.create(
            model=scene["assigned_model"],
            reasoning={"effort": scene["reasoning_effort"]},
            input=[
                {
                    "role": "system",
                    "content": (
                        "You are ShortClipr's animation programmer. Translate the scene into the provided "
                        "declarative visual grammar. Design a visual-first animated clip, not a text slide. "
                        "Choose bridge for structures and support, diagram for processes, wave for motion or "
                        "signals, map for places or routes, mechanism for systems, orbit for cycles, bars for "
                        "comparisons, timeline for history, particles for abstract ideas, and typography only "
                        "when the concept is genuinely typographic. Use short on-screen copy as a supporting "
                        "layer. Do not return JavaScript, URLs, or unsupported external assets."
                    ),
                },
                {"role": "user", "content": json.dumps({"project": project, "scene": scene}, default=str)},
            ],
            text={"format": {"type": "json_schema", "name": "shortclipr_animation_program", "strict": True, "schema": ANIMATION_SCHEMA}},
        )
        animation = json.loads(response.output_text)
        return {**scene, "animation": animation}
