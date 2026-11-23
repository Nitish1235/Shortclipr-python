"""Shot-by-shot DeepSeek compiler for deterministic Drawn-by-Code films."""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


async def _gather_cancel_on_error(*coroutines):
    """Cancel sibling generation calls immediately when one fails or is cancelled."""
    tasks = [asyncio.create_task(coro) for coro in coroutines]
    try:
        return await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise


from openai import AsyncOpenAI

from ..core.config import Settings
from .art_direction import build_art_direction, format_art_direction, validate_art_direction
from .animation_contracts import (
    ASPECT_LOGICAL,
    MAX_FILM_SOURCE,
    MAX_SHARED_SOURCE,
    MAX_SHOT_SOURCE,
    validate_generated_fragment,
    find_unresolved_draw_helpers,
    validate_draw_helper_definitions,
    validate_scene_plan,
    validate_visual_bible,
    analyze_mechanism_motion,
)


class DeepSeekAnimationCompiler:
    """Compiles a visual bible into shared drawing helpers and independent shot functions."""

    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_ANIMATION_MODEL
        self.max_output_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS
        self.max_parallel_shots = max(1, min(4, settings.DEEPSEEK_MAX_PARALLEL_SHOTS))
        self.client = (
            AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com",
                        timeout=90.0, max_retries=0)
            if settings.DEEPSEEK_API_KEY else None
        )

    async def _code_completion(
        self, system_prompt: str, user_prompt: str, token_limit: int,
        label: str = "animation fragment",
    ) -> str:
        """Generate raw JavaScript; do not serialize code inside a JSON string."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        request_started = asyncio.get_running_loop().time()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=token_limit,
            reasoning_effort="none",
            extra_body={"thinking": {"type": "disabled"}},
        )
        latency_ms = round((asyncio.get_running_loop().time() - request_started) * 1000)
        choice = response.choices[0] if response.choices else None
        message = choice.message if choice else None
        raw = (message.content or "").strip() if message else ""
        usage = response.usage
        prompt_details = getattr(usage, "prompt_tokens_details", None)
        finish_reason = getattr(choice, "finish_reason", None)
        logger.info("deepseek.animation.response", extra={
            "model": self.model, "label": label, "thinking_enabled": False,
            "latency_ms": latency_ms, "finish_reason": finish_reason,
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "prompt_cache_hit_tokens": getattr(prompt_details, "cached_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
            "content_chars": len(raw),
        })
        if not raw:
            raise RuntimeError(f"DeepSeek returned empty JavaScript for {label}")
        if finish_reason == "length":
            raise RuntimeError(f"DeepSeek truncated JavaScript for {label}")
        # Permit one complete code fence, but never salvage code from prose.
        fenced = re.fullmatch(r"```(?:javascript|js)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
        if fenced:
            raw = fenced.group(1).strip()
        elif raw.startswith("```") or raw.endswith("```"):
            raise RuntimeError(f"DeepSeek returned a malformed code fence for {label}")
        return raw

    async def _validated_fragment(
        self, system_prompt: str, user_prompt: str, token_limit: int,
        field: str, label: str, max_chars: int, reasoning_effort: str = "none",
    ) -> str:
        """Generate once and apply only basic deterministic checks."""
        source = await self._code_completion(system_prompt, user_prompt, token_limit, label=label)
        return validate_generated_fragment(source, label, max_chars)

    @staticmethod
    def _shot_visual_context(visual_bible: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
        """Send each shot only the visual-bible entities it actually uses."""
        character_ids = set(scene.get("characters") or [])
        prop_ids = set(scene.get("props") or [])
        environment_id = scene.get("environment")
        mechanism_ids = {item.get("mechanism_id") for item in scene.get("mechanism_actions", [])}
        mechanisms = [
            item for item in visual_bible.get("mechanisms", [])
            if item.get("id") in mechanism_ids
        ]
        # Mechanism components may be omitted from scene.props by the planner.
        # Pull their prop-backed visual definitions into the shot context so the
        # drawing model can render the actual connected parts, not just labels.
        mechanism_prop_ids = {
            component.get("prop_id")
            for mechanism in mechanisms
            for component in mechanism.get("components", [])
        }
        prop_ids.update(mechanism_prop_ids)
        return {
            "style_id": visual_bible["style_id"],
            "style_notes": visual_bible.get("style_notes", ""),
            "characters": [
                item for item in visual_bible.get("characters", [])
                if item.get("id") in character_ids
            ],
            "props": [
                item for item in visual_bible.get("props", [])
                if item.get("id") in prop_ids
            ],
            "environments": [
                item for item in visual_bible.get("environments", [])
                if item.get("id") == environment_id
            ],
            "mechanisms": mechanisms,
        }

    @staticmethod
    def _visual_qa_context(visual_bible: dict[str, Any], scenes: list[dict[str, Any]]) -> dict[str, Any]:
        """Keep the visual review context aligned to the exact plan used to compile."""
        storyboard_fields = (
            "index", "start_frame", "end_frame", "purpose", "visual_objective",
            "composition", "shot_scale", "camera_position", "depth_layers",
            "focal_entity", "visual_change", "continuity_note", "characters",
            "props", "environment", "mechanism_actions",
        )
        return {
            "visual_bible": visual_bible,
            "storyboard": [
                {key: scene.get(key) for key in storyboard_fields if key in scene}
                for scene in scenes
            ],
        }

    async def compile(self, project: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        duration = int(project["duration_seconds"])
        total_frames = duration * 30
        aspect = str(project["aspect_ratio"])
        logical = ASPECT_LOGICAL.get(aspect)
        if logical is None:
            raise ValueError(f"Unsupported aspect ratio: {aspect}")

        visual_bible = validate_visual_bible(plan.get("visual_bible"))
        scenes = validate_scene_plan(plan.get("scenes"), total_frames)
        mechanisms_by_id = {item["id"]: item for item in visual_bible.get("mechanisms", [])}
        for scene in scenes:
            for action in scene.get("mechanism_actions", []):
                mechanism = mechanisms_by_id.get(action["mechanism_id"])
                if mechanism is None:
                    raise ValueError("Shot mechanism action references an undeclared mechanism ID")
                if action["pattern_id"] not in {item["id"] for item in mechanism.get("action_patterns", [])}:
                    raise ValueError("Shot mechanism action references an undeclared action pattern")
        motion_diagnostics = analyze_mechanism_motion(visual_bible, scenes)
        style_id = visual_bible["style_id"]
        art_direction_value = plan.get("art_direction")
        if art_direction_value is None:
            # Compatibility for persisted plans created before ArtDirectionV1.
            art_direction = build_art_direction(
                style_id, requested_style=None,
                style_notes=str(visual_bible.get("style_notes", "")),
            )
        else:
            art_direction = validate_art_direction(art_direction_value, style_id)
        art_direction_instructions = format_art_direction(art_direction)

        # === LEGACY SHARED DRAWING LIBRARY PROMPT (rollback reference; inactive) ===
        # shared_prompt = f"""
        # You are ShortClipr's senior 2D character and illustration systems artist.
        # Create a compact reusable JavaScript drawing library for a {style_id} Canvas 2D film.\nFollow this binding art-direction contract:\n{art_direction_instructions}\nAim for at most 1,800 output tokens.
        # Return JSON only: {{"shared_js":"JavaScript source"}}.
        # The source is evaluated in the same script as the film and may define ordinary named
        # functions and constants. It must not call Motion.scene. Use only the supplied Canvas
        # 2D context in functions. Never reference browser-global identifiers such as window,
        # document, self, top, parent or frames. No DOM, browser globals, imports, exports, network, filesystem,
        # Node APIs, timers, eval, Function, Date, performance, Math.random, WebGL or 3D.
        # A trusted runtime script ShortcliprStyles is loaded before this library. Use
        # ShortcliprStyles.palette("{style_id}"), ShortcliprStyles.paperBackground(g, "{style_id}", env),
        # ShortcliprStyles.paperShadow(g, x, y, blur, color), ShortcliprStyles.halftone(g, x, y, w, h, spacing, color),
        # ShortcliprStyles.camera(g, env, {{cx, cy, zoom, rotation}}) inside g.save()/g.restore(), and
        # ShortcliprStyles.pixelSnap(value, pixelSize) where appropriate.
        # For cinematic-editorial use ShortcliprStyles.editorialShape(g, points, opts) for layered
        # graphic silhouettes and editorialLight(g,x,y,r,color) for restrained focal light.
        # For isometric-technical use isoProject(x,y,z,scale,origin), isoBox(g,x,y,z,w,d,h,scale,colors),
        # and isoLine(g,a,b,color,width); keep all components on the same projected axes.
        # For layered-paper use paperPolygon(g,points,opts), paperEllipse(g,x,y,rx,ry,opts),
        # paperLayer(g,draw,opts), and paperParallax(g,offset,layers); separate depth planes and
        # keep light direction/shadow offsets consistent. These are deterministic Canvas 2D helpers.
        # Use restrained texture details rather than full-canvas particle loops. Create reusable helpers for every recurring
        # character, prop and environment in the visual bible. Character functions must preserve
        # silhouette, proportions, face, clothing, colours and distinctive marks across all shots.
        # Prefer short named functions such as drawExplorer(g,x,y,s,pose,expression). Implement only helpers needed by this visual bible. Avoid duplicate helpers, verbose comments and decorative details that do not support the scenes. Keep code deterministic and compact.
        # Do not use external assets. Do not redefine ShortcliprStyles.
        # Visual bible:
        # {json.dumps(visual_bible, ensure_ascii=False)}
        # """.strip()
        # === END LEGACY SHARED DRAWING LIBRARY PROMPT ===

        shared_prompt = f"""
ROLE
You are ShortClipr's senior 2D character designer and reusable illustration-systems
artist. Build the shared visual asset library for this film. This is production artwork,
not a collection of generic icons.

DESIGN TARGET
Create a small, coherent visual world that follows the binding art direction below.
Every recurring character, prop and environment must be recognizable at a glance and
remain visually identical across shots. Distinguish silhouette, proportions, materials,
edge treatment, palette and signature details. Design for the actual logical canvas.

IMPLEMENTATION CONTRACT
- Return complete raw JavaScript source: ordinary named function declarations and
  constants only. No JSON wrapper, Markdown, prose, imports or exports.
- Implement only reusable entities declared in the visual bible. Do not invent new
  characters, props, costumes, logos or decorative motifs.
- Every reusable drawing helper must be an ordinary function declaration named
  drawSomething and accept Canvas context g as its first parameter. Prefer signatures
  such as drawExplorer(g, x, y, scale, pose, expression).
- Use a stable local coordinate system for every helper. Origin is the subject's
  ground/contact point unless the entity is naturally centered. Scale 1 means the
  proportions described in the visual bible. Make helpers easy to position and scale.
- Preserve identity-defining character features exactly: silhouette, face, clothing,
  palette, proportions and distinctive marks. Poses may articulate limbs, never identity.
- Props need stable geometry and material cues. Separate moving components where
  the visual bible defines them; do not collapse a mechanism into one icon.
- Environments must supply reusable elements for foreground, midground and background
  staging. Do not create one monolithic backdrop that prevents camera changes.
- Use the documented Canvas 2D and ShortcliprStyles toolkit only. Never assume an
  undocumented helper exists. Do not redefine ShortcliprStyles.
- Save/restore context state around transforms, clipping and compositing. Helpers must
  be deterministic and side-effect free.
- No browser or Node globals, DOM, network, filesystem, timers, imports, exports, eval,
  Function, Date, performance, random values, WebGL, Three.js or 3D.
- Prioritize clear silhouettes, readable proportions and intentional negative space.
  Texture must remain restrained and visible at final output resolution.
- Use consistent material rendering, line weight, light direction and shadow logic.
  Do not substitute labels or glyphs for the actual subject.

BINDING ART DIRECTION:
{art_direction_instructions}

VISUAL BIBLE:
{json.dumps(visual_bible, ensure_ascii=False)}

Return the complete shared JavaScript drawing library now.""".strip()
        shared_js = await self._validated_fragment(
            "You are a senior Canvas 2D JavaScript systems programmer. Return only executable JavaScript source.",
            shared_prompt + "\n\nReturn only the complete JavaScript library source.",
            min(self.max_output_tokens, 16000), "shared_js", "Shared drawing library",
            MAX_SHARED_SOURCE,
        )

        shared_helper_names = sorted(set(re.findall(
            r"\bfunction\s+(draw[A-Z][A-Za-z0-9_]*)\s*\(", shared_js
        )))
        semaphore = asyncio.Semaphore(self.max_parallel_shots)

        async def compile_one(scene: dict[str, Any]) -> dict[str, Any]:
            start_s = scene["start_frame"] / 30
            end_s = scene["end_frame"] / 30
            shot_visual_context = self._shot_visual_context(visual_bible, scene)
        # === LEGACY SHOT GENERATION PROMPT (rollback reference; inactive) ===
        # shot_prompt = f"""
        # You are ShortClipr's 2D animation shot director and Canvas artist.
        # Generate only the drawing body for one shot. Return JSON only:
        # {{"draw_body":"JavaScript statements"}}.
        # The body is inserted inside:
        # function drawShot_{scene["index"]}(g, t, env, absoluteTime) {{ ... }}
        # Here t is local shot time starting at zero; absoluteTime is film time in seconds.
        # The compiler injects validated local constants `mechanismActions` and `mechanisms` before the drawing body.
        # Use these runtime arrays directly; never invent or reconstruct mechanism data.
        # VERIFIED SHARED DRAW HELPERS (exact names): {json.dumps(shared_helper_names)}
        # You may call only these shared helpers. If this shot needs another reusable drawing
        # function, define that function inside this draw_body before calling it. Never invent
        # a helper call and assume its implementation exists. Every custom drawX() call must
        # either be in the verified shared list above or have its complete function definition
        # inside this draw_body. Reuse shared functions for recurring characters and props;
        # do not redraw their defining features.
        # Use only CanvasRenderingContext2D methods on g, local variables, standard Math and
        # the shared helper functions. Redraw the full shot deterministically from t. No state
        # accumulation, random numbers, DOM/browser globals, imports, exports, network, file access,
        # Node APIs, timers, eval, Function, Date, performance, WebGL, Three.js or 3D.
        # Keep all drawing within the logical canvas {logical[0]}x{logical[1]}.
        # Honor the storyboard visual_objective, composition, shot_scale, camera_position, ordered depth_layers, focal_entity, visual_change and continuity_note. Build a readable foreground/midground/background rather than a flat repeated grid. Make the focal subject materially and spatially specific; use scale references and environment geometry. Iterate with `for (const action of mechanismActions)`. For each action, find `const mechanism = mechanisms.find(item => item.id === action.mechanism_id)`. The backend has already validated that the mechanism and action pattern exist. If the mechanism is missing defensively skip it; if it has no kinematics, depict the named action qualitatively without claiming deterministic engineering motion. Only calculate normalized local progress when a kinematics array exists; use this shot's local duration ({end_s-start_s:.3f} seconds):
        # const rawProgress = Ease.clamp(Ease.seg(t, 0, {end_s-start_s:.3f}));
        # const easing = action.easing ?? "in_out";
        # const easedProgress = easing === "linear" ? rawProgress : easing === "ease_in" ? rawProgress * rawProgress * rawProgress : easing === "ease_out" ? 1 - Math.pow(1 - rawProgress, 3) : Ease.inOut(rawProgress);
        # const actionProgress = (action.start_progress ?? 0) + ((action.end_progress ?? 1) - (action.start_progress ?? 0)) * easedProgress;
        # Iterate with `for (const spec of mechanism.kinematics)`. For each spec, run `const pose = ShortcliprStyles.mechanismPose(spec, actionProgress)` and apply that pose to the component identified by `pose.part`. For pivot results, rotate pose.part around pose.anchor by pose.angle_rad. For translation/slider results, place pose.part origin at pose.position. For gear results, rotate pose.driver_part around pose.driver_anchor by pose.driver_angle_rad and pose.part around pose.anchor by pose.angle_rad; preserve the declared pitch-radius ratio and external/internal mesh direction. For pulley results, rotate pose.pulley_part around pose.anchor by pose.pulley_angle_rad and place pose.part at the returned absolute pose.position. For cable results, draw pose.part as a continuous polyline through pose.points in order. For actuator results, draw the cylinder and rod along pose.base-to-pose.tip using pose.length and pose.angle_rad. Apply the same actionProgress to all kinematic parts in this action. Do not invent geometry or constraints. When kinematics is absent, use qualitative motion only and do not present it as engineering-solved.
        # Make one clear animated action with simple easing and follow-through. Use only the composition layers needed for this shot. Keep code concise: aim for at most 900 output tokens; no comments, repeated character drawings or unnecessary decorative loops. Reuse shared helpers for all recurring entities. Do not render narration or subtitles.
        # STYLE: {style_id}
        # BINDING ART DIRECTION:
        # {art_direction_instructions}
        # STYLE TOOLKIT REQUIREMENTS:
        # - cinematic-editorial: construct foreground/midground/background layers, bold silhouette masses and one clear focal-light treatment.
        # - isometric-technical: use the shared isoProject/isoBox projection helpers consistently for all related components; show component separation and mechanical relationships.
        # - layered-paper: use separate paperPolygon/paperEllipse/paperLayer shapes with visible overlap and consistent cast shadows; add parallax only when it clarifies depth.
        # SHOT VISUAL REFERENCES:
        # {json.dumps(shot_visual_context, ensure_ascii=False, separators=(",", ":"))}
        # DETERMINISTIC KINEMATICS: numeric specs are authoritative. Evaluate the same normalized progress for every connected part and reuse the returned transform; do not independently animate connected components.
        # SHOT:
        # {json.dumps(scene, ensure_ascii=False)}
        # SHOT WINDOW: {start_s:.3f}s to {end_s:.3f}s; local duration {end_s-start_s:.3f}s.\nAvoid repeating the previous shot composition unless the storyboard explicitly calls for a sustained view.
        # """.strip()
        # === END LEGACY SHOT GENERATION PROMPT ===

            shot_prompt = f"""
ROLE
You are ShortClipr's 2D film director, layout artist and senior Canvas animator.
Create the finished drawing program for this shot in an already designed film.
The storyboard and visual bible are authoritative.

OUTPUT CONTRACT
Return only complete raw JavaScript statements for drawShot_{scene["index"]}.
No JSON wrapper, Markdown, prose, imports, exports or code fences. The body is inserted
inside function drawShot_{scene["index"]}(g, t, env, absoluteTime).

RUNTIME CONTRACT
- t is local shot time beginning at zero; absoluteTime is film time in seconds.
- The compiler injects validated mechanismActions and mechanisms constants.
- Use CanvasRenderingContext2D methods on g, local variables, standard Math, verified
  shared draw helpers, and documented ShortcliprStyles and Ease APIs only.
- Redraw the entire frame deterministically from t. No accumulated state or randomness.
- Use g.save()/g.restore() around transforms and restore all context state you change.
- Keep all marks within the logical canvas {logical[0]}x{logical[1]}.
- No external assets, browser/Node globals, DOM, network, filesystem, timers, eval,
  Function, Date, performance, WebGL, Three.js or 3D.
- Do not render narration, subtitles or paragraphs. Short labels are permitted only
  when they materially clarify a real object or relationship.

SHOT DIRECTING
- The visual_objective is the single idea the viewer must understand from this shot.
  Make that idea legible without narration.
- Stage an initial state, one dominant visible action and a resolved final state.
  A static diagram with decorative movement is not an animated shot.
- Make the focal_entity large and clear. Use surrounding objects, people or architecture
  as scale references when useful.
- Follow the requested composition, shot_scale, camera_position and ordered depth_layers.
  Use actual spatial placement, overlap, occlusion, negative space and value contrast;
  do not draw generic horizontal bands just to claim depth.
- Every selected depth layer must contain recognizable scene content and contribute
  to the story. Avoid clutter and objects that have no narrative purpose.
- Maintain a consistent projection. Isometric components share one set of axes.
- Apply the binding style to shapes, materials, lighting and line language, not just
  the background color.
- Avoid generic grids, repeated circles, floating icons, unexplained particles,
  decorative geometry and repeated centered compositions.
- This shot must add a new visual fact, reveal, viewpoint, scale or state unless the
  storyboard explicitly calls for a sustained composition.

SHARED DRAWING HELPERS
Verified shared helper names: {json.dumps(shared_helper_names)}
Call only these shared helpers. A custom drawX function must be fully defined in this
body before use. Never invent a helper. Reuse shared helpers for recurring characters
and props; do not redraw identity-defining features.

MECHANISM RENDERING
The validated mechanismActions and mechanisms arrays are authoritative. Never invent
components, dimensions, joints, forces, physical laws or kinematics.
For each action, locate the declared mechanism by mechanism_id. If it is missing,
skip it. If no numeric kinematics exist, depict only the qualitative action described
by its declared pattern; do not imply engineering simulation.
When kinematics exist, compute normalized action progress once from this shot's local
duration ({end_s-start_s:.3f}), action.start_progress, action.end_progress and easing.
Use that identical progress for every connected component. For each kinematic spec,
call ShortcliprStyles.mechanismPose(spec, actionProgress) once and use its returned
pose values; do not independently animate followers.
- pivot: rotate the declared part around pose.anchor by pose.angle_rad.
- translation/slider: translate the part's local origin to pose.position.
- gear: rotate driver_part around driver_anchor and the driven part around anchor
  using returned angles; preserve mesh direction and pitch-radius ratio.
- pulley: rotate pulley_part around its anchor and place the attached part at the
  returned absolute pose.position.
- cable: draw one continuous path through pose.points in order.
- actuator: draw cylinder and rod along the returned base-to-tip axis.
Give every component recognizable geometry based on its referenced prop design.
Keep connected parts aligned at joints and draw each component only once per frame.

MOTION AND VISUAL FINISH
- Motion needs anticipation, a readable primary movement and restrained follow-through.
- Make motion smooth, deterministic and large enough to read at final resolution.
- Do not animate every object. Secondary motion must support the focal action.
- Use camera movement only when motivated; avoid contradictory world and subject motion.
- Prefer a few well-designed objects over many generic low-detail shapes.
- Do not omit required subjects, spatial relationships or visible action to save tokens.

STYLE: {style_id}

BINDING ART DIRECTION:
{art_direction_instructions}

STYLE TOOLKIT REQUIREMENTS:
- cinematic-editorial: layered depth, bold silhouette masses and one controlled focal light.
- isometric-technical: consistent iso projection, separated components and legible joints.
- layered-paper: overlapping paper shapes, consistent cast shadows and restrained parallax.

SHOT VISUAL REFERENCES:
{json.dumps(shot_visual_context, ensure_ascii=False, separators=(",", ":"))}

STORYBOARD SHOT:
{json.dumps(scene, ensure_ascii=False)}

Return the complete JavaScript drawing body for this shot.""".strip()
            async with semaphore:
                body = await self._validated_fragment(
                    "You are a senior Canvas 2D animation programmer. Return only executable JavaScript source.",
                    shot_prompt + "\n\nWrite the complete draw_body now.",
                    min(self.max_output_tokens, 12000), "draw_body",
                    f"Shot {scene['index'] + 1}", MAX_SHOT_SOURCE,
                )
            return {
                "index": scene["index"],
                "start_frame": scene["start_frame"],
                "end_frame": scene["end_frame"],
                "name": str(scene.get("purpose", f"Shot {scene['index'] + 1}"))[:80],
                "draw_body": body,
                "mechanism_actions": scene.get("mechanism_actions", []),
                "mechanisms": shot_visual_context.get("mechanisms", []),
                "transition_out": str(scene.get("transition_out", "cut")).lower(),
            }

        compiled = await _gather_cancel_on_error(*(compile_one(scene) for scene in scenes))

        # A model may still reference a helper it forgot to define. Generate those
        # implementations explicitly, validate their declarations, and only then
        # assemble the film. Keep this bounded to avoid recursive code-generation loops.
        for helper_pass in range(2):
            missing_helpers = find_unresolved_draw_helpers(
                shared_js,
                [shot["draw_body"] for shot in compiled],
            )
            if not missing_helpers:
                break
        # === LEGACY ON-DEMAND DRAWING HELPERS PROMPT (rollback reference; inactive) ===
        # helper_prompt = f"""
        # You are ShortClipr's reusable Canvas 2D drawing-function engineer.
        # Implement every missing helper listed below as ordinary named JavaScript function
        # declarations. Return JSON only: {{"helpers_js":"JavaScript source"}}.
        # MISSING HELPERS: {json.dumps(missing_helpers)}
        # STYLE: {style_id}
        # BINDING ART DIRECTION: {art_direction_instructions}
        # VISUAL BIBLE: {json.dumps(visual_bible, ensure_ascii=False)}
        # SHOT CONTEXT: {json.dumps([
        #     {"index": shot["index"], "name": shot["name"], "body": shot["draw_body"]}
        #     for shot in compiled
        #     if any(name in shot["draw_body"] for name in missing_helpers)
        # ], ensure_ascii=False)}
        # EXISTING SHARED HELPERS: {json.dumps(shared_helper_names)}
        # Rules:
        # - Define every requested helper with exactly its requested name.
        # - Use Canvas 2D only; function signature must start with (g, ...).
        # - Do not call any helper unless it is listed as existing or defined in this same fragment.
        # - Do not redefine existing helpers.
        # - No browser globals, DOM, imports, exports, network, filesystem, Node APIs, timers,
        #   eval, Function, Date, performance, random numbers, WebGL or 3D.
        # - Keep implementations deterministic, self-contained and visually consistent with
        #   the selected style. Return compact code, no markdown fences.
        # """.strip()
        # === END LEGACY ON-DEMAND DRAWING HELPERS PROMPT ===

            helper_prompt = f"""
ROLE
You are ShortClipr's reusable Canvas 2D drawing-function engineer. Implement missing
functions that shot programs already call. They must look like part of the same film.

OUTPUT
Return only ordinary named JavaScript function declarations. No JSON, Markdown,
prose, imports, exports or code fences. Each function name must be defined exactly
once and accept Canvas context g as its first parameter.

MISSING HELPERS:
{json.dumps(missing_helpers)}

BINDING ART DIRECTION:
{art_direction_instructions}

VISUAL BIBLE:
{json.dumps(visual_bible, ensure_ascii=False)}

SHOT CONTEXT:
{json.dumps([
    {"index": shot["index"], "name": shot["name"], "body": shot["draw_body"]}
    for shot in compiled
], ensure_ascii=False)}

RULES
- Infer each helper's intended subject from its call sites and visual bible.
- Match existing shared helper proportions, palette, materials, lighting and local
  coordinate conventions. Do not introduce a different illustration style.
- Every helper must draw the actual named subject, not a placeholder, label or icon.
- Use a stable local origin and scale convention consistent with related helpers.
- Define all requested helpers completely. Do not leave TODOs or call undefined helpers.
- Use Canvas 2D, standard Math and documented ShortcliprStyles APIs only.
- Save/restore context state; remain deterministic and side-effect free.
- No DOM/browser globals, imports, exports, network, filesystem, Node APIs, timers,
  eval, Function, Date, performance, random numbers, WebGL or 3D.
- Do not redefine existing helpers or create duplicate names.
- Keep detail purposeful and readable at final video resolution.

Implement every missing helper now.""".strip()
            generated_helpers = await self._code_completion(
                "You are a senior Canvas 2D JavaScript systems programmer. Return only executable JavaScript source.",
                helper_prompt,
                min(self.max_output_tokens, 10000),
                label=f"On-demand drawing helpers pass {helper_pass + 1}",
            )
            generated_helpers = validate_generated_fragment(
                generated_helpers,
                "On-demand drawing helpers",
                MAX_SHARED_SOURCE,
            )
            validate_draw_helper_definitions(generated_helpers, missing_helpers)
            shared_js += "\n" + generated_helpers
            if len(shared_js) > MAX_SHARED_SOURCE:
                raise ValueError("Shared drawing library exceeds the maximum source size")
            shared_helper_names = sorted(set(shared_helper_names) | set(missing_helpers))

        remaining_helpers = find_unresolved_draw_helpers(
            shared_js,
            [shot["draw_body"] for shot in compiled],
        )
        if remaining_helpers:
            raise ValueError(
                "Unresolved generated drawing helpers after repair: "
                + ", ".join(remaining_helpers)
            )

        source = self._assemble_film(shared_js, compiled, duration, logical, style_id)
        if len(source) > MAX_FILM_SOURCE:
            raise ValueError("Assembled animation program exceeds the maximum source size")
        self.validate_source(source, duration, logical)
        return {
            "scene_js": source,
            "style": style_id,
            "model": self.model,
            "shot_count": len(compiled),
            "shared_source_chars": len(shared_js),
            "shot_source_chars": sum(len(x["draw_body"]) for x in compiled),
            "motion_diagnostics": motion_diagnostics,
            "visual_qa_context": self._visual_qa_context(visual_bible, scenes),
            # Keep the exact compiled shot bodies and shared drawing library so a
            # later repair can replace one shot without regenerating other shots.
            "repair_bundle": {
                "schema_version": 1,
                "duration": duration,
                "logical": logical,
                "style_id": style_id,
                "art_direction": art_direction,
                "art_direction_instructions": art_direction_instructions,
                "visual_bible": visual_bible,
                "scenes": scenes,
                "shared_js": shared_js,
                "shots": compiled,
            },
            "shot_manifest": [
                {
                    "index": shot["index"],
                    "start_frame": shot["start_frame"],
                    "end_frame": shot["end_frame"],
                    "name": shot["name"],
                    "mechanism_ids": sorted({
                        action["mechanism_id"]
                        for action in shot.get("mechanism_actions", [])
                    }),
                    "transition_out": shot.get("transition_out", "cut"),
                }
                for shot in compiled
            ],
        }


    async def repair_shot(
        self,
        repair_bundle: dict[str, Any],
        shot_index: int,
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Regenerate exactly one shot body while keeping every other source byte-stable."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        if not isinstance(repair_bundle, dict) or repair_bundle.get("schema_version") != 1:
            raise ValueError("Unsupported or missing shot repair bundle")
        shots = repair_bundle.get("shots")
        scenes = repair_bundle.get("scenes")
        shared_js = repair_bundle.get("shared_js")
        if not isinstance(shots, list) or not isinstance(scenes, list) or not isinstance(shared_js, str):
            raise ValueError("Shot repair bundle is incomplete")
        if (len(shots) != len(scenes) or not 3 <= len(shots) <= 12
                or not all(isinstance(item, dict) for item in shots + scenes)):
            raise ValueError("Shot repair bundle has invalid shot structure")
        duration = repair_bundle.get("duration")
        logical = repair_bundle.get("logical")
        style_id = repair_bundle.get("style_id")
        if (isinstance(duration, bool) or not isinstance(duration, int) or duration < 1
                or not isinstance(logical, list) or len(logical) != 2
                or not all(isinstance(value, int) and not isinstance(value, bool) and value > 0 for value in logical)
                or not isinstance(style_id, str) or not style_id):
            raise ValueError("Shot repair bundle has invalid render metadata")
        if isinstance(shot_index, bool) or not isinstance(shot_index, int):
            raise ValueError("Shot index must be an integer")
        shot_positions = [i for i, shot in enumerate(shots) if shot.get("index") == shot_index]
        scene_positions = [i for i, scene in enumerate(scenes) if scene.get("index") == shot_index]
        if len(shot_positions) != 1 or len(scene_positions) != 1 or shot_positions[0] != scene_positions[0]:
            raise ValueError("Target shot is not uniquely present in repair bundle")
        if not isinstance(findings, list) or not findings:
            raise ValueError("At least one visual QA finding is required")
        safe_findings = []
        for item in findings[:8]:
            if (not isinstance(item, dict)
                    or isinstance(item.get("shot_index"), bool)
                    or item.get("shot_index") != shot_index):
                continue
            issue = item.get("issue")
            recommendation = item.get("recommendation")
            if not isinstance(issue, str) or not issue.strip() or not isinstance(recommendation, str) or not recommendation.strip():
                continue
            safe_findings.append({
                "category": str(item.get("category", "other"))[:60],
                "severity": str(item.get("severity", "medium"))[:20],
                "issue": issue[:500],
                "recommendation": recommendation[:500],
                "evidence_sample_indices": [
                    value for value in (
                        item.get("evidence_sample_indices")
                        if isinstance(item.get("evidence_sample_indices"), list) else []
                    )[:3]
                    if isinstance(value, int) and not isinstance(value, bool)
                ],
            })
        if not safe_findings:
            raise ValueError("No actionable findings belong to the requested shot")

        position = shot_positions[0]
        original_shot = shots[position]
        scene = scenes[position]
        original_body = original_shot.get("draw_body")
        if not isinstance(original_body, str) or not original_body:
            raise ValueError("Target shot has no original drawing body")
        visual_bible = repair_bundle.get("visual_bible", {})
        shot_visual_context = self._shot_visual_context(visual_bible, scene)
        shared_helper_names = sorted(set(re.findall(
            r"\bfunction\s+(draw[A-Z][A-Za-z0-9_]*)\s*\(", shared_js
        )))
        # === LEGACY VISUAL SHOT REPAIR PROMPT (rollback reference; inactive) ===
        #         prompt = f"""
        # You are ShortClipr's senior 2D animation repair artist. Repair ONLY shot {shot_index}.
        # Return JSON only: {{"draw_body":"complete replacement JavaScript drawing body"}}.
        # 
        # The replacement body is inserted into the existing drawShot_{shot_index}(g,t,env,absoluteTime)
        # function. The compiler will preserve the existing validated mechanismActions and
        # mechanisms constants. Do not modify them, other shots, shot timing, transitions,
        # the shared drawing library, or the selected visual style.
        # 
        # VISUAL QA FINDINGS TO FIX:
        # {json.dumps(safe_findings, ensure_ascii=False)}
        # 
        # ORIGINAL SHOT DIRECTION:
        # {json.dumps(scene, ensure_ascii=False)}
        # 
        # VISUAL REFERENCES:
        # {json.dumps(shot_visual_context, ensure_ascii=False)}
        # 
        # BINDING ART DIRECTION:
        # {repair_bundle.get("art_direction_instructions", "")}
        # 
        # EXISTING SHARED DRAW HELPERS (only these may be called):
        # {json.dumps(shared_helper_names)}
        # 
        # ORIGINAL SHOT BODY:
        # {original_body}
        # 
        # Rules:
        # - Fix the listed visible problems, not unrelated aspects of the shot.
        # - Preserve all named recurring characters, props, environment identity and relative scale.
        # - Preserve the shot's purpose, focal entity, visual objective, composition intent,
        #   visual change, continuity note and transition compatibility.
        # - Use existing shared helpers only; do not add helpers or call undefined drawX functions.
        # - Keep all drawing inside the original logical canvas.
        # - Keep deterministic Canvas 2D only. No DOM, browser globals, network, filesystem,
        #   imports, exports, Node APIs, timers, eval, Function, random numbers, WebGL or 3D.
        # - Keep mechanism actions and kinematics coherent. Use the supplied validated mechanism
        #   arrays as-is; do not invent physics or claim engineering accuracy for qualitative motion.
        # - Return the full replacement draw_body, not a diff or patch.
        # """.strip()
        # === END LEGACY VISUAL SHOT REPAIR PROMPT ===

        prompt = f"""
ROLE
You are ShortClipr's senior 2D animation repair artist and visual continuity supervisor.
Repair only shot {shot_index}. This is a targeted correction, not a redesign.

OUTPUT
Return only the complete replacement JavaScript drawing body. No JSON wrapper,
Markdown, explanation, diff, imports, exports or code fences.

IMMUTABLE CONTEXT
The body is inserted into drawShot_{shot_index}(g,t,env,absoluteTime). The compiler
preserves validated mechanismActions and mechanisms constants. Do not modify other
shots, timing, transitions, shared helpers, art direction, style or mechanism data.

VISUAL QA FINDINGS:
{json.dumps(safe_findings, ensure_ascii=False)}

ORIGINAL STORYBOARD:
{json.dumps(scene, ensure_ascii=False)}

VISUAL BIBLE REFERENCES:
{json.dumps(shot_visual_context, ensure_ascii=False)}

BINDING ART DIRECTION:
{repair_bundle.get("art_direction_instructions", "")}

AVAILABLE SHARED HELPERS:
{json.dumps(shared_helper_names)}

ORIGINAL SHOT BODY:
{original_body}

REPAIR METHOD
1. Identify the visible defect described by each finding and use cited sample indices
   as evidence. Do not infer motion or hidden facts from still frames.
2. Fix only high-confidence, actionable defects. Do not invent problems.
3. Preserve successful composition, identity, environment, focal objective, visual
   change, mechanism geometry and existing working animation.
4. Make the smallest coherent changes. Prefer better scale, placement, silhouette,
   depth, contrast or timing over unrelated detail.
5. If findings conflict, prioritize severe and high-confidence issues while retaining
   the storyboard's intent.
6. Use only available shared helpers or complete local functions. Never call undefined
   helpers or add external assets.
7. Keep deterministic Canvas 2D only. Save/restore context state and remain inside the
   original logical canvas.
8. Still-frame QA cannot prove motion correctness or physical accuracy; do not claim
   to fix either based on unsupported evidence.
9. Return the entire replacement drawing body, not a patch.""".strip()
        replacement_body = await self._validated_fragment(
            "You are a senior Canvas 2D animation programmer. Return only executable JavaScript source.",
            prompt,
            min(self.max_output_tokens, 10000),
            "draw_body",
            f"Targeted repair for shot {shot_index + 1}",
            MAX_SHOT_SOURCE,
        )
        updated_bundle = copy.deepcopy(repair_bundle)
        updated_bundle["shots"][position]["draw_body"] = replacement_body
        remaining_helpers = find_unresolved_draw_helpers(
            shared_js,
            [shot["draw_body"] for shot in updated_bundle["shots"]],
        )
        if remaining_helpers:
            raise ValueError(
                "Targeted repair introduced unresolved drawing helpers: "
                + ", ".join(remaining_helpers)
            )
        source = self._assemble_film(
            shared_js,
            updated_bundle["shots"],
            duration,
            logical,
            style_id,
        )
        if len(source) > MAX_FILM_SOURCE:
            raise ValueError("Repaired animation program exceeds the maximum source size")
        self.validate_source(source, duration, logical)
        return {
            "scene_js": source,
            "repair_bundle": updated_bundle,
            "repaired_shot_index": shot_index,
            "original_body_chars": len(original_body),
            "replacement_body_chars": len(replacement_body),
            "unchanged_shot_indices": [
                shot["index"] for shot in shots if shot["index"] != shot_index
            ],
        }

    @staticmethod
    def _assemble_film(shared_js: str, shots: list[dict[str, Any]], duration: int,
                       logical: list[int], style_id: str) -> str:
        functions, ranges, dispatch = [], [], []
        for shot in shots:
            index = shot["index"]
            start, end = shot["start_frame"] / 30, shot["end_frame"] / 30
            mechanism_actions_js = json.dumps(shot.get("mechanism_actions", []), ensure_ascii=False, separators=(",", ":"))
            mechanisms_js = json.dumps(shot.get("mechanisms", []), ensure_ascii=False, separators=(",", ":"))
            functions.append(
                f"function drawShot_{index}(g,t,env,absoluteTime) {{\n"
                f"const mechanismActions = {mechanism_actions_js};\n"
                f"const mechanisms = {mechanisms_js};\n"
                f"{shot['draw_body']}\n}}"
            )
            name = re.sub(r"[^a-zA-Z0-9 _-]", "", shot["name"]).replace("'", "")[:60]
            ranges.append(f"[{start:.6f},{end:.6f},'{name}']")
            transition = shot.get("transition_out", "cut")
            if transition not in {"cut", "wipe", "iris", "paper", "fade"}:
                transition = "cut"
            block = f"if (t >= {start:.6f} && t < {end:.6f}) {{ const local=t-{start:.6f}; drawShot_{index}(g,local,env,t); "
            if index < len(shots)-1 and transition != "cut":
                transition_start = max(0.0, end-start-0.42)
                next_index = shots[index+1]["index"]
                block += (
                    f"if(local>{transition_start:.6f}){{const p=Ease.seg(local,{transition_start:.6f},{end-start:.6f});"
                    f"const next=Motion.layer(env,'transition-{index}',(ng)=>drawShot_{next_index}(ng,0,env,{end:.6f}));"
                    f"ShortcliprStyles.transition(g,env,next,p,'{transition}');}}"
                )
            dispatch.append(block + "return; }")
        function_source = "\n".join(functions)
        return (
            "// ShortClipr shot-based Drawn-by-Code film. Generated code is untrusted input.\n"
            f"// Visual style: {style_id}\n{shared_js}\n{function_source}\n"
            "Motion.scene({\n  uses: ['styles/shortclipr.js'],\n  fps: 30,\n"
            f"  duration: {duration},\n  logical: {json.dumps(logical)},\n"
            f"  shots: [{','.join(ranges)}],\n"
            f"  draw(g,t,env) {{ {' '.join(dispatch)} }}\n"
            "});\n"
        )

    @staticmethod
    def validate_source(source: str, duration: int, logical: list[int]) -> None:
        if not 300 <= len(source) <= MAX_FILM_SOURCE:
            raise ValueError("Generated animation source length is outside allowed bounds")
        if len(re.findall(r"\bMotion\s*\.\s*scene\s*\(", source)) != 1:
            raise ValueError("Source must contain exactly one Motion.scene declaration")
        if not re.search(r"\bfps\s*:\s*30\b", source):
            raise ValueError("Animation source must declare fps: 30")
        if not re.search(rf"\bduration\s*:\s*{duration}(?:\.0+)?\b", source):
            raise ValueError(f"Animation source must declare duration: {duration}")
        compact = re.sub(r"\s+", "", source)
        if f"logical:{json.dumps(logical, separators=(',', ':'))}" not in compact:
            raise ValueError("Animation canvas does not match project aspect ratio")
        validate_generated_fragment(source, "Assembled animation", MAX_FILM_SOURCE)
