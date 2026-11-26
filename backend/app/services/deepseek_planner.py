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
        min_words = max(20, int(duration * 2.35))
        max_words = max(26, int(duration * 2.65))
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
  languages, strictly write {min_words}–{max_words} words (do NOT under-write! Spoken TTS runs
  at ~2.5 words/sec, so {min_words}–{max_words} words ensures continuous narration throughout the
  entire {duration}-second film with zero long silent gaps at the end). Strong opening hook, clear
  progression, satisfying payoff. Never invent dates, quotes, statistics, or unsupported factual claims.
- VISUAL CLARITY & SIMPLICITY FIRST (MUTED-AUDIO TEST — CRITICAL):
  - Imagine the viewer watches with SOUND MUTED: within 1 second of every shot, they must instantly
    recognize the real-world place, subject, and physical action (think Kurzgesagt / clean flat-vector
    editorial illustration — simple, bold, iconic shapes with clear contrast).
  - NEVER turn real-world scenes (nature, rivers, outdoors, people, sports, survival, biology) into
    abstract dark-navy CAD diagrams, floating gray cubes, wireframe sticks, or glowing dots!
  - Style-to-topic matching: choose one `style_id` from {", ".join(styles)}. {style_instruction}
    * Restrict `isometric-technical` and `blueprint` STRICTLY to architecture, circuits, hardware,
      factories, or machines — NEVER use them for nature, outdoor survival, sports, or human action.
    * For outdoor/nature/how-to/human topics, prefer bright, legible flat-vector styles
      (`paper-cutout`, `layered-paper`, `cinematic-editorial`, `comic`, `risograph`) with natural,
      vivid colors (e.g., sunlit sky/water/foliage — NOT a dark empty void).
  - Also design `visual_direction` tailored specifically to THIS topic (pick the genre that best fits!):
    * `visual_genre`: one of:
      - `clean_infographic`: bright pastel/graph-grid background (`#CBE7FF` / `#E2F6F0`), bold black outlines, circular zoom callouts, comparison cards (best for health, human body, everyday science, how-to!).
      - `kurzgesagt_cosmic`: rich deep space/nature gradients, chunky rounded vectors, glowing rim lights (space, biology, cosmos, physics).
      - `vox_editorial`: high-contrast editorial off-white/charcoal + 1 alert accent, expanding highlight bars, maps/charts (history, economics, news, media).
      - `math_3b1b`: dark slate `#161b24` coordinate grid, glowing cyan/gold curves & vectors (math, AI, algorithms, proofs).
      - `isometric_engineering`: clean 3-axis isometric/exploded hardware views (machines, circuits, architecture ONLY).
      - `layered_papercraft` / `organic_storybook` / `comic_cel_action` / `atmospheric_noir` / `retro_pixel_arcade`.
    * `palette`: 6 topic-specific hex colors (`bg`, `bg2`, `ink`, `primary`, `accent`, `secondary`)
      with high contrast and authentic real-world color fit for the subject.
    * `lighting_mood`: one of `dramatic_rim_glow`, `bright_editorial`, `warm_sunlit_shadows`,
      `neon_bloom`, `technical_clean`, `moody_volumetric`.
    * `camera_style`: one of `multiplane_parallax`, `crisp_orthographic`, `dynamic_action_cuts`,
      `slow_cinematic_dolly`.
    * `motion_feel`: one of `snappy_spring`, `smooth_fluid`, `posterized_12fps`, `mechanical_precise`.
- SUBJECT, CHARACTER & VISUAL BIBLE CONCRETENESS (CRITICAL):
  - If the topic involves a HUMAN body, posture, or physical action (crossing a river, swimming,
    running, lifting, sports, survival, cooking, daily life, stories), you MUST include 1 clear
    stylized hero character (`characters: [{{...}}]`) performing the actual action — NEVER replace
    a person with a glowing dot, circle, or abstract icon!
  - Only set `characters: []` when the topic is genuinely non-human (planets, black holes, engines,
    molecules, economics, history maps).
  - For every character, explicitly define in `design`:
    * `silhouette`: distinctive outer contour & gear (e.g. "broad shoulders, fur-trimmed hood, travel cloak")
    * `clothing`: layered materials (e.g. "matte woven tunic, dark trousers, sturdy boots, belt")
    * `face`: expressive style (e.g. "determined brow, bright eyes, expressive mouth")
    * `palette`: 5 hex colors `[skin, coat, pants, hair, accent]`
  - For every prop and environment, explicitly define:
    * 3–5 dominant recognizable forms + surface material notes (wood grain, faceted rock, metallic hull, layered foliage)
    * consistent light source direction and atmospheric depth method (gradient haze, multiplane parallax, volumetric beams)
  - Define only the essential recurring entities (0–2 characters, 2–4 props, 1 main continuous
    environment). Use concise stable IDs matching [a-zA-Z][a-zA-Z0-9_-]{{1,63}}.
  - Set `mechanisms` to `[]` (express moving parts directly via `props`, `action`, and `visual_change`).
