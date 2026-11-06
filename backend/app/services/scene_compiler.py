import json
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings


ANIMATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "visual_family": {"type": "string", "enum": ["typography", "diagram", "orbit", "bars", "timeline", "particles", "split", "counter"]},
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
                        "declarative visual grammar. Choose one strong focal idea, short on-screen copy, and "
                        "motion appropriate to the scene. Do not return JavaScript, URLs, or unsupported assets."
                    ),
                },
                {"role": "user", "content": json.dumps({"project": project, "scene": scene}, default=str)},
            ],
            text={"format": {"type": "json_schema", "name": "shortclipr_animation_program", "strict": True, "schema": ANIMATION_SCHEMA}},
        )
        animation = json.loads(response.output_text)
        return {**scene, "animation": animation}
