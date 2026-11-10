import json
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings
from .model_router import assign_scene_model, planner_assignment


PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "narration": {"type": "string"},
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "start_frame": {"type": "integer"},
                    "end_frame": {"type": "integer"},
                    "purpose": {"type": "string"},
                    "visual_description": {"type": "string"},
                    "complexity": {"type": "string", "enum": ["light", "medium", "heavy"]},
                    "operations": {"type": "array", "items": {"type": "string"}},
                    "layers": {"type": "array", "items": {"type": "string"}},
                    "objects": {"type": "array", "items": {"type": "string", "minLength": 2}, "minItems": 2, "maxItems": 12},
                    "events": {"type": "array", "items": {"type": "string", "minLength": 2}, "minItems": 1, "maxItems": 8},
                    "camera": {"type": "string"},
                    "transition_out": {"type": "string"},
                },
                "required": ["index", "start_frame", "end_frame", "purpose", "visual_description", "complexity", "operations", "layers", "objects", "events", "camera", "transition_out"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "narration", "scenes"],
    "additionalProperties": False,
}


class OpenAIPlanner:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

    async def plan(self, project: dict[str, Any]) -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        assignment = planner_assignment(self.settings)
        response = await self.client.responses.create(
            model=assignment.model,
            reasoning={"effort": assignment.effort},
            input=[
                {"role": "system", "content": "You are ShortClipr's visual storytelling and video planning engine. Create a compelling, visually driven animated short from the provided topic. Always create 3–5 distinct scenes for a 15–60 second video; never return one scene for the whole video. Plan a hook, a visual explanation, and a clear final state. Every scene must communicate one idea through moving visual objects. Use concrete objects, visual metaphors, transformations, interactions, and cause-and-effect relationships. For each scene provide its objective, exact frame range, detailed visual_description, 2–12 concrete object names in objects, and 1–8 concrete event descriptions in events. Events must say what moves, transforms, connects, reveals, flows, assembles, compares, or reacts. Use animation operations such as draw, reveal, trace, connect, flow, orbit, grow, compare, transform, or assemble. Never make a scene only a title card, text reveal, circle, bar chart, or slideshow. Use exactly 30 FPS and cover the complete requested duration deterministically. Generate one natural narration with a compelling hook and 2.1–2.35 spoken words per requested second. Plan only reusable declarative SVG, Canvas, and React-compatible operations. Never assume unsupported effects, assets, physics, 3D, or capabilities. Return valid JSON using the supplied schema only; no Markdown, explanations, or JavaScript."},
                {"role": "user", "content": json.dumps(project, default=str)},
            ],
            text={"format": {"type": "json_schema", "name": "shortclipr_scene_plan", "strict": True, "schema": PLAN_SCHEMA}},
        )
        plan = json.loads(response.output_text)
        scenes = plan["scenes"]
        if not scenes:
            raise RuntimeError("Planner returned no scenes")
        minimum_scenes = max(3, min(5, int(project["duration_seconds"]) // 5))
        if len(scenes) < minimum_scenes:
            raise RuntimeError(f"Planner returned {len(scenes)} scene(s); at least {minimum_scenes} distinct scenes are required")
        total_frames = int(project["duration_seconds"]) * 30
        weights = [max(1, int(scene["end_frame"]) - int(scene["start_frame"])) for scene in scenes]
        weight_total = sum(weights)
        cursor = 0
        for index, (scene, weight) in enumerate(zip(scenes, weights, strict=True)):
            end = total_frames if index == len(scenes) - 1 else cursor + max(1, round(total_frames * weight / weight_total))
            scene["index"] = index
            scene["start_frame"] = cursor
            scene["end_frame"] = min(total_frames, end)
            cursor = scene["end_frame"]
            model = assign_scene_model(scene["complexity"], scene["operations"], self.settings)
            scene["assigned_model"] = model.model
            scene["reasoning_effort"] = model.effort
            scene["assignment_reason"] = model.reason
        return plan
