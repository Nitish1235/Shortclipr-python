"""Streamlined, self-healing 3-stage DeepSeek compiler for studio-grade Canvas 2D films."""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from ..core.config import Settings
from .animation_contracts import (
    ASPECT_LOGICAL,
    MAX_FILM_SOURCE,
    MAX_SHARED_SOURCE,
    MAX_SHOT_SOURCE,
    analyze_mechanism_motion,
    extract_shared_draw_helpers,
    extract_shared_function_signatures,
    find_unresolved_draw_helpers,
    find_unresolved_film_draw_helpers,
    replace_shared_draw_helpers,
    top_level_draw_helper_names,
    validate_draw_helper_definitions,
    validate_generated_fragment,
    validate_scene_plan,
    validate_visual_bible,
)
from .art_direction import build_art_direction, format_art_direction, validate_art_direction
from .shot_design_contracts import (
    build_shot_continuity_context,
    build_visual_continuity_contract,
)

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


_TOOLKIT_REFERENCE = """
AVAILABLE STUDIO RUNTIME API (pre-loaded globals — never redefine them):
1. ShortcliprStyles:
   - palette(styleId) -> { bg, bg2, ink, paper, primary, accent, secondary, shadow, highlight }
     (pre-configured with this film's custom visual_direction palette!)
   - backdrop(g, styleId, env, t, mood) -> paints multi-stop studio gradient + mood-aware ambient light pool + returns palette
   - shadedShape(g, (ctx) => { ctx.beginPath(); ... }, { fill, stroke, lineWidth, shadowColor, shadowBlur, shadowY, highlight, highlightWidth })
     (draws drop shadow + rich fill/gradient + directional rim highlight + optional crisp stroke)
   - glow(g, x, y, r, color, alpha) -> additive ('screen') radial volumetric glow
   - lightBeam(g, x0, y0, x1, y1, r0, r1, color, alpha) -> additive ('screen') volumetric light cone/shaft
   - bloomLayer(g, env, name, blurPx, alpha, (bg) => { ... }) -> renders glowing elements with offscreen additive bloom
   - parallaxLayers(g, env, { cx, cy, zoom, rotation }, [{ depth: 0.25, blur: 2, draw: (ctx)=>{...} }, { depth: 1.0, draw: ... }, { depth: 1.35, draw: ... }])
     (true multi-plane 2.5D parallax camera with depth-scaled movement & optional depth-of-field blur)
   - solveIK(x0, y0, tx, ty, L1, L2, bendDir=1) -> analytical 2-bone Law-of-Cosines IK solver returning { jx, jy, ex, ey, a1, a2 } for natural knees/elbows/limbs
   - squash(g, x, y, amount) -> volume-preserving squash & stretch transform around contact point (x, y)
   - spring(t, start, stiffness=180, damping=14) -> snappy damped harmonic 0->1 curve
   - stagger(t, index, step=0.09, start=0, duration=0.45, easeFn) -> staggered 0..1 entrance progress for item `index` (prevents simultaneous t=0 pop-ins)
   - anticipation(t, start=0, duration=0.55, pull=0.14) -> Disney wind-back (-pull) before springing to 1.0
   - posterize(t, fps=12) -> snaps time `t` to 12fps for tactile stop-motion / comic / paper feel while camera stays at 30fps
   - strokeReveal(g, [[x0,y0],[x1,y1],...], progress, { color, width, dashed, glow, arrow }) -> smoothly traces any path from 0 -> 1 (SVG stroke-dashoffset equivalent)
   - organicPath(g, [[x0,y0],...], seed, { roughness, closed, fill, stroke, lineWidth, shadow, highlight }) -> hand-crafted path with deterministic noise jitter
   - roundedCard(g, x, y, w, h, r, { fill, stroke, lineWidth, shadowBlur, highlight })
   - badge(g, x, y, text, { bg, color, border, fontSize, align }) -> crisp auto-sized pill label (use sparingly for short diagram callouts)
   - flowPath(g, [[x0,y0],[x1,y1],...], t, { color, width, progress, dashed, speed, glow, arrow, arrowSize }) -> animated connector/energy path
   - particles(g, seed, count, t, { x, y, w, h }, { mode: 'drift'|'rise'|'sparkle'|'stream', color, speed, minR, maxR, alpha })
   - cameraRig(g, env, { cx, cy, zoom, rotation, shake, t }) -> smooth 2D camera inside g.save()/g.restore()
   - editorialShape(g, points, { fill, depth, shadow, stroke, lineWidth }), editorialLight(g, x, y, r, color)
   - isoProject(x, y, z, scale, origin), isoBox(g, x, y, z, w, d, h, scale, { top, left, right, edge }), isoLine(g, a, b, color, width)
   - paperLayer(g, drawFn, { fill, edge, blur, offsetY }), paperPolygon(g, points, opts), paperEllipse(g, x, y, rx, ry, opts), paperParallax(g, offset, layers)
   - halftone(g, x, y, w, h, spacing, color), pixelSnap(v, size), mechanismPose(spec, progress)
2. Motion (from core.js):
   - Motion.rng(seed) -> deterministic PRNG function returning [0, 1) (NEVER use Math.random)
   - Motion.noise1(seed, x) -> smooth deterministic 1D noise in [-1, 1]
   - Motion.keys([[t0, v0], [t1, v1], ...], t, Ease.inOut) -> smooth keyframe interpolation (numbers or arrays)
   - Motion.sprite(key, { x, y, w, h }, env.k, (sg) => { ... }) -> cache expensive static art once
   - Motion.shake(g, amt, t) -> deterministic camera shake
3. Ease (from core.js):
   - Ease.clamp(x, a, b), Ease.seg(t, a, b), Ease.lerp(a, b, u), Ease.lerpPt(p, q, u)
   - Ease.inOut(u), Ease.out(u), Ease.in(u), Ease.back(u), Ease.elastic(u), Ease.pop(t, at, dur), Ease.bump(t, a, dur)
   (NEVER call bare mix() — always use Ease.lerp(a, b, u).)
""".strip()

