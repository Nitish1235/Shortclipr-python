"""DeepSeek story, narration, visual-bible and timed-shot planner."""
from __future__ import annotations
import json
from typing import Any
from openai import AsyncOpenAI
from ..core.config import Settings
from .animation_contracts import STYLE_IDS, validate_scene_plan, validate_visual_bible
from .generation_policy import planning_effort


class DeepSeekStoryPlanner:
    """Creates the factual story, reusable visual bible and contiguous 30 FPS shot plan."""
    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_STORY_MODEL
        self.low_reasoning_effort = settings.DEEPSEEK_PLANNING_REASONING_EFFORT
        self.medium_reasoning_effort = "medium"
        self.max_output_tokens = settings.DEEPSEEK_PLAN_MAX_OUTPUT_TOKENS
        self.client = AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com",
                                  timeout=90.0, max_retries=0) if settings.DEEPSEEK_API_KEY else None

    async def plan(self, project: dict[str, Any]) -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        duration = int(project["duration_seconds"])
        total_frames = duration * 30
        minimum_scenes = max(3, min(9, duration // 4))
        styles = sorted(STYLE_IDS)
        prompt = f"""
You are ShortClipr's senior story writer, factual researcher, narration writer and 2D
animation director. Create a coherent short film plan.

PROJECT:
{json.dumps(project, ensure_ascii=False, default=str)}

Return strict JSON:
{{
 "title":"short title",
 "narration":"complete spoken narration",
 "visual_bible":{{
   "style_id":"one allowed style",
   "style_notes":"specific art direction",
   "characters":[{{"id":"char_explorer","name":"Explorer","design":{{"silhouette":"...","face":"...","clothing":"...","palette":["#..."],"proportions":"...","distinctive_marks":"..."}},"poses":["standing","walking"],"expressions":["curious","surprised"]}}],
   "props":[{{"id":"prop_map","name":"Map","design":"..."}}],
   "environments":[{{"id":"env_forest","name":"Forest","design":"..."}}]
 }},
 "scenes":[{{"index":0,"start_frame":0,"end_frame":180,"purpose":"...","visual_description":"...",
 "complexity":"medium","characters":["char_explorer"],"props":["prop_map"],
 "environment":"env_forest","action":"one clear visible action","camera":"2D camera direction",
 "transition_out":"motivated transition"}}]
}}

Narration: compelling beginning, development and ending; strong opening hook; natural spoken
language around 2.0–2.3 words/second. Do not pad. Never invent dates, quotes, statistics,
identities or causal claims. Be cautious when facts are uncertain.

Visual bible: choose one style_id from {", ".join(styles)}. Define recurring character
identity once: silhouette, face, clothing, proportions, palette, distinctive marks, poses,
expressions. Give every character, prop and environment a unique stable ID. Designs must be
drawable in 2D without external images.

Shot plan: at least {minimum_scenes} and at most 12 distinct shots. Exactly 30 FPS.
Integer frame ranges contiguous, non-overlapping, covering frame 0 through {total_frames};
end_frame is exclusive. Each shot has one clear visual objective and action. characters and
props arrays must reference declared IDs; environment must reference a declared ID or "".
Maintain exact character appearance across shots. Include composition, depth layers, camera,
action and motivated transition. Strictly 2D Canvas/SVG; no Three.js, WebGL, meshes or 3D.
Do not request subtitles; narration is muxed separately. Return JSON only.
""".strip()
        effort = planning_effort(project, self.low_reasoning_effort, self.medium_reasoning_effort)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role":"system","content":prompt},
                      {"role":"user","content":"Create the story, visual bible and timed shot plan."}],
            response_format={"type":"json_object"},
            max_tokens=self.max_output_tokens,
            reasoning_effort=effort,
            extra_body={"thinking": {"type": "enabled"}},
        )
        import logging
        logging.getLogger(__name__).info(
            "deepseek.story.response",
            extra={
                "model": self.model,
                "reasoning_effort": effort,
                "finish_reason": getattr(response.choices[0], "finish_reason", None) if response.choices else None,
                "completion_tokens": getattr(response.usage, "completion_tokens", None),
            },
        )
        choice = response.choices[0] if response.choices else None
        message = choice.message if choice else None
        raw = (message.content or "").strip() if message else ""
        usage = response.usage
        usage_info = {
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "reasoning_tokens": getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", None),
        }
        if not raw:
            finish_reason = getattr(choice, "finish_reason", None)
            raise RuntimeError(
                f"DeepSeek returned empty story-plan JSON "
                f"(finish_reason={finish_reason}, usage={usage_info}, response_id={getattr(response, 'id', None)})"
            )
        try:
            plan = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"DeepSeek returned invalid story-plan JSON "
                f"(finish_reason={getattr(choice, 'finish_reason', None)}, content_chars={len(raw)}, usage={usage_info})"
            ) from exc
        if not isinstance(plan, dict):
            raise RuntimeError("DeepSeek story plan must be an object")
        if not isinstance(plan.get("title"), str) or not plan["title"].strip():
            raise RuntimeError("DeepSeek story plan is missing title")
        if not isinstance(plan.get("narration"), str) or len(plan["narration"].strip()) < 40:
            raise RuntimeError("DeepSeek story plan is missing usable narration")
        bible = validate_visual_bible(plan.get("visual_bible"))
        scenes = plan.get("scenes")
        if not isinstance(scenes, list) or len(scenes) < minimum_scenes:
            raise RuntimeError(f"DeepSeek must return at least {minimum_scenes} shots")

        weights = []
        for scene in scenes:
            if not isinstance(scene, dict):
                raise RuntimeError("DeepSeek returned a malformed shot")
            try:
                weights.append(max(1, int(scene["end_frame"]) - int(scene["start_frame"])))
            except (KeyError, TypeError, ValueError):
                weights.append(1)
        total_weight = sum(weights)
        cumulative = 0
        cursor = 0
        for index, (scene, weight) in enumerate(zip(scenes, weights, strict=True)):
            cumulative += weight
            remaining = len(scenes) - index - 1
            end = total_frames if remaining == 0 else round(total_frames*cumulative/total_weight)
            end = max(cursor + 1, min(total_frames - remaining, end))
            scene.update({"index":index,"start_frame":cursor,"end_frame":end})
            scene.setdefault("purpose",f"Shot {index+1}")
            scene.setdefault("visual_description",scene["purpose"])
            scene.setdefault("complexity","medium")
            scene.setdefault("characters",[])
            scene.setdefault("props",[])
            scene.setdefault("environment","")
            scene.setdefault("action",scene["visual_description"])
            scene.setdefault("camera","purposeful 2D framing")
            scene.setdefault("transition_out","cut")
            cursor=end

        scenes = validate_scene_plan(scenes,total_frames)
        character_ids = {x["id"] for x in bible["characters"]}
        prop_ids = {x["id"] for x in bible["props"]}
        environment_ids = {x["id"] for x in bible["environments"]}
        for scene in scenes:
            if set(scene["characters"])-character_ids or set(scene["props"])-prop_ids:
                raise RuntimeError("Shot references an undeclared character or prop ID")
            if scene["environment"] and scene["environment"] not in environment_ids:
                raise RuntimeError("Shot references an undeclared environment ID")
        plan["visual_bible"] = bible
        plan["scenes"] = scenes
        return plan
