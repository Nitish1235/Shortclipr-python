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
You are ShortClipr's film development director: story editor, factual-accuracy editor,
production designer and storyboard director. Design a film that can be executed by
a deterministic 2D Canvas renderer. You are planning a film, not writing generic
descriptive prose.

PRIMARY OBJECTIVE
Create a visually compelling, understandable short film. Every shot must add new
information or change the viewer's understanding. Prefer concrete subjects, spatial
relationships, cause-and-effect, transformations and visible states over abstract
claims or decorative graphics. Do not solve visual quality with text cards, repeated
icons, generic grids, or a sequence of unrelated illustrations.

FACTUAL DISCIPLINE
Do not invent statistics, dates, quotations, named sources, identities, engineering
specifications or causal claims. Use only facts that are well established from the
topic and supplied brief. If a precise value or mechanism is uncertain, avoid the
number and explain the principle visually at an appropriate level. Do not imply
that illustrative motion is a physically exact simulation unless defensible numeric
kinematics are supplied.

FILM STRUCTURE
- Produce between {minimum_scenes} and 12 shots for a {duration}-second film.
- Build a clear opening hook, progressive explanation or story development, and
  a satisfying final state. The ending must resolve the opening question or idea.
- Each shot communicates one primary idea through a visible action or state change.
- Use varied, motivated shot scales: establishing wide, medium action, close-up,
  detail, overhead or isometric when useful. Do not repeat the same composition
  merely because the scene changes.
- Use visual transitions only when they connect ideas, locations, time or motion.
- Avoid title-card openings and endings. Do not add subtitles; narration is muxed
  separately. Do not put narration text into the visual plan.
- Narration should sound natural when spoken, with a compelling opening and a
  coherent progression. Target approximately 2.0–2.3 spoken words per second;
  never pad to hit a word count.

VISUAL BIBLE — DEFINE BEFORE STORYBOARDING
Create a reusable visual bible that makes the film drawable and consistent.
- Use concise stable IDs matching [a-zA-Z][a-zA-Z0-9_-]{1,63}; IDs are case-sensitive.
- Keep the bible economical: no more than 20 characters, 40 props, 20 environments
  and 20 mechanisms. Include only entities that appear or are needed for continuity.
- Choose one style_id from: {", ".join(styles)}. {style_instruction}
- Characters: give each a stable unique ID and a drawable design specifying
  silhouette, proportions, face, hair/head, clothing, palette and distinctive marks.
  Define poses and expressions that are actually needed. Include scale_reference.
  Never change identity-defining features between shots.
- Props: give each a stable unique ID, clear silhouette and material. Include
  relative_scale, components, anchors and moving_parts where useful. A prop used
  repeatedly must retain the same geometry and appearance.
- Environments: define spatial_layout, foreground, midground, background,
  scale_reference and atmosphere. Describe a coherent place, not just a background
  color or decorative pattern.
- Mechanisms: include only when the topic genuinely contains a connected mechanism.
  Declare every component with a unique part name, prop_id and functional role.
  Describe joints, motion_constraints, action_patterns, driver and followers.
  Include numeric kinematics only when the geometry and values are known and
  defensible. Never invent dimensions, angles, gear ratios or physical laws.
  Supported kinematics:
  pivot: {{"type":"pivot","part":"deck","anchor":{{"x":120,"y":520}},"start_angle_deg":0,"end_angle_deg":65}}
  translation: {{"type":"translation","part":"carriage","start":{{"x":100,"y":200}},"end":{{"x":420,"y":200}}}}
  actuator: {{"type":"actuator","part":"rod","base_anchor":{{"x":250,"y":590}},"rod_anchor":{{"x":350,"y":545}},"min_length":95,"max_length":220}}
  gear: {{"type":"gear","part":"gear_b","driver_part":"gear_a","anchor":{{"x":375,"y":300}},"driver_anchor":{{"x":300,"y":300}},"driver_radius":50,"driven_radius":25,"driver_start_angle_deg":0,"driver_end_angle_deg":180,"driven_start_angle_deg":0,"mesh":"external"}}
  pulley: {{"type":"pulley","part":"counterweight","pulley_part":"pulley","anchor":{{"x":450,"y":180}},"radius":30,"start_angle_deg":0,"end_angle_deg":180,"start_position":{{"x":500,"y":420}},"axis":{{"x":0,"y":1}},"direction":1}}
  cable: {{"type":"cable","part":"cable","points_start":[{{"x":100,"y":100}},{{"x":200,"y":150}}],"points_end":[{{"x":100,"y":100}},{{"x":260,"y":150}}]}}
  Coordinates are logical Canvas coordinates for the selected aspect ratio. Every
  referenced part must be declared. If geometry is unknown, omit kinematics and
  describe qualitative movement honestly.
  Mechanism object contract:
  {{"id":"mechanism_bridge","name":"Drawbridge","principle":"Counterweight and cable assist deck rotation",
   "components":[{{"part":"deck","prop_id":"prop_deck","role":"moving bridge deck"}},{{"part":"counterweight","prop_id":"prop_weight","role":"follower"}}],
   "joints":[{{"type":"pivot","anchor":"hinge","between":["deck","support"]}}],
   "motion_constraints":["The deck rotates around the fixed hinge."],
   "action_patterns":[{{"id":"raise_deck","description":"Raise deck from closed to open","driver":"deck","followers":["counterweight"],"relationship":"Counterweight moves as the deck rotates."}}],
   "kinematics":[{{"type":"pivot","part":"deck","anchor":{{"x":450,"y":700}},"start_angle_deg":0,"end_angle_deg":65}}]}}
  Every component prop_id must reference a declared prop; part names are unique.
  Every joint requires type, anchor and exactly two part names in between.
  Each action pattern requires id, description, driver, followers and relationship.
  Kinematics is optional and must follow one supported type contract.