_CRAFT_REFERENCE_SNIPPET = """
CREATIVE AUTONOMY — YOU DECIDE THE ANIMATION STYLE & MOTION LANGUAGE:
Do NOT make every video look the same. Choose the visual architecture, color palette,
lighting, framing, and animation physics that best serve THIS specific topic and `style_id`:
- Explainer / science / space / tech: crisp layered vector motion graphics, glowing energy
  paths, orbital/mechanical motion, spring entrances, clean cutaway diagrams.
- Story / fable / comedy / character: expressive multi-part character silhouettes, squash &
  stretch, articulated limbs/faces, layered parallax scenery, motivated camera cuts.
- Historical / documentary / mystery / horror: dramatic atmospheric lighting, volumetric
  beams, rich silhouettes, moody color grading, slow cinematic dolly/push-ins.
- Engineering / architecture / tactics / maps: isometric 3-axis projection (`isoBox`/`isoProject`),
  blueprint/schematic reveals, animated flow arrows (`flowPath`), exploded component views.
- Paper-craft / retro / comic / pixel-art: tactile overlapping cut-paper shadows (`paperPolygon`),
  bold comic ink contours & dynamic diagonals, halftone shading, or pixel-snapped sprites.

You are free to design custom palettes, custom sky/space/underwater/interior backgrounds,
and custom procedural effects. `ShortcliprStyles.*` helpers are optional power tools—use
them whenever they elevate the visuals, and write custom Canvas 2D shaders/gradients/shapes
whenever the scene calls for something bespoke. Never settle for flat stick figures or
thin unshaded pencil outlines.
""".strip()


