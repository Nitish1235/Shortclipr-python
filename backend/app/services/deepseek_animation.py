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
# shared_# === LEGACY VISUAL SHOT REPAIR PROMPT (rollback reference; inactive) ===
# prompt = f"""
ROLE
You are ShortClipr's senior 2D animation repair artist and visual continuity supervisor.
Repair only shot {shot_index}; this is a targeted correction, not a redesign of the film.

OUTPUT
Return only the complete replacement JavaScript draw body. No JSON wrapper, Markdown,
explanation, diff, imports, exports or code fences.

IMMUTABLE CONTEXT
The replacement is inserted into drawShot_{shot_index}(g,t,env,absoluteTime).
The compiler preserves the validated mechanismActions and mechanisms constants.
Do not change other shots, timing, transitions, the shared library, the art direction,
the selected visual style, character identity or declared mechanism data.

VISUAL QA FINDINGS
{json.dumps(safe_findings, ensure_ascii=False)}

ORIGINAL STORYBOARD DIRECTION
{json.dumps(scene, ensure_ascii=False)}

VISUAL BIBLE REFERENCES
{json.dumps(shot_visual_context, ensure_ascii=False)}

BINDING ART DIRECTION
{repair_bundle.get("art_direction_instructions", "")}

AVAILABLE SHARED HELPERS
{json.dumps(shared_helper_names)}

ORIGINAL SHOT BODY
{original_body}

REPAIR METHOD
1. Identify the specific visible defect in each finding and the evidence samples that
   support it. Do not fix issues that the contact sheet cannot establish.
2. Make the smallest set of changes that resolves the high-confidence findings.
3. Preserve successful composition, character design, environment, focal objective,
   visual change, mechanism geometry and existing working animation.
4. Improve clarity through scale, placement, silhouette, depth, contrast or timing,
   not by adding unrelated decoration or text.
5. If findings conflict, prioritize severe, high-confidence defects and preserve the
   original storyboard intent.
6. Use only available shared helpers or fully defined local functions. Never call an
   undefined helper or invent a new external asset.
7. Keep deterministic Canvas 2D only. Save/restore context state and keep all drawing
   within the original logical canvas.
8. Do not claim to fix motion or physical correctness based only on still-frame QA.
9. Return the entire replacement body, not a patch.""".strip()))
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
ROLE
You are ShortClipr's 2D film director, layout artist and senior Canvas animator.
Create the finished drawing program for this one shot in an already designed film.
The storyboard and visual bible are authoritative. Make the frame visually specific,
readable and cinematic within the selected illustration style.

OUTPUT
Return only complete raw JavaScript statements for the body of drawShot_{scene["index"]}.
No JSON wrapper, Markdown, prose, imports, exports or code fences. The body is inserted
inside function drawShot_{scene["index"]}(g, t, env, absoluteTime).

RUNTIME CONTRACT
- t is local shot time beginning at zero; absoluteTime is film time in seconds.
- The compiler injects validated mechanismActions and mechanisms constants.
- Use only CanvasRenderingContext2D methods on g, local variables, standard Math,
  verified shared draw helpers, and the documented ShortcliprStyles and Ease APIs.
- Redraw the complete frame deterministically from t. No accumulated state, random
  numbers, external assets, browser/Node globals, DOM, network, filesystem, timers,
  eval, Function, Date, performance, WebGL, Three.js or 3D.
- Keep every mark inside the logical canvas {logical[0]}x{logical[1]}.
- Use g.save()/g.restore() around every local transform and restore all changed context
  state. Do not let alpha, clipping, transforms, line width or compositing leak.
- Do not render narration, subtitles or paragraphs. Text is allowed only when it is
  a purposeful, short visual label that materially helps explain the subject.

SHOT DIRECTING
- First understand the single visual objective and focal entity. The viewer should
  understand the idea from the picture even with narration muted.
- Stage a clear initial state, one dominant readable action, and a resolved final state.
  The action must visibly progress over this shot's duration; do not create a static
  illustration with decorative movement.
- Make the focal entity large enough to read. Establish scale with surrounding objects,
  architecture, people or environmental references where useful.
- Follow the specified composition and camera position. Use real spatial placement,
  overlap, foreground framing, negative space and value contrast; do not merely draw
  three horizontal bands to satisfy depth-layer instructions.
- Use only the depth layers that help the story, but make each selected layer contain
  identifiable scene content. Place layers in the requested back-to-front order.
- Use perspective consistently with the selected style. Isometric subjects must share
  one projection system; do not mix flat front views with isometric components.
- Respect the art direction's materials, silhouette language, lighting and palette.
  The style must affect the actual shapes and rendering, not just background color.
- Avoid generic grids, repeated circles, floating icons, unexplained particles,
  excessive labels and decorative geometry that does not explain the subject.
- Do not reuse a previous shot's composition unless continuity explicitly requires it.
  This shot should add a new visual fact, reveal, scale, viewpoint or state.

SHARED DRAWING HELPERS
Verified shared helpers (exact names): {json.dumps(shared_helper_names)}
Call only these shared helpers. A custom drawX function must be completely declared
inside this body before use. Never invent a helper or assume it exists. Reuse shared
helpers for recurring characters and props; do not redraw identity-defining details.
If a recurring entity is visible, use its shared helper rather than approximating it
with a generic silhouette.

MECHANISM RENDERING
The validated arrays are authoritative: mechanismActions and mechanisms. Do not
invent components, dimensions, joints, forces, physical laws or kinematics.
For each action, find its declared mechanism by action.mechanism_id. If absent, skip it.
If mechanism.kinematics is absent, depict only the qualitative action described by the
declared pattern; never present it as a solved physical simulation.
When kinematics exists, compute one normalized progress value for the action using
this shot's local duration ({end_s-start_s:.3f}) and the supplied start_progress,
end_progress and easing. Use that exact progress for every connected component.
For each spec call ShortcliprStyles.mechanismPose(spec, actionProgress) exactly once.
Use the returned pose values; never calculate a separate transform for a follower.
- pivot: rotate the declared part around pose.anchor by pose.angle_rad.
- translation/slider: translate the part from its declared local origin to pose.position.
- gear: rotate driver_part around driver_anchor and the driven part around anchor using
  the returned angles; preserve the supplied mesh direction and pitch-radius ratio.
- pulley: rotate pulley_part around its anchor and position the attached part at the
  returned absolute pose.position.
- cable: draw one continuous path through pose.points in their supplied order.
- actuator: draw the cylinder and rod on the returned base-to-tip axis using pose.length
  and pose.angle_rad.
Give each declared component a recognizable shape based on its referenced prop design.
Keep connected parts aligned at their joints. Draw each part once per frame; do not
draw an independent duplicate for every kinematics specification.

VISUAL DETAIL AND MOTION
- Use a clear silhouette and strong value separation before adding surface detail.
- Include meaningful contact, overlap, attachment and occlusion so objects feel related.
- Motion should have anticipation, a readable main movement and restrained follow-through.
  Use smooth deterministic easing; no jitter or random oscillation.
- Keep motion amplitude appropriate to the shot and respect the supplied time window.
- Use camera movement only when requested or clearly motivated. Do not move the whole
  world and the subject independently in contradictory directions.
- Prefer fewer well-designed objects over many low-detail shapes.

STYLE
{style_id}

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

VERIFIED SHARED HELPERS:
{json.dumps(shared_helper_names)}

Return the complete draw body for this shot.""".strip())
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
ROLE
You are ShortClipr's reusable Canvas 2D drawing-function engineer. Other generated
shots called these names but the shared library does not yet define them. Implement
the missing functions as real visual assets, consistent with the existing film.

