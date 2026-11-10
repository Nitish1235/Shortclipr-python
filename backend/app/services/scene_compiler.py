import json
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings


ANIMATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "visual_family": {"type": "string", "enum": ["typography", "diagram", "orbit", "bars", "timeline", "particles", "split", "counter", "bridge", "wave", "map", "mechanism", "flow", "code", "comparison", "puzzle"]},
        "headline": {"type": "string"},
        "caption": {"type": "string"},
        "primary_value": {"type": "string"},
        "objects": {"type": "array", "items": {"type": "string", "minLength": 2}, "minItems": 2, "maxItems": 12},
        "events": {"type": "array", "items": {"type": "string", "minLength": 2}, "minItems": 1, "maxItems": 8},
        "actions": {"type": "array", "minItems": 1, "maxItems": 8, "items": {"type": "object", "properties": {"type": {"type": "string", "enum": ["reveal", "move", "flow", "connect", "transform", "compare", "assemble", "trace", "pulse"]}, "target": {"type": "string"}, "from": {"type": "string"}, "to": {"type": "string"}, "start": {"type": "integer", "minimum": 0}, "end": {"type": "integer", "minimum": 1}}, "required": ["type", "target", "from", "to", "start", "end"], "additionalProperties": False}},
        "motion": {"type": "string", "enum": ["sweep", "rise", "pulse", "trace", "cascade", "parallax"]},
        "density": {"type": "integer", "minimum": 2, "maximum": 18},
        "emphasis": {"type": "string", "enum": ["quiet", "balanced", "bold"]},
        "background": {"type": "string", "enum": ["ink", "paper", "midnight", "signal"]},
    },
    "required": ["visual_family", "headline", "caption", "primary_value", "objects", "events", "actions", "motion", "density", "emphasis", "background"],
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
                    "content": "You are ShortClipr's professional motion graphics programmer. Convert the supplied scene plan into a structured, deterministic animation program that a React/Remotion renderer will execute frame-by-frame. Choose the best composition: bridge for structures and support, diagram for processes, flow for transfers and pipelines, code for software and algorithms, comparison for A/B differences, puzzle for questions and reveals, wave for signals and motion, map for locations and routes, mechanism for systems, orbit for cycles, bars for measured data, timeline for history, particles for abstract concepts, and typography only for genuinely typographic concepts. Preserve the topic's concrete objects in the objects array and rewrite them as short visual object names. Preserve the cause-and-effect actions in the events array and encode them as frame-bounded actions with target, from, to, start, and end. Action start and end values are LOCAL to this scene, not project-global: start at 0 or later and end at or before (scene.end_frame - scene.start_frame), with start < end. Never use the scene's absolute start_frame or end_frame as action values. The visual must communicate the idea through concrete objects, meaningful interactions, transformations, an initial state, purposeful movement, and a clear final state. Never make the scene only a circle, title card, text reveal, bar chart, or slideshow. Use only supported primitives, layers, and operations. Keep motion smooth, purposeful, deterministic, and within the scene boundaries. Do not render subtitles, captions, headlines, labels, paragraphs, or narration transcripts; text fields are internal metadata only. The primary_value must describe a visual subject, object, or meaningful value, never a sentence to animate. Follow the exact JSON schema and aspect ratio. Never return JavaScript, JSX, CSS, HTML, URLs, or unsupported external assets. Return valid JSON only; no Markdown or explanations.",
                },
                {"role": "user", "content": json.dumps({"project": project, "scene": scene}, default=str)},
            ],
            text={"format": {"type": "json_schema", "name": "shortclipr_animation_program", "strict": True, "schema": ANIMATION_SCHEMA}},
        )
        animation = json.loads(response.output_text)
        return {**scene, "animation": animation}