class DeepSeekAnimationCompiler:
    """Compiles a Visual Bible + Storyboard into high-craft, self-healing Canvas 2D films."""

    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_ANIMATION_MODEL
        self.max_output_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS
        self.max_parallel_shots = max(1, min(4, settings.DEEPSEEK_MAX_PARALLEL_SHOTS))
        self.enable_thinking = getattr(settings, "DEEPSEEK_ENABLE_THINKING", False)
        self.shared_reasoning_effort = settings.DEEPSEEK_PLANNING_REASONING_EFFORT or "low"
        self.client = (
            AsyncOpenAI(
                api_key=settings.DEEPSEEK_API_KEY,
                base_url="https://api.deepseek.com",
                timeout=110.0,
                max_retries=0,
            )
            if settings.DEEPSEEK_API_KEY else None
        )
        self.node = os.getenv("NODE_BINARY", shutil.which("node") or "")
        self.validator_script = self._resolve_validator_script()

    @staticmethod
    def _resolve_validator_script() -> Path | None:
        candidates = [
            Path(os.getenv("DRAWN_BY_CODE_ROOT", "/app/drawn_by_code")) / "engine" / "validate-scene.mjs",
            Path(__file__).resolve().parents[2] / "drawn_by_code" / "engine" / "validate-scene.mjs",
        ]
        for path in candidates:
            if path.is_file():
                return path
        return None

    @staticmethod
    def validate_compiled_program(program: dict[str, Any]) -> None:
        """Validate cached and freshly compiled programs for structural and safety integrity.

        JavaScript identifier/helper resolution is enforced authoritatively by the
        Acorn + eslint-scope AST linker (`validate-scene.mjs`) rather than regex.
        """
        if not isinstance(program, dict):
            raise ValueError("Animation program must be an object")
        source = program.get("scene_js")
        if not isinstance(source, str) or not source:
            raise ValueError("Animation program is missing scene_js")

        bundle = program.get("repair_bundle")
        if bundle is None:
            # Allow programs from older api-worker revisions or without optional repair metadata
            # to render cleanly; validate-scene.mjs performs full JS AST/syntax validation next.
            return
        if not isinstance(bundle, dict):
            raise ValueError("Animation repair_bundle must be an object when present")
        shared_js = bundle.get("shared_js")
        shots = bundle.get("shots")
        duration = bundle.get("duration")
        logical = bundle.get("logical")
        style_id = bundle.get("style_id")
        if (
            not isinstance(shared_js, str)
            or not isinstance(shots, list)
            or not shots
            or isinstance(duration, bool)
            or not isinstance(duration, int)
            or not isinstance(logical, list)
            or len(logical) != 2
            or not all(isinstance(v, int) and not isinstance(v, bool) for v in logical)
            or not isinstance(style_id, str)
        ):
            raise ValueError("Animation repair bundle is incomplete or malformed")

        for shot in shots:
            if (
                not isinstance(shot, dict)
                or isinstance(shot.get("index"), bool)
                or not isinstance(shot.get("index"), int)
                or isinstance(shot.get("start_frame"), bool)
                or not isinstance(shot.get("start_frame"), int)
                or isinstance(shot.get("end_frame"), bool)
                or not isinstance(shot.get("end_frame"), int)
                or not isinstance(shot.get("name"), str)
                or not isinstance(shot.get("draw_body"), str)
            ):
                raise ValueError("Animation repair bundle contains an invalid shot")

        DeepSeekAnimationCompiler.validate_source(source, duration, logical)

    async def _code_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        token_limit: int,
        label: str = "animation fragment",
        enable_thinking: bool = False,
    ) -> str:
        """Generate raw JavaScript; strips optional markdown fence cleanly."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        request_started = asyncio.get_running_loop().time()
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": token_limit,
        }
        if enable_thinking:
            kwargs["reasoning_effort"] = self.shared_reasoning_effort
            kwargs["extra_body"] = {"thinking": {"type": "enabled"}}
        else:
            kwargs["reasoning_effort"] = "none"
            kwargs["extra_body"] = {"thinking": {"type": "disabled"}}

        response = await self.client.chat.completions.create(**kwargs)
        latency_ms = round((asyncio.get_running_loop().time() - request_started) * 1000)
        choice = response.choices[0] if response.choices else None
        message = choice.message if choice else None
        raw = (message.content or "").strip() if message else ""
        usage = response.usage
        prompt_details = getattr(usage, "prompt_tokens_details", None)
        finish_reason = getattr(choice, "finish_reason", None)
        logger.info("deepseek.animation.response", extra={
            "model": self.model,
            "label": label,
            "thinking_enabled": enable_thinking,
            "latency_ms": latency_ms,
            "finish_reason": finish_reason,
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
        # Cleanly unwrap markdown code fences if present.
        fenced = re.search(r"```(?:javascript|js)?\s*\n([\s\S]*?)\n```", raw, re.IGNORECASE)
        if fenced:
            raw = fenced.group(1).strip()
        elif raw.startswith("```"):
            raw = re.sub(r"^```(?:javascript|js)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\s*```$", "", raw).strip()
        return raw

    async def _run_local_js_validation(self, source: str) -> str | None:
        """Run Node syntax + Acorn/eslint-scope AST linker if Node is available.

        Returns None on pass, or a concise error description on failure.
        """
        if not self.node or not shutil.which(self.node):
            return None
        work = Path(tempfile.mkdtemp(prefix="shortclipr-link-"))
        try:
            scene_file = work / "scene.js"
            scene_file.write_text(source, encoding="utf-8")

            # 1. Syntax check
            syntax = await asyncio.create_subprocess_exec(
                self.node, "--check", str(scene_file),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(syntax.communicate(), timeout=20)
            if syntax.returncode != 0:
                return "JavaScript syntax error:\n" + stderr.decode(errors="replace")[-1200:]

            # 2. AST scope & unresolved-identifier linker
            if self.validator_script and self.validator_script.is_file():
                linker = await asyncio.create_subprocess_exec(
                    self.node, str(self.validator_script), str(scene_file),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                )
                stdout, _ = await asyncio.wait_for(linker.communicate(), timeout=20)
                if linker.returncode != 0:
                    return "JavaScript linker error:\n" + (stdout or b"").decode(errors="replace")[-1400:]
            return None
        finally:
            shutil.rmtree(work, ignore_errors=True)

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
    def _build_function_metadata(
        shared_signatures: list[dict[str, str]],
        compiled_shots: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Build function_specs and function_registry from the REAL generated shared_js."""
        specs: list[dict[str, Any]] = []
        registry: list[dict[str, Any]] = []
        for entry in shared_signatures:
            name = entry["name"]
            used_in = sorted({
                shot["index"]
                for shot in compiled_shots
                if re.search(rf"(?<![\w$.]){re.escape(name)}\s*\(", shot["draw_body"])
            })
            specs.append({
                "name": name,
                "category": "visual",
                "signature": entry["signature"],
                "purpose": entry["doc"] or f"Shared visual helper {name}",
                "visual_target": entry["doc"] or name,
                "dependencies": [],
                "required_by_shots": used_in,
                "version": 1,
            })
            registry.append({
                "name": name,
                "category": "visual",
                "signature": entry["signature"],
                "purpose": entry["doc"] or f"Shared visual helper {name}",
                "visual_target": entry["doc"] or name,
                "dependencies": [],
                "required_by_shots": used_in,
                "version": 1,
                "source_scope": "shared",
                "static_status": "implementation_validated",
                "runtime_status": "not_render_verified",
            })
        return specs, registry

    @staticmethod
    def _visual_qa_context(
        visual_bible: dict[str, Any],
        scenes: list[dict[str, Any]],
        function_specs: list[dict[str, Any]],
        function_registry: list[dict[str, Any]],
    ) -> dict[str, Any]:
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
            "function_specs": function_specs,
            "function_registry": function_registry,
        }

    @staticmethod
    def _unwrap_shot_body(body: str, shot_index: int) -> str:
        """If the model wrapped the shot in `function drawShot_N(...) { ... }`, unwrap its body."""
        stripped = body.strip()
        match = re.match(
            rf"^(?:export\s+)?function\s+drawShot_{shot_index}\s*\([^)]*\)\s*\{{([\s\S]*)\}}\s*;?$",
            stripped,
        )
        if match:
            return match.group(1).strip()
        return stripped

    async def _repair_assembled_error(
        self,
        shared_js: str,
        compiled_shots: list[dict[str, Any]],
        error_report: str,
        duration: int,
        logical: list[int],
        style_id: str,
        visual_direction: dict[str, Any] | None = None,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Surgically fix a syntax or unresolved-identifier error before returning the film."""
        assembled = self._assemble_film(
            shared_js, compiled_shots, duration, logical, style_id, visual_direction,
        )
        lines = assembled.splitlines()

        # If one or more missing draw* helpers are called across multiple shots, adding them
        # once to shared_js fixes every affected shot in a single repair pass.
        missing_draw_helpers = find_unresolved_film_draw_helpers(assembled)
        shots_calling_missing = sum(
            1 for shot in compiled_shots
            if any(re.search(rf"(?<![\w$.]){re.escape(name)}\s*\(", shot["draw_body"]) for name in missing_draw_helpers)
        )

        target_shot_pos: int | None = None
        if not (missing_draw_helpers and shots_calling_missing >= 2):
            line_match = re.search(r"line\s+(\d+)|scene\.js:(\d+)|\((\d+):\d+\)", error_report)
            failing_line = (
                int(line_match.group(1) or line_match.group(2) or line_match.group(3))
                if line_match else None
            )
            if failing_line is not None and 1 <= failing_line <= len(lines):
                for idx in range(failing_line - 1, -1, -1):
                    shot_header = re.match(r"^function\s+drawShot_(\d+)\s*\(", lines[idx])
                    if shot_header:
                        shot_idx = int(shot_header.group(1))
                        for pos, shot in enumerate(compiled_shots):
                            if shot["index"] == shot_idx:
                                target_shot_pos = pos
                                break
                        break
                    if lines[idx].startswith("Motion.scene("):
                        break

        shared_sigs = extract_shared_function_signatures(shared_js)
        sig_block = "\n".join(
            f"- {item['signature']}" + (f"  // {item['doc']}" if item["doc"] else "")
            for item in shared_sigs
        ) or "(none)"

        if target_shot_pos is not None:
            shot = compiled_shots[target_shot_pos]
            repair_prompt = f"""
Fix the JavaScript error in drawShot_{shot['index']}.

ERROR TO FIX:
{error_report}

AVAILABLE SHARED FUNCTIONS (exact signatures):
{sig_block}

{_TOOLKIT_REFERENCE}

CURRENT BROKEN BODY OF drawShot_{shot['index']}(g, t, env, absoluteTime):
{shot['draw_body']}

RULES:
- Return ONLY the fixed JavaScript statements for the body of drawShot_{shot['index']} (no outer function wrapper).
- Fix every syntax error, undefined variable, or undefined function call.
- If a helper function is missing, either call an existing shared function above or define it locally inside this body.
- Never use bare mix(); use Ease.lerp(a, b, u). Never use Math.random(), Date, fetch, eval, window, or document.
- Return raw JavaScript only (no JSON, no explanation).
""".strip()
            fixed_body = await self._code_completion(
                "You are a senior JavaScript Canvas 2D debugger. Return only fixed executable JS statements.",
                repair_prompt,
                min(self.max_output_tokens, 12000),
                label=f"Auto-repair drawShot_{shot['index']}",
            )
            fixed_body = self._unwrap_shot_body(fixed_body, shot["index"])
            if not isinstance(fixed_body, str) or len(fixed_body) > MAX_SHOT_SOURCE:
                raise ValueError(f"Auto-repaired Shot {shot['index'] + 1} source length is outside allowed bounds")
            updated_shots = copy.deepcopy(compiled_shots)
            updated_shots[target_shot_pos]["draw_body"] = fixed_body
            return shared_js, updated_shots

        # Otherwise repair shared_js (and implement any missing shared helpers called by shots).
        missing_note = (
            f"\nMISSING HELPER FUNCTIONS REFERENCED BY SHOTS (implement these in shared_js): {', '.join(missing_draw_helpers)}\n"
            if missing_draw_helpers else ""
        )
        repair_prompt = f"""
Fix the JavaScript error in the shared drawing library.

ERROR TO FIX:
{error_report}
{missing_note}
{_TOOLKIT_REFERENCE}

CURRENT SHARED DRAWING LIBRARY:
{shared_js}

RULES:
- Return ONLY the complete fixed shared JavaScript drawing library.
- Fix every syntax error, undefined variable, or missing helper function.
- Keep all existing working function names and signatures intact so shots can still call them.
- Never use bare mix(); use Ease.lerp(a, b, u). Never use Math.random(), Date, fetch, eval, window, or document.
- Return raw JavaScript only (no JSON, no explanation).
""".strip()
        fixed_shared = await self._code_completion(
            "You are a senior JavaScript Canvas 2D debugger. Return only fixed executable JS source.",
            repair_prompt,
            min(self.max_output_tokens, 24000),
            label="Auto-repair shared drawing library",
        )
        if not isinstance(fixed_shared, str) or len(fixed_shared) > MAX_SHARED_SOURCE:
            raise ValueError("Auto-repaired shared library source length is outside allowed bounds")
        return fixed_shared, compiled_shots

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
        visual_continuity_contract = build_visual_continuity_contract(visual_bible)
        scenes = validate_scene_plan(plan.get("scenes"), total_frames)
        motion_diagnostics = analyze_mechanism_motion(visual_bible, scenes)

        style_id = visual_bible["style_id"]
        visual_direction = visual_bible.get("visual_direction", {})
        art_direction_value = plan.get("art_direction")
        if art_direction_value is None:
            art_direction = build_art_direction(
                style_id,
                requested_style=None,
                style_notes=str(visual_bible.get("style_notes", "")),
            )
        else:
            art_direction = validate_art_direction(art_direction_value, style_id)
        art_direction_instructions = format_art_direction(art_direction)

        # ── Stage 1: Shared Visual Kit ──
        shared_prompt = f"""
ROLE
You are a lead motion-graphics artist and Canvas 2D engineer creating a studio-grade
animated short film (think Kurzgesagt / Vox / Apple keynote motion graphics — rich layered
silhouettes, directional lighting, gradients, cast shadows, tactile depth, smooth easing;
NEVER crude stick figures, thin pencil outlines, or flat unshaded boxes).

TASK
Write the shared JavaScript visual asset library for this {logical[0]}x{logical[1]} ({aspect})
film in the `{style_id}` style, following this film's VISUALOGRAPHY DIRECTION:
{json.dumps(visual_direction, ensure_ascii=False)}

DESIGN & QUALITY STANDARDS
- Build clean, modular top-level named functions for the recurring characters, props,
  environments, and visual motifs in the Visual Bible.
- You MAY write internal helper functions (e.g., drawWheel, drawCloud, drawWindow) and call
  shared helpers from other shared helpers.
- Put a concise 1-line `//` comment above each main function explaining its parameters and
  origin (e.g. `// Draws hero explorer at ground contact (x, y), scale=1, pose='walk'|'idle', walkPhase=0`).
- Use default parameter values where helpful (e.g. `scale = 1, pose = 'idle'`).
- Use the film's custom palette (`ShortcliprStyles.palette('{style_id}')` or the hex colors from
  `visual_direction.palette`), `ShortcliprStyles.shadedShape`, linear/radial gradients,
  `ShortcliprStyles.glow`, `ShortcliprStyles.solveIK` (for articulated character limbs),
  `ShortcliprStyles.organicPath` (for tactile/hand-crafted styles), ground contact shadows, and
  rim highlights so every subject looks polished at 1080p.
