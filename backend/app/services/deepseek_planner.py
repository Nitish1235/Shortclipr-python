"""DeepSeek story, narration, visual-bible and timed-shot planner."""
from __future__ import annotations
import json
from typing import Any
from openai import AsyncOpenAI
from ..core.config import Settings
from .animation_contracts import STYLE_IDS, validate_scene_plan, validate_visual_bible
from .generation_policy import planning_effort
from .style_registry import apply_visual_direction, resolve_visual_style
from .art_direction import build_art_direction


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
        requested_style = resolve_visual_style(project.get("visual_style", "AI Auto"))
        style_instruction = (
            f"MANDATORY USER SELECTION: use exactly style_id '{requested_style}'. Do not substitute another style."
            if requested_style else
            "AUTO SELECTION: choose the best supported style_id for this topic."
        )
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
   "props":[{{"id":"prop_bridge","name":"Bridge deck","design":"...","material":"...","relative_scale":"...","components":["deck"],"anchors":["hinge"],"moving_parts":["deck"]}},{{"id":"prop_actuator","name":"Actuator","design":"...","material":"...","relative_scale":"...","components":["cylinder","rod"],"anchors":["base pin","deck pin"],"moving_parts":["rod"]}}],
   "environments":[{{"id":"env_forest","name":"Forest","design":"...","spatial_layout":"...","foreground":"...","midground":"...","background":"...","scale_reference":"...","atmosphere":"..."}}],
   "mechanisms":[{{"id":"mechanism_bridge_lift","name":"Drawbridge lift","principle":"A hinged deck rotates upward; the actuator extends to drive it","components":[{{"prop_id":"prop_bridge","part":"deck","role":"rotating load"}},{{"prop_id":"prop_actuator","part":"cylinder","role":"linear driver"}}],"joints":[{{"type":"revolute","between":["deck","bridge frame"],"anchor":"fixed hinge"}}],"motion_constraints":["deck rotates around the fixed hinge","actuator length changes as deck angle changes"],"action_patterns":[{{"id":"raise_deck","description":"Raise deck from horizontal to open angle","driver":"actuator extends","followers":["deck rotates upward around hinge"],"relationship":"coordinated hinge rotation and actuator extension"}}]}}]
