"""DeepSeek story, narration, visual-bible and timed-shot planner."""
from __future__ import annotations
import json
from typing import Any
from openai import AsyncOpenAI
from ..core.config import Settings
from .animation_contracts import STYLE_IDS, validate_scene_plan, validate_visual_bible, validate_visual_direction
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
        target_shots = max(3, min(8, round(duration / 5)))
        minimum_scenes = max(3, min(target_shots, duration // 4 if duration >= 12 else 3))
        min_words = max(16, int(duration * 1.65))
        max_words = max(22, int(duration * 2.15))
        styles = sorted(STYLE_IDS)
        requested_style = resolve_visual_style(project.get("visual_style", "AI Auto"))
        style_instruction = (
            f"MANDATORY USER SELECTION: use exactly style_id '{requested_style}'. Do not substitute another style."
            if requested_style else
            "AUTO SELECTION: choose the best supported style_id for this topic."
        )
# === LEGACY DEEPSEEK STORY PROMPT (rollback reference; inactive) ===
#         prompt = f"""
# You are ShortClipr's senior story writer, factual researcher, narration writer and 2D
# animation director. Create a coherent short film plan.
# 
# For deterministic mechanism movement, emit a mechanism-level "kinematics" array only
# when numeric 2D geometry is known and defensible. Supported types:
# - pivot: {{"type":"pivot","part":"deck","anchor":{{"x":120,"y":520}},"start_angle_deg":0,"end_angle_deg":65}}
# - translation: {{"type":"translation","part":"carriage","start":{{"x":100,"y":200}},"end":{{"x":420,"y":200}}}}
# - actuator: {{"type":"actuator","part":"rod","base_anchor":{{"x":250,"y":590}},"rod_anchor":{{"x":350,"y":545}},"min_length":95,"max_length":220}}
# - gear: {{"type":"gear","part":"gear_b","driver_part":"gear_a","anchor":{{"x":375,"y":300}},"driver_anchor":{{"x":300,"y":300}},"driver_radius":50,"driven_radius":25,"driver_start_angle_deg":0,"driver_end_angle_deg":180,"driven_start_angle_deg":0,"mesh":"external"}}
# - pulley: {{"type":"pulley","part":"counterweight","pulley_part":"pulley","anchor":{{"x":450,"y":180}},"radius":30,"start_angle_deg":0,"end_angle_deg":180,"start_position":{{"x":500,"y":420}},"axis":{{"x":0,"y":1}},"direction":1}}
# - cable: {{"type":"cable","part":"cable","points_start":[{{"x":100,"y":100}},{{"x":200,"y":150}}],"points_end":[{{"x":100,"y":100}},{{"x":260,"y":150}}]}}
# Coordinates are logical Canvas coordinates for the selected aspect ratio. Every referenced
# part, including driver_part and pulley_part, must exist in the mechanism component list.
# Do not guess dimensions or angles:
# omit numeric kinematics when the physical source or visual construction does not
# support them. Keep qualitative mechanism descriptions when numeric values are unknown.
# 
# PROJECT:
# {json.dumps(project, ensure_ascii=False, default=str)}
# 
# Return strict JSON:
# {{
#  "title":"short title",
#  "narration":"complete spoken narration",
#  "visual_bible":{{
#    "style_id":"one allowed style",
#    "style_notes":"specific art direction",
#    "characters":[{{"id":"char_explorer","name":"Explorer","design":{{"silhouette":"...","face":"...","clothing":"...","palette":["#..."],"proportions":"...","distinctive_marks":"..."}},"poses":["standing","walking"],"expressions":["curious","surprised"]}}],
#    "props":[{{"id":"prop_map","name":"Map","design":"..."}}],
#    "environments":[{{"id":"env_forest","name":"Forest","design":"..."}}]
#  }},
#  "scenes":[{{"index":0,"start_frame":0,"end_frame":180,"purpose":"...","visual_description":"...",
#  "complexity":"medium","characters":["char_explorer"],"props":["prop_map"],
#  "environment":"env_forest","action":"one clear visible action","camera":"2D camera direction",
#  "transition_out":"motivated transition"}}]
# }}
# 
# Narration: compelling beginning, development and ending; strong opening hook; natural spoken
# language around 2.0–2.3 words/second. Do not pad. Never invent dates, quotes, statistics,
# identities or causal claims. Be cautious when facts are uncertain.
# 
# Visual bible: choose one style_id from {", ".join(styles)}. {style_instruction} Define recurring character
# identity once: silhouette, face, clothing, proportions, palette, distinctive marks, poses,
# expressions. Give every character, prop and environment a unique stable ID. Designs must be
# drawable in 2D without external images.
# 
# Shot plan: at least {minimum_scenes} and at most 12 distinct shots. Exactly 30 FPS.
# Integer frame ranges contiguous, non-overlapping, covering frame 0 through {total_frames};
# end_frame is exclusive. Each shot has one clear visual objective and action. characters and
# props arrays must reference declared IDs; environment must reference a declared ID or "".
# Maintain exact character appearance across shots. Include composition, depth layers, camera,
# action and motivated transition. Strictly 2D Canvas/SVG; no Three.js, WebGL, meshes or 3D.
# Do not request subtitles; narration is muxed separately. Return JSON only.
# """.strip()
# === END LEGACY STORY PROMPT ===

        prompt = f"""
ROLE
You are ShortClipr's film director and storyboard writer. Design a visually compelling,
coherent {duration}-second short film for a deterministic 2D Canvas renderer.

PROJECT:
{json.dumps({
    "brief": project.get("brief", ""),
    "clip_type": project.get("clip_type", ""),
    "language": project.get("language", "en"),
    "visual_style": project.get("visual_style", "AI Auto"),
    "duration_seconds": duration,
    "aspect_ratio": project.get("aspect_ratio", "9:16"),
}, ensure_ascii=False)}

RULES
- Keep every JSON string concise and concrete (1–2 sentences max per field; never write essays).
- Narration: write in the requested language (`{project.get("language", "en")}`). For English/European
  languages, strictly target {min_words}–{max_words} words so spoken audio finishes cleanly inside
  {duration} seconds without getting cut off. Strong opening hook, clear progression, satisfying payoff.
  Never invent dates, quotes, statistics, or unsupported factual claims.
- Style & Visualography: choose one style_id from {", ".join(styles)}. {style_instruction}
  Also design `visual_direction` tailored specifically to THIS topic:
  - `visual_genre`: one of `kurzgesagt_cosmic`, `vox_editorial`, `isometric_engineering`,
    `atmospheric_noir`, `expressive_character`, `comic_cel_action`, `layered_papercraft`,
    `retro_pixel_arcade`, `organic_storybook`.
  - `palette`: 6 topic-specific hex colors (`bg`, `bg2`, `ink`, `primary`, `accent`, `secondary`)
    with high contrast and emotional fit for the subject.
  - `lighting_mood`: one of `dramatic_rim_glow`, `bright_editorial`, `warm_sunlit_shadows`,
    `neon_bloom`, `technical_clean`, `moody_volumetric`.
  - `camera_style`: one of `multiplane_parallax`, `crisp_orthographic`, `dynamic_action_cuts`,
    `slow_cinematic_dolly`.
  - `motion_feel`: one of `snappy_spring`, `smooth_fluid`, `posterized_12fps`, `mechanical_precise`.
- Visual bible: define only the recurring entities actually needed (0–2 characters, 2–5 props,
  1–2 environments). IMPORTANT: default to `characters: []` (ZERO characters) for explainers,
  science, space, engineering, maps, data, history, and object/mechanism topics — focus on
  monumental hero objects, environments, and motion graphics instead of adding a person. Only
  include 1–2 characters when the brief is genuinely character-driven (comedy, fable, conversation,
  or a specific person's story). Use concise stable IDs matching [a-zA-Z][a-zA-Z0-9_-]{{1,63}}.
  Set `mechanisms` to `[]` (express moving parts directly via `props`, `action`, and `visual_change`).
- Storyboard: produce exactly {target_shots} distinct shots covering frame 0 through {total_frames}
  at 30 FPS (contiguous, non-overlapping integers; end_frame is exclusive).
- Enforce real shot-scale variety across shots (NEVER repeat the same flat wide view back-to-back):
  mix establishing/wide, tight close-up/detail on moving parts, overhead/isometric, and monumental
  hero reveals. Never keep an idle bystander character in an object-focus or close-up shot.
- Vary `transition_out` (cut, fade, wipe, iris, paper, zoom, whip). Avoid title cards and subtitles.

OUTPUT CONTRACT (return strict JSON only, no Markdown):
{{
  "title": "short film title",
  "narration": "complete spoken narration",
  "visual_bible": {{
    "style_id": "one allowed style",
    "style_notes": "concise art direction & palette guidance",
    "visual_direction": {{
      "visual_genre": "kurzgesagt_cosmic",
      "palette": {{"bg":"#0b1021","bg2":"#16203d","ink":"#f4f1ea","primary":"#38bdf8","accent":"#ff6b35","secondary":"#a855f7"}},
      "lighting_mood": "dramatic_rim_glow",
      "camera_style": "multiplane_parallax",
      "motion_feel": "snappy_spring"
    }},
    "characters": [{{"id":"char_hero","name":"Hero","design":{{"silhouette":"...","face":"...","clothing":"...","palette":["#..."],"proportions":"..."}},"poses":["idle","action"],"expressions":["focused"],"scale_reference":"..."}}],
    "props": [{{"id":"prop_item","name":"Item","design":"concise shape & material","material":"...","relative_scale":"..."}}],
    "environments": [{{"id":"env_main","name":"Main Setting","design":"concise place description","spatial_layout":"...","foreground":"...","midground":"...","background":"...","atmosphere":"..."}}],
    "mechanisms": []
  }},
  "scenes": [{{
    "index": 0,
    "start_frame": 0,
    "end_frame": 150,
    "purpose": "why this shot exists",
    "visual_description": "what is visibly happening",
    "visual_objective": "single clear takeaway",
    "composition": "specific spatial framing & focal placement",
    "shot_scale": "wide",
    "camera_position": "concrete 2D viewpoint/crop",
    "depth_layers": ["background element", "midground subject", "foreground framing"],
    "focal_entity": "char_hero",
    "visual_change": "start state -> action -> end state",
    "continuity_note": "what carries over",
    "complexity": "medium",
    "characters": ["char_hero"],
    "props": ["prop_item"],
    "environment": "env_main",
    "action": "one clear visible action",
    "camera": "camera movement",
    "transition_out": "cut",
    "mechanism_actions": []
  }}]
}}
""".strip()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": "Create the concise story, visual bible, and timed shot plan JSON."},
            ],
            response_format={"type": "json_object"},
            max_tokens=self.max_output_tokens,
            reasoning_effort="none",
            extra_body={"thinking": {"type": "disabled"}},
        )
        effort = "none"
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
        if not isinstance(plan.get("narration"), str) or len(plan["narration"].strip()) < 12:
            raise RuntimeError("DeepSeek story plan is missing usable narration")
        bible = validate_visual_bible(plan.get("visual_bible"))
        # Explicit UI selections are authoritative even if the model drifts.
        bible = apply_visual_direction(bible, requested_style)
        bible["visual_direction"] = validate_visual_direction(bible.get("visual_direction"), bible["style_id"])
        art_direction = build_art_direction(
            bible["style_id"],
            requested_style=requested_style,
            style_notes=bible.get("style_notes", ""),
        )
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

        scenes = validate_scene_plan(scenes, total_frames)
        character_ids = {x["id"] for x in bible["characters"]}
        prop_ids = {x["id"] for x in bible["props"]}
        environment_ids = {x["id"] for x in bible["environments"]}
        mechanism_ids = {x["id"] for x in bible.get("mechanisms", [])}
        patterns_by_mechanism = {
            m["id"]: {p["id"] for p in m.get("action_patterns", [])}
            for m in bible.get("mechanisms", [])
        }
        # Sanitize minor model ID typos instead of aborting the entire film.
        for scene in scenes:
            scene["characters"] = [cid for cid in scene["characters"] if cid in character_ids]
            scene["props"] = [pid for pid in scene["props"] if pid in prop_ids]
            if scene["environment"] and scene["environment"] not in environment_ids:
                scene["environment"] = next(iter(environment_ids), "")
            scene["mechanism_actions"] = [
                action for action in scene.get("mechanism_actions", [])
                if action.get("mechanism_id") in mechanism_ids
                and action.get("pattern_id") in patterns_by_mechanism.get(action["mechanism_id"], set())
            ]
        plan["visual_bible"] = bible
        plan["art_direction"] = art_direction
        plan["scenes"] = scenes
        return plan