- Always wrap transforms/styles in `g.save()` / `g.restore()`.
- Keep all code 100% deterministic: use `Motion.rng(seed)` / `Motion.noise1(seed, x)`, NEVER
  `Math.random()`, `Date`, `performance`, DOM, `window`, `document`, `fetch`, `eval`, or timers.
- Do NOT call `Motion.scene(...)` in this library.
- Return raw JavaScript only (no Markdown explanations, no JSON wrapper).

{_TOOLKIT_REFERENCE}

{_CRAFT_REFERENCE_SNIPPET}

BINDING ART DIRECTION:
{art_direction_instructions}

VISUAL BIBLE:
{json.dumps(visual_bible, ensure_ascii=False)}

STORYBOARD OVERVIEW (for knowing what poses/states the helpers need):
{json.dumps([{"index": s["index"], "purpose": s.get("purpose"), "action": s.get("action"), "characters": s.get("characters", []), "props": s.get("props", []), "environment": s.get("environment", "")} for s in scenes], ensure_ascii=False)}

Write the complete, studio-quality shared JavaScript visual library now.
""".strip()

        shared_js = await self._code_completion(
            "You are a lead Canvas 2D motion-graphics engineer. Return only clean, executable JavaScript.",
            shared_prompt,
            min(self.max_output_tokens, 32000),
            label="Shared visual kit",
            enable_thinking=self.enable_thinking,
        )
        if not isinstance(shared_js, str) or len(shared_js) > MAX_SHARED_SOURCE:
            raise ValueError("Shared visual kit source length is outside allowed bounds")

        # Extract the REAL declared signatures so every shot knows the exact API.
        shared_signatures = extract_shared_function_signatures(shared_js)
        shared_api_doc = "\n".join(
            f"- {item['signature']}" + (f"  // {item['doc']}" if item["doc"] else "")
            for item in shared_signatures
        ) or "(No shared functions declared — draw directly using ShortcliprStyles and Canvas 2D.)"

        # ── Stage 2: Parallel Shot Code Generation (prompt-cache-optimized) ──
        # Keep the system prompt 100% identical across all shots so DeepSeek's
        # automatic prefix cache hits on shots 2..N (~80-90% input token savings).
        shot_system_prompt = f"""