SHOT-BY-SHOT STORYBOARD
For every shot provide ALL of these fields with specific, non-generic direction:
- purpose: why this shot exists in the film.
- visual_description: what is physically visible in the frame.
- visual_objective: the single idea the viewer should understand from this shot.
- composition: subject placement, relative scale, negative space, foreground framing
  and visual hierarchy. Avoid vague phrases such as "balanced composition".
- shot_scale: one of extreme_wide, wide, medium, close_up, extreme_close_up,
  detail, overhead, isometric.
- camera_position: a concrete 2D viewpoint, angle, height and/or crop.
- depth_layers: an ordered array of 1–6 named layers from background to foreground;
  describe actual elements, not just the words "background, subject, foreground".
- focal_entity: the principal character, prop or mechanism component, using its
  stable ID or declared part name.
- visual_change: explicit initial state -> action -> final state. The change must
  be visible and achievable in the shot duration.
- continuity_note: what must carry over from the preceding shot: identity, position,
  motion direction, prop state, environment, lighting or screen direction.
- characters, props and environment: reference only declared IDs.
- action: one concise description of the main visible action.
- camera: short camera movement/framing summary.
- transition_out: a motivated transition to the next shot.
- mechanism_actions: [] unless a declared mechanism is used. Each action must name
  mechanism_id, pattern_id, action, start_progress, end_progress and easing
  (linear, in_out, ease_in or ease_out). Progress is normalized 0–1 and increases.
  Only use declared action patterns. Use at most 8 actions per shot. start_progress
  must be less than end_progress; use 0 and 1 for a complete action unless the shot
  deliberately continues a mechanism's motion from an adjacent shot.

COMPOSITION AND CONTINUITY
Think in shots, not slides. Establish geography before close-ups. When a close-up
shows a component, make its location and relationship to the wider mechanism clear.
Keep screen direction, lighting, character scale and prop state coherent across cuts.
Use foreground/midground/background only when each plane contributes depth or story.
Every shot must have a different visual reason to exist; vary camera distance and
composition while preserving the same world and design language.

OUTPUT CONTRACT
Return one JSON object only, with this structure:
{{
  "title": "short film title",
  "narration": "complete spoken narration",
  "visual_bible": {{
    "style_id": "one allowed style",
    "style_notes": "specific art direction",
    "characters": [{{"id":"char_explorer","name":"Explorer","design":{{"silhouette":"...","face":"...","clothing":"...","palette":["#..."],"proportions":"...","distinctive_marks":"..."}},"poses":["standing","walking"],"expressions":["curious","surprised"],"scale_reference":"..."}}],
    "props": [{{"id":"prop_map","name":"Map","design":"...","material":"...","relative_scale":"...","components":[],"anchors":[],"moving_parts":[]}}],
    "environments": [{{"id":"env_forest","name":"Forest","design":"...","spatial_layout":"...","foreground":"...","midground":"...","background":"...","scale_reference":"...","atmosphere":"..."}}],
    "mechanisms": []
  }},
  "scenes": [{{
    "index":0,"start_frame":0,"end_frame":180,"purpose":"...",
    "visual_description":"...","visual_objective":"...","composition":"...",
    "shot_scale":"wide","camera_position":"...","depth_layers":["distant hills","bridge","river foreground"],
    "focal_entity":"prop_bridge","visual_change":"closed -> deck rises -> open",
    "continuity_note":"...","complexity":"medium","characters":[],"props":["prop_bridge"],
    "environment":"env_river","action":"...","camera":"...","transition_out":"...",
    "mechanism_actions":[]
  }}]
}}

TIMING
Use exactly 30 FPS. Frame ranges are integers, contiguous, non-overlapping and
cover frame 0 through {total_frames}; end_frame is exclusive. Include at least
{minimum_scenes} distinct shots. Keep shot durations long enough for their visible
action to read. Return JSON only, without Markdown or explanations.
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
        # Explicit UI selections are authoritative even if the model drifts.
        bible = apply_visual_direction(bible, requested_style)
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