- FULL-BLEED CONTINUOUS WORLD & CONCRETE STORYBOARD SHOTS:
  - Produce exactly {target_shots} distinct shots covering frame 0 through {total_frames} at 30 FPS
    (contiguous, non-overlapping integers; end_frame is exclusive).
  - Every shot must stay in the SAME recognizable continuous world (full-bleed edge-to-edge scenery
    filling 100% of the canvas — NEVER floating slabs in empty space) and focus on ONE clear,
    unmistakable visual beat with 3–6 rich, layered elements.
  - Every shot description MUST specify concrete visual direction (never vague like "character moves"):
    * exact camera framing & hero scale (e.g. "medium 3/4 shot, eye-level, hero 42% of frame height")
    * one concrete physical action + prop interaction (e.g. "hunter leans forward lighting torch in right hand from crackling flames")
    * explicit lighting note (e.g. "warm amber key light from fire at lower-right + cool moonlight rim")
    * continuous secondary motion that stays alive until the last frame of the shot (flames flickering, embers rising, water rippling, cloak swaying)
  - PAUSED-FRAME POSTER TEST & HIGH-CONTRAST VISIBILITY (CRITICAL — ESPECIALLY FOR THE ENDING!):
    * Every frame from 0s to {duration}s (including the FINAL shot!) must look like a clean,
      readable poster if paused: NEVER let the hero disappear into a pitch-black screen or sink
      off-screen into empty darkness!
    * For night or underwater shots: NEVER plan black-on-black. Specify rich deep-teal/indigo
      water (`#0f3554` -> `#071e36`), volumetric light rays streaming from the surface above,
      a visible seabed/terrain floor, and warm lit windows/rim highlights so the subject stays
      100% crisp and readable until the very last frame.
    * For internal cutaways/cross-sections (e.g., ship compartments, engines, organs): ALWAYS keep
      the unmistakable outer silhouette (tapered hull, smokestacks, deck) — NEVER a plain box!
  - NO title cards, NO top pill banners, NO cluttered callout labels — let clear visual storytelling
    and bold directional arrows do the explaining.
- CINEMATOGRAPHY & 2D-FRIENDLY FRAMING (NEVER FORCE AWKWARD OR IMPOSSIBLE 2D ANGLES!):
  - Assign each shot an explicit `camera_angle` (`eye_level`, `high_angle`, `low_angle`, `overhead`,
    `macro_closeup`, `dutch_tilt`, `isometric`) and `energy` (`calm`, `building`, `action`, `climax`).
  - Keep every shot **natural, grounded, and easy to draw cleanly in 2D**, while varying `shot_scale`
    (`wide` -> `medium` -> `close_up` -> `wide`) so consecutive shots NEVER look like the same
    static camera setup:
    * Use `low_angle` for monumental scale (trees, ships, rockets, mountains), `eye_level` for
      character action, `close_up` for dramatic hand/object/face moments (e.g., lighting a torch,
      turning a key, impact), and `high_angle` for group/environment reveals.
    * NEVER use `overhead` for human characters (a top-down 2D person looks broken/sideways!) — reserve
      `overhead` strictly for maps, paths without a close-up person, or diagrams.
    * NEVER design disembodied macro body-part shots (like giant floating legs/feet alone). Keep
      clean waist-up, hand+prop, or full-body framing in view.
    * Avoid `dutch_tilt` unless there is a true high-energy action moment.
  - PHYSICAL REALISM:
    * If a person is in water (river, ocean, pool), describe them as **wading waist/knee-deep IN the
      water** (water overlapping their lower legs/torso with splashes) or **swimming/floating IN the
      water** — NEVER standing or walking dry on top of the water surface!
  - Motivated action ONLY: use `action` / `climax` energy ONLY on genuine breakthroughs, impacts,
    or dramatic peaks — keep explanatory beats `calm` / `building`.
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
    "camera_angle": "low_angle",
    "energy": "building",
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