ROLE
You are a lead 2D motion-graphics director writing ONE complete, visually rich shot for a
`{style_id}` animated film on a {logical[0]}x{logical[1]} logical canvas (30 FPS, total {duration}s).

FILM VISUALOGRAPHY DIRECTION (authoritative palette, genre, lighting, camera & motion feel):
{json.dumps(visual_direction, ensure_ascii=False)}

OUTPUT CONTRACT
Return ONLY executable JavaScript statements for the body of `drawShot_N(g, t, env, absoluteTime)`.
- `t` is local shot time in seconds (starts at 0).
- `absoluteTime` is overall film time in seconds.
- `env` has `{{ W: {logical[0]}, H: {logical[1]}, fps: 30, duration: {duration}, k }}`.
- Return raw JavaScript statements only (no outer function wrapper, no JSON, no explanation).

AVAILABLE SHARED VISUAL LIBRARY FUNCTIONS (use these exact names & signatures):
{shared_api_doc}

{_TOOLKIT_REFERENCE}

VISUAL CRAFT & 4-PHASE DISNEY CHOREOGRAPHY RULES
1. Stage Depth & Atmosphere:
   - Paint a rich, world-specific background that fits THIS shot and `lighting_mood` (custom sky/space/
     underwater/interior/editorial canvas, or `ShortcliprStyles.backdrop(g, '{style_id}', env, absoluteTime)`).
   - Separate depth planes (`Background -> Midground Hero -> Foreground Framing`) or use
     `ShortcliprStyles.parallaxLayers(g, env, camState, [...])` for 2.5D multi-plane depth.
