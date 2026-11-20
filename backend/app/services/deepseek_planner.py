"""DeepSeek story, narration and scene planner for ShortClipr."""
from __future__ import annotations
import json
from typing import Any
from openai import AsyncOpenAI
from ..core.config import Settings

class DeepSeekStoryPlanner:
    """Creates the complete factual story, narration and timed visual scene plan."""
    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_STORY_MODEL
        self.reasoning_effort = settings.DEEPSEEK_REASONING_EFFORT
        self.max_output_tokens = settings.DEEPSEEK_PLAN_MAX_OUTPUT_TOKENS
        self.client = AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com",
                                  timeout=300.0, max_retries=2) if settings.DEEPSEEK_API_KEY else None

    async def plan(self, project: dict[str, Any]) -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        duration = int(project["duration_seconds"])
        total_frames = duration * 30
        minimum_scenes = max(3, min(9, duration // 4))
        prompt = f"""
You are ShortClipr's senior story writer, factual researcher, narration writer and animation director.
Create the COMPLETE creative plan for one engaging, visually driven 2D animated short.

PROJECT INPUT:
{json.dumps(project, ensure_ascii=False, default=str)}

OUTPUT CONTRACT:
Return one valid JSON object and nothing else, with exactly this shape:
{{
  "title": "short compelling title",
  "narration": "complete spoken narration",
  "scenes": [{{
    "index": 0, "start_frame": 0, "end_frame": 180,
    "purpose": "what this scene communicates",
    "visual_description": "detailed visual direction for the animation model",
    "complexity": "light",
    "operations": ["reveal", "transform"],
    "layers": ["background", "midground", "foreground"],
    "objects": ["specific visible subject", "specific prop"],
    "events": ["specific action with a clear beginning and result"],
    "camera": "camera movement and framing",
    "transition_out": "how the scene transitions"
  }}]
}}

STORY AND NARRATION:
- Build a coherent beginning, development and satisfying ending, not disconnected facts.
- Open with a strong curiosity hook; write natural narration for approximately 2.0–2.3
  spoken words per second. Do not pad with filler.
- Respect the user's topic, audience, tone and requested format.
- For factual, historical, scientific or geographic topics, do not invent dates, quotations,
  events, statistics, identities or causal claims. Use cautious wording where uncertain.
- Narration must be the actual script converted to speech.

VISUAL PLAN:
- Return at least {minimum_scenes} distinct scenes, ideally 5–9 when duration allows.
- Use exactly 30 FPS. Frame ranges must be contiguous, non-overlapping and cover
  frame 0 through {total_frames} (end_frame is exclusive).
- Every scene needs a distinct visual objective, concrete objects and meaningful action.
- Describe recognizable, topic-specific subjects rather than generic geometric placeholders.
- Recurring characters must have stable names and consistent appearance, clothing, proportions,
  palette and personality. Repeat identifying details in scenes where they appear.
- Include shot composition, foreground/midground/background, camera motion and transitions.
- Prefer actions, interactions, cause/effect, reveals and transformations over cards or slideshows.
- Strictly 2D code-generated animation: Canvas/SVG drawing only. No 3D engine, meshes,
  Three.js, photorealism or dependence on external image assets.
- Make visual descriptions concrete enough for a separate code-generation model to implement.
- complexity must be light, medium or heavy. operations should be concise action verbs.
Return strict JSON only. No Markdown fences or commentary.
""".strip()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role":"system","content":prompt},
                      {"role":"user","content":"Create the complete story, spoken narration and timed scene plan now."}],
            response_format={"type":"json_object"},
            max_tokens=self.max_output_tokens,
            reasoning_effort=self.reasoning_effort,
        )
        raw = response.choices[0].message.content
        if not raw:
            raise RuntimeError("DeepSeek returned an empty story plan")
        try:
            plan = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError("DeepSeek returned invalid story-plan JSON") from exc
        if not isinstance(plan.get("title"), str) or not plan["title"].strip():
            raise RuntimeError("DeepSeek story plan is missing title")
        if not isinstance(plan.get("narration"), str) or len(plan["narration"].strip()) < 40:
            raise RuntimeError("DeepSeek story plan is missing usable narration")
        scenes = plan.get("scenes")
        if not isinstance(scenes, list) or len(scenes) < minimum_scenes:
            raise RuntimeError(f"DeepSeek must return at least {minimum_scenes} distinct scenes")
        weights = []
        for scene in scenes:
            if not isinstance(scene, dict):
                raise RuntimeError("DeepSeek returned a malformed scene")
            try:
                weights.append(max(1, int(scene["end_frame"]) - int(scene["start_frame"])))
            except (KeyError, TypeError, ValueError):
                weights.append(1)
        cursor = 0
        weight_total = sum(weights)
        for index, (scene, weight) in enumerate(zip(scenes, weights, strict=True)):
            end = total_frames if index == len(scenes)-1 else cursor + max(1, round(total_frames*weight/weight_total))
            scene["index"], scene["start_frame"], scene["end_frame"] = index, cursor, min(total_frames, end)
            scene.setdefault("purpose", f"Scene {index+1}")
            scene.setdefault("visual_description", scene["purpose"])
            scene.setdefault("complexity", "medium")
            if scene["complexity"] not in {"light","medium","heavy"}: scene["complexity"] = "medium"
            scene.setdefault("operations", ["reveal","transform"])
            scene.setdefault("layers", ["background","midground","foreground"])
            scene.setdefault("objects", ["topic-specific main subject","supporting prop"])
            scene.setdefault("events", ["The main subject performs a meaningful action"])
            scene.setdefault("camera", "purposeful cinematic 2D framing")
            scene.setdefault("transition_out", "motivated visual transition")
            cursor = scene["end_frame"]
        return plan
