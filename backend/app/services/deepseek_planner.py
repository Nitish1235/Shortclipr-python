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

For deterministic mechanism movement, emit a mechanism-level "kinematics" array only
when numeric 2D geometry is known and defensible. Supported types:
- pivot: {{"type":"pivot","part":"deck","anchor":{{"x":120,"y":520}},"start_angle_deg":0,"end_angle_deg":65}}
- translation: {{"type":"translation","part":"carriage","start":{{"x":100,"y":200}},"end":{{"x":420,"y":200}}}}
- actuator: {{"type":"actuator","part":"rod","base_anchor":{{"x":250,"y":590}},"rod_anchor":{{"x":350,"y":545}},"min_length":95,"max_length":220}}
- gear: {{"type":"gear","part":"gear_b","driver_part":"gear_a","anchor":{{"x":375,"y":300}},"driver_anchor":{{"x":300,"y":300}},"driver_radius":50,"driven_radius":25,"driver_start_angle_deg":0,"driver_end_angle_deg":180,"driven_start_angle_deg":0,"mesh":"external"}}
- pulley: {{"type":"pulley","part":"counterweight","pulley_part":"pulley","anchor":{{"x":450,"y":180}},"radius":30,"start_angle_deg":0,"end_angle_deg":180,"start_position":{{"x":500,"y":420}},"axis":{{"x":0,"y":1}},"direction":1}}
- cable: {{"type":"cable","part":"cable","points_start":[{{"x":100,"y":100}},{{"x":200,"y":150}}],"points_end":[{{"x":100,"y":100}},{{"x":260,"y":150}}]}}
Coordinates are logical Canvas coordinates for the selected aspect ratio. Every referenced
part, including driver_part and pulley_part, must exist in the mechanism component list.
Do not guess dimensions or angles:
omit numeric kinematics when the physical source or visual construction does not
support them. Keep qualitative mechanism descriptions when numeric values are unknown.

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
   "mechanisms":[{{"id":"mechanism_bridge_lift","name":"Drawbridge lift","principle":"A hinged deck rotates upward; the actuator extends to drive it","components":[{{"prop_id":"prop_bridge","part":"deck","role":"rotating load"}},{{"prop_id":"prop_actuator","part":"rod","role":"linear driver"}}],"joints":[{{"type":"revolute","between":["deck","bridge frame"],"anchor":"fixed hinge"}}],"motion_constraints":["deck rotates around the fixed hinge","actuator length changes as deck angle changes"],"action_patterns":[{{"id":"raise_deck","description":"Raise deck from horizontal to open angle","driver":"actuator extends","followers":["deck rotates upward around hinge"],"relationship":"coordinated hinge rotation and actuator extension"}}],"kinematics":[{{"type":"pivot","part":"deck","anchor":{{"x":120,"y":520}},"start_angle_deg":0,"end_angle_deg":65}},{{"type":"actuator","part":"rod","base_anchor":{{"x":250,"y":590}},"rod_anchor":{{"x":350,"y":545}},"min_length":95,"max_length":220}}]}}]