2. Structure Local Time `t` into a 4-Phase Choreography Beat-Grid (NEVER pop everything in at `t = 0`):
   - Phase A (0–15% of shot): Establish environment, atmosphere, and camera drift.
   - Phase B (15–35% of shot): Staggered entrances using `ShortcliprStyles.stagger(t, idx, 0.09, 0.1)`,
     `ShortcliprStyles.spring(t, delay)`, or `ShortcliprStyles.anticipation(t, delay)`.
   - Phase C (35–85% of shot): Core visual transformation / action — e.g. character movement with
     `ShortcliprStyles.solveIK` & `ShortcliprStyles.squash`, path tracing with `ShortcliprStyles.strokeReveal`
     or `flowPath`, volumetric `lightBeam` / `bloomLayer`, or isometric assembly.
   - Phase D (85–100% of shot): Settle with continuous living secondary motion (gentle sine breathing/bobbing,
     `ShortcliprStyles.particles`, pulsing `glow`, or slow camera push-in) — ZERO frozen/dead frames.
3. Reuse the shared visual library functions above for recurring characters, props, and environments.
   You MAY also define local helper functions inside this shot if helpful, and NEVER call a function
   name that isn't defined above or locally.
4. Keep every element cleanly framed inside {logical[0]}x{logical[1]} with generous margin and clear focal hierarchy.
5. Strictly deterministic Canvas 2D: NEVER use `Math.random()`, `Date`, `performance`, `window`, `document`, `fetch`, `eval`, or bare `mix()` (always `Ease.lerp`).
6. Do NOT render subtitles or full narration paragraphs on screen.

ART DIRECTION:
{art_direction_instructions}
""".strip()

        semaphore = asyncio.Semaphore(self.max_parallel_shots)

        async def compile_one(scene: dict[str, Any]) -> dict[str, Any]:
            start_s = scene["start_frame"] / 30
            end_s = scene["end_frame"] / 30
            shot_dur = end_s - start_s
            shot_visual_context = self._shot_visual_context(visual_bible, scene)

            mechanism_rules = ""
            if scene.get("mechanism_actions"):
                mechanism_rules = f"""
MECHANISM KINEMATICS:
- `mechanismActions` and `mechanisms` are injected local constants in this function.
- For each action, find its mechanism by `mechanism_id`. If it has `kinematics`, compute:
  `const rawP = Ease.clamp(Ease.seg(t, 0, {shot_dur:.3f}));`
  `const p = (action.start_progress ?? 0) + ((action.end_progress ?? 1) - (action.start_progress ?? 0)) * Ease.inOut(rawP);`
  and call `ShortcliprStyles.mechanismPose(spec, p)` to position/rotate connected parts.
"""

            shot_user_prompt = f"""
Write the complete JavaScript drawing body for `drawShot_{scene['index']}` ({start_s:.2f}s to {end_s:.2f}s, local duration {shot_dur:.2f}s).
{mechanism_rules}
SHOT VISUAL REFERENCES:
{json.dumps(shot_visual_context, ensure_ascii=False, separators=(",", ":"))}

STORYBOARD:
{json.dumps(scene, ensure_ascii=False, separators=(",", ":"))}
""".strip()

            async with semaphore:
                body = await self._code_completion(
                    shot_system_prompt,
                    shot_user_prompt,
                    min(self.max_output_tokens, 24000),
                    label=f"Shot {scene['index'] + 1}",
                    enable_thinking=False,
                )
                body = self._unwrap_shot_body(body, scene["index"])
                if not isinstance(body, str) or len(body) > MAX_SHOT_SOURCE:
                    raise ValueError(f"Shot {scene['index'] + 1} source length is outside allowed bounds")

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

        # ── Stage 3: Assemble + Pre-Save Syntax/Linker Auto-Repair Loop ──
        max_auto_repairs = 2
        source = ""
        for repair_attempt in range(max_auto_repairs + 1):
            source = self._assemble_film(
                shared_js, compiled, duration, logical, style_id, visual_direction,
            )
            error_report: str | None = None
            try:
                if len(source) > MAX_FILM_SOURCE:
                    raise ValueError("Assembled animation program exceeds maximum source size")
                self.validate_source(source, duration, logical)
            except ValueError as err:
                error_report = str(err)

            if error_report is None:
                if self.node and shutil.which(self.node):
                    error_report = await self._run_local_js_validation(source)
                else:
                    unresolved = find_unresolved_film_draw_helpers(source)
                    if unresolved:
                        error_report = "Unresolved drawing helper calls: " + ", ".join(unresolved)

            if error_report is None:
                break

            if repair_attempt >= max_auto_repairs:
                raise ValueError(
                    f"Compiled animation failed validation after {max_auto_repairs} auto-repair(s): {error_report}"
                )

            logger.warning(
                "deepseek.animation.auto_repair",
                extra={
                    "attempt": repair_attempt + 1,
                    "max_attempts": max_auto_repairs,
                    "error": error_report[:500],
                },
            )
            shared_js, compiled = await self._repair_assembled_error(
                shared_js, compiled, error_report, duration, logical, style_id, visual_direction,
            )

        # Build clean metadata from the actual final shared_js & compiled shots.
        final_signatures = extract_shared_function_signatures(shared_js)
        function_specs, function_registry = self._build_function_metadata(final_signatures, compiled)

        result = {
            "compiler_version": "studio-3stage-v2",
            "runtime_contract_version": 2,
            "scene_js": source,
            "style": style_id,
            "model": self.model,
            "shot_count": len(compiled),
            "shared_source_chars": len(shared_js),
            "shot_source_chars": sum(len(x["draw_body"]) for x in compiled),
            "motion_diagnostics": motion_diagnostics,
            "visual_qa_context": self._visual_qa_context(
                visual_bible, scenes, function_specs, function_registry,
            ),
            "function_specs": function_specs,
            "function_registry": function_registry,
            "repair_bundle": {
                "schema_version": 2,
                "duration": duration,
                "logical": logical,
                "style_id": style_id,
                "art_direction": art_direction,
                "art_direction_instructions": art_direction_instructions,
                "visual_bible": visual_bible,
                "visual_continuity_contract": visual_continuity_contract,
                "scenes": scenes,
                "shared_js": shared_js,
                "function_specs": function_specs,
                "function_registry": function_registry,
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
        self.validate_compiled_program(result)
        return result

    async def repair_shared_helpers(
        self,
        repair_bundle: dict[str, Any],
        helper_names: list[str],
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Repair identified shared drawing helpers from Vision QA findings."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        if not isinstance(repair_bundle, dict) or repair_bundle.get("schema_version") not in {1, 2}:
            raise ValueError("Unsupported or missing shared-helper repair bundle")
        if not isinstance(helper_names, list) or not 1 <= len(helper_names) <= 3:
            raise ValueError("Shared-helper repair requires 1–3 helper names")
        if not isinstance(findings, list) or not findings:
            raise ValueError("At least one visual QA finding is required")

        shared_js = repair_bundle.get("shared_js")
        shots = repair_bundle.get("shots")
        specs = repair_bundle.get("function_specs", [])
        if not isinstance(shared_js, str) or not isinstance(shots, list):
            raise ValueError("Repair bundle lacks shared source or shots")

        original_helpers = extract_shared_draw_helpers(shared_js, helper_names)
        prompt = f"""