OUTPUT
Return only ordinary named JavaScript function declarations. No JSON, Markdown,
prose, imports, exports or code fences. Every requested function name must appear
exactly once and accept g as its first argument.

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
- Match the visual language, proportions, materials, palette and lighting of existing
  shared helpers and the supplied visual bible. Do not invent a different style.
- Infer the intended subject from the named call sites and visual bible. If intent is
  ambiguous, implement a restrained but recognizable form rather than a generic icon.
- Use a stable local origin and scale convention consistent with related helpers.
- Define each requested helper completely; do not leave TODOs, placeholders or calls
  to undefined drawX functions.
- Use only Canvas 2D, standard Math and explicitly documented ShortcliprStyles APIs.
  No DOM/browser globals, imports, exports, network, filesystem, Node APIs, timers,
  eval, Function, Date, performance, random numbers, WebGL or 3D.
- Keep drawing deterministic and self-contained. Save and restore context state.
- Do not redefine existing helpers or create duplicate helper names.
- Favor readable silhouettes and purposeful details over complexity for its own sake.

Implement every missing helper now.""".strip())
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
        prompt = f"""
You are ShortClipr's senior 2D animation repair artist. Repair ONLY shot {shot_index}.
Return only the complete replacement JavaScript drawing body. Do not wrap it in JSON or Markdown.

The replacement body is inserted into the existing drawShot_{shot_index}(g,t,env,absoluteTime)
function. The compiler will preserve the existing validated mechanismActions and
mechanisms constants. Do not modify them, other shots, shot timing, transitions,
the shared drawing library, or the selected visual style.

VISUAL QA FINDINGS TO FIX:
{json.dumps(safe_findings, ensure_ascii=False)}

ORIGINAL SHOT DIRECTION:
{json.dumps(scene, ensure_ascii=False)}

VISUAL REFERENCES:
{json.dumps(shot_visual_context, ensure_ascii=False)}

BINDING ART DIRECTION:
{repair_bundle.get("art_direction_instructions", "")}

EXISTING SHARED DRAW HELPERS (only these may be called):
{json.dumps(shared_helper_names)}

ORIGINAL SHOT BODY:
{original_body}

Rules:
- Fix the listed visible problems, not unrelated aspects of the shot.
- Preserve all named recurring characters, props, environment identity and relative scale.
- Preserve the shot's purpose, focal entity, visual objective, composition intent,
  visual change, continuity note and transition compatibility.
- Use existing shared helpers only; do not add helpers or call undefined drawX functions.
- Keep all drawing inside the original logical canvas.
- Keep deterministic Canvas 2D only. No DOM, browser globals, network, filesystem,
  imports, exports, Node APIs, timers, eval, Function, random numbers, WebGL or 3D.
- Keep mechanism actions and kinematics coherent. Use the supplied validated mechanism
  arrays as-is; do not invent physics or claim engineering accuracy for qualitative motion.
- Return only the full replacement JavaScript draw_body, not a diff, JSON wrapper, explanation, or Markdown.
""".strip()
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
