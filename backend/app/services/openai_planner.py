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
                    "camera": {"type": "string"},
                    "transition_out": {"type": "string"},
                },
                "required": ["index", "start_frame", "end_frame", "purpose", "visual_description", "complexity", "operations", "layers", "camera", "transition_out"],
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
                {"role": "system", "content": "You are the planning stage of ShortClipr. Produce an exact frame-based plan for a final-only animated short. Write a complete narration that ends naturally and targets 2.1 to 2.35 spoken words per requested second. Favor reusable declarative SVG/Canvas/Revideo operations. Never promise unsupported assets or capabilities."},
                {"role": "user", "content": json.dumps(project, default=str)},
            ],
            text={"format": {"type": "json_schema", "name": "shortclipr_scene_plan", "strict": True, "schema": PLAN_SCHEMA}},
        )
        plan = json.loads(response.output_text)
        scenes = plan["scenes"]
        if not scenes:
            raise RuntimeError("Planner returned no scenes")
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