Repair the following shared Canvas 2D drawing function(s) based on visual QA findings.
Return ONLY the complete repaired function declarations (no JSON, no Markdown prose).

VISUAL QA FINDINGS:
{json.dumps(findings[:8], ensure_ascii=False)}

EXISTING IMPLEMENTATIONS:
{json.dumps(original_helpers, ensure_ascii=False)}

ART DIRECTION:
{repair_bundle.get("art_direction_instructions", "")}

{_TOOLKIT_REFERENCE}

RULES:
- Preserve exact function names and parameter contracts.
- Fix the visible visual defects while keeping code deterministic and self-contained.
""".strip()

        generated = await self._code_completion(
            "You are a senior Canvas 2D engineer. Return only executable function declarations.",
            prompt,
            min(self.max_output_tokens, 12000),
            label="Visual-QA shared helper repair",
        )
        generated = validate_generated_fragment(generated, "Visual-QA shared helper repair", MAX_SHARED_SOURCE)
        updated_shared = replace_shared_draw_helpers(shared_js, generated, helper_names)
        if len(updated_shared) > MAX_SHARED_SOURCE:
            raise ValueError("Repaired shared drawing library exceeds maximum source size")

        updated_bundle = copy.deepcopy(repair_bundle)
        updated_bundle["shared_js"] = updated_shared
        duration = repair_bundle["duration"]
        logical = repair_bundle["logical"]
        style_id = repair_bundle["style_id"]
        visual_direction = (repair_bundle.get("visual_bible") or {}).get("visual_direction")
        source = self._assemble_film(
            updated_shared, shots, duration, logical, style_id, visual_direction,
        )
        self.validate_source(source, duration, logical)

        repaired_program = {"scene_js": source, "repair_bundle": updated_bundle}
        self.validate_compiled_program(repaired_program)
        return {
            **repaired_program,
            "repaired_function_names": helper_names,
            "original_shared_source_chars": len(shared_js),
            "repaired_shared_source_chars": len(updated_shared),
            "unchanged_shot_indices": [shot.get("index") for shot in shots],
        }

    async def repair_shot(
        self,
        repair_bundle: dict[str, Any],
        shot_index: int,
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Regenerate one shot body from Vision QA findings while keeping all other code stable."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        if not isinstance(repair_bundle, dict) or repair_bundle.get("schema_version") not in {1, 2}:
            raise ValueError("Unsupported or missing shot repair bundle")
        shots = repair_bundle.get("shots")
        scenes = repair_bundle.get("scenes")
        shared_js = repair_bundle.get("shared_js")
        if not isinstance(shots, list) or not isinstance(scenes, list) or not isinstance(shared_js, str):
            raise ValueError("Shot repair bundle is incomplete")

        position = next((i for i, s in enumerate(shots) if s.get("index") == shot_index), None)
        if position is None:
            raise ValueError("Target shot not found in repair bundle")

        original_shot = shots[position]
        scene = scenes[position]
        original_body = original_shot.get("draw_body", "")
        shared_sigs = extract_shared_function_signatures(shared_js)
        sig_block = "\n".join(f"- {item['signature']}" for item in shared_sigs)

        prompt = f"""
Repair ONLY shot {shot_index} based on the Visual QA findings below.
Return ONLY the replacement JavaScript statements for `drawShot_{shot_index}(g, t, env, absoluteTime)`.

VISUAL QA FINDINGS:
{json.dumps(findings[:8], ensure_ascii=False)}

STORYBOARD:
{json.dumps(scene, ensure_ascii=False)}

AVAILABLE SHARED FUNCTIONS:
{sig_block}

ART DIRECTION:
{repair_bundle.get("art_direction_instructions", "")}

{_TOOLKIT_REFERENCE}

ORIGINAL SHOT BODY:
{original_body}

RULES:
- Fix the visible defects while preserving shot timing, style, and working elements.
- Never call undefined functions, bare mix(), Math.random(), Date, or DOM/network APIs.
- Return raw JavaScript statements only.
""".strip()

        replacement_body = await self._code_completion(
            "You are a senior Canvas 2D animation programmer. Return only executable JavaScript statements.",
            prompt,
            min(self.max_output_tokens, 10000),
            label=f"Targeted repair for shot {shot_index + 1}",
        )
        replacement_body = self._unwrap_shot_body(replacement_body, shot_index)
        replacement_body = validate_generated_fragment(
            replacement_body, f"Targeted repair for shot {shot_index + 1}", MAX_SHOT_SOURCE,
        )

        updated_bundle = copy.deepcopy(repair_bundle)
        updated_bundle["shots"][position]["draw_body"] = replacement_body
        duration = repair_bundle["duration"]
        logical = repair_bundle["logical"]
        style_id = repair_bundle["style_id"]
        visual_direction = (repair_bundle.get("visual_bible") or {}).get("visual_direction")
        source = self._assemble_film(
            shared_js, updated_bundle["shots"], duration, logical, style_id, visual_direction,
        )
        self.validate_source(source, duration, logical)

        repaired_program = {"scene_js": source, "repair_bundle": updated_bundle}
        self.validate_compiled_program(repaired_program)
        return {
            **repaired_program,
            "repaired_shot_index": shot_index,
            "original_body_chars": len(original_body),
            "replacement_body_chars": len(replacement_body),
            "unchanged_shot_indices": [s["index"] for s in shots if s["index"] != shot_index],
        }

    @staticmethod
    def _assemble_film(
        shared_js: str,
        shots: list[dict[str, Any]],
        duration: int,
        logical: list[int],
        style_id: str,
        visual_direction: dict[str, Any] | None = None,
    ) -> str:
        functions, ranges, dispatch = [], [], []
        for idx, shot in enumerate(shots):
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
            if transition not in {"cut", "wipe", "iris", "paper", "fade", "zoom", "whip"}:
                transition = "cut"
            is_last = idx == len(shots) - 1
            cond = f"t >= {start:.6f}" if is_last else f"t >= {start:.6f} && t < {end:.6f}"
            block = f"if ({cond}) {{ const local=Math.max(0,t-{start:.6f}); drawShot_{index}(g,local,env,t); "
            if not is_last and transition != "cut":
                transition_start = max(0.0, end - start - 0.42)
                next_index = shots[idx + 1]["index"]
                block += (
                    f"if(local>{transition_start:.6f}){{const p=Ease.seg(local,{transition_start:.6f},{end-start:.6f});"
                    f"const next=Motion.layer(env,'transition-{index}',(ng)=>drawShot_{next_index}(ng,0,env,{end:.6f}));"
                    f"ShortcliprStyles.transition(g,env,next,p,'{transition}');}}"
                )
            dispatch.append(block + "return; }")

        function_source = "\n".join(functions)
        palette_setup = ""
        if isinstance(visual_direction, dict) and isinstance(visual_direction.get("palette"), dict):
            pal_json = json.dumps(visual_direction["palette"], ensure_ascii=False, separators=(",", ":"))
            mood_json = json.dumps(str(visual_direction.get("lighting_mood") or ""), ensure_ascii=False)
            palette_setup = f"if (ShortcliprStyles.setCustomPalette) ShortcliprStyles.setCustomPalette({pal_json}, {mood_json});\n"
        # Apply subtle film finishing only on painterly/atmospheric styles; keep technical/crisp styles razor-sharp.
        use_post = style_id not in {"pixel-art", "blueprint", "line", "isometric-technical"}
        post_line = f"  post(ctx,t,env) {{ ShortcliprStyles.postProcess(ctx,t,env,'{style_id}'); }}\n" if use_post else ""
        return (
            "// ShortClipr studio Drawn-by-Code film. Generated code is untrusted input.\n"
            f"// Visual style: {style_id}\n"
            f"{palette_setup}{shared_js}\n{function_source}\n"
            "Motion.scene({\n"
            "  uses: ['styles/shortclipr.js'],\n"
            "  fps: 30,\n"
            f"  duration: {duration},\n"
            f"  logical: {json.dumps(logical)},\n"
            f"  shots: [{','.join(ranges)}],\n"
            f"  draw(g,t,env) {{ {' '.join(dispatch)} }},\n"
            f"{post_line}"
            "});\n"
        )

    @staticmethod
    def validate_source(source: str, duration: int, logical: list[int]) -> None:
        if not 200 <= len(source) <= MAX_FILM_SOURCE:
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
        mix_match = re.search(r"(?<![\w$.])mix\s*\(", source)
        if mix_match:
            line_no = source.count("\n", 0, mix_match.start()) + 1
            raise ValueError(
                f"Generated animation calls unsupported bare mix() at line {line_no}; use Ease.lerp(a, b, progress)"
            )
        validate_generated_fragment(source, "Assembled animation", MAX_FILM_SOURCE)
