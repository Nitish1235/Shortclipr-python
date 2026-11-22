"""Shot-by-shot DeepSeek compiler for deterministic Drawn-by-Code films."""
from __future__ import annotations

import asyncio
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

    async def _json_completion(self, system_prompt: str, user_prompt: str, token_limit: int, reasoning_effort: str = "none", label: str = "animation fragment") -> dict[str, Any]:
        """Make one fast, non-thinking JSON/code generation request."""
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        request_started = asyncio.get_running_loop().time()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
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
        logger.info("deepseek.animation.response", extra={
            "model": self.model, "label": label, "thinking_enabled": False,
            "latency_ms": latency_ms,
            "finish_reason": getattr(choice, "finish_reason", None),
            "prompt_tokens": getattr(usage, "prompt_tokens", None),
            "prompt_cache_hit_tokens": getattr(prompt_details, "cached_tokens", None),
            "prompt_cache_miss_tokens": getattr(usage, "prompt_cache_miss_tokens", None),
            "completion_tokens": getattr(usage, "completion_tokens", None),
            "reasoning_tokens": getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", None),
            "total_tokens": getattr(usage, "total_tokens", None),
            "content_chars": len(raw),
        })
        if not raw:
            raise RuntimeError("DeepSeek returned empty animation JSON")
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as exc:
            # Keep enough escaped context to diagnose malformed JSON without
            # dumping the full generated source into production logs.
            logger.error("deepseek.animation.invalid_json", extra={
                "model": self.model,
                "label": label,
                "response_id": getattr(response, "id", None),
                "finish_reason": getattr(choice, "finish_reason", None),
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                "content_chars": len(raw),
                "json_error": exc.msg,
                "json_error_pos": exc.pos,
                "json_error_line": exc.lineno,
                "json_error_column": exc.colno,
                "response_prefix": repr(raw[:180]),
                "response_suffix": repr(raw[-180:]),
            })
            raise RuntimeError(
                f"DeepSeek returned invalid JSON for {label} "
                f"(chars={len(raw)}, error={exc.msg} at line {exc.lineno}, "
                f"column {exc.colno})"
            ) from exc
        if not isinstance(value, dict):
            raise RuntimeError("DeepSeek animation response must be a JSON object")
        return value

    async def _validated_fragment(
        self, system_prompt: str, user_prompt: str, token_limit: int,
        field: str, label: str, max_chars: int, reasoning_effort: str = "none",
    ) -> str:
        """Generate once and apply only basic deterministic checks."""
        result = await self._json_completion(system_prompt, user_prompt, token_limit, label=label)
        return validate_generated_fragment(result.get(field), label, max_chars)

    @staticmethod
    def _shot_visual_context(visual_bible: dict[str, Any], scene: dict[str, Any]) -> dict[str, Any]:
        """Send each shot only the visual-bible entities it actually uses."""
        character_ids = set(scene.get("characters") or [])
        prop_ids = set(scene.get("props") or [])
        environment_id = scene.get("environment")
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

        shared_prompt = f"""
You are ShortClipr's senior 2D character and illustration systems artist.
Create a compact reusable JavaScript drawing library for a {style_id} Canvas 2D film.\nFollow this binding art-direction contract:\n{art_direction_instructions}\nAim for at most 1,800 output tokens.
Return JSON only: {{"shared_js":"JavaScript source"}}.
The source is evaluated in the same script as the film and may define ordinary named
functions and constants. It must not call Motion.scene. Use only the supplied Canvas
2D context in functions. Never reference browser-global identifiers such as window,
document, self, top, parent or frames. No DOM, browser globals, imports, exports, network, filesystem,
Node APIs, timers, eval, Function, Date, performance, Math.random, WebGL or 3D.
A trusted runtime script ShortcliprStyles is loaded before this library. Use
ShortcliprStyles.palette("{style_id}"), ShortcliprStyles.paperBackground(g, "{style_id}", env),
ShortcliprStyles.paperShadow(g, x, y, blur, color), ShortcliprStyles.halftone(g, x, y, w, h, spacing, color),
ShortcliprStyles.camera(g, env, {{cx, cy, zoom, rotation}}) inside g.save()/g.restore(), and
ShortcliprStyles.pixelSnap(value, pixelSize) where appropriate. Use restrained texture
details rather than full-canvas particle loops. Create reusable helpers for every recurring
character, prop and environment in the visual bible. Character functions must preserve
silhouette, proportions, face, clothing, colours and distinctive marks across all shots.
Prefer short named functions such as drawExplorer(g,x,y,s,pose,expression). Implement only helpers needed by this visual bible. Avoid duplicate helpers, verbose comments and decorative details that do not support the scenes. Keep code deterministic and compact.
Do not use external assets. Do not redefine ShortcliprStyles.
Visual bible:
{json.dumps(visual_bible, ensure_ascii=False)}
""".strip()
        shared_js = await self._validated_fragment(
            "You are a senior Canvas 2D JavaScript systems programmer. Return strict JSON only.",
            shared_prompt + "\n\nReturn only the required JSON object.",
            min(self.max_output_tokens, 12000), "shared_js", "Shared drawing library",
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
            shot_prompt = f"""
You are ShortClipr's 2D animation shot director and Canvas artist.
Generate only the drawing body for one shot. Return JSON only:
{{"draw_body":"JavaScript statements"}}.
The body is inserted inside:
function drawShot_{scene["index"]}(g, t, env, absoluteTime) {{ ... }}
Here t is local shot time starting at zero; absoluteTime is film time in seconds.
The shared drawing library is already defined before this function.
VERIFIED SHARED DRAW HELPERS (exact names): {json.dumps(shared_helper_names)}
You may call only these shared helpers. If this shot needs another reusable drawing
function, define that function inside this draw_body before calling it. Never invent
a helper call and assume its implementation exists. Every custom drawX() call must
either be in the verified shared list above or have its complete function definition
inside this draw_body. Reuse shared functions for recurring characters and props;
do not redraw their defining features.
Use only CanvasRenderingContext2D methods on g, local variables, standard Math and
the shared helper functions. Redraw the full shot deterministically from t. No state
accumulation, random numbers, DOM/browser globals, imports, exports, network, file access,
Node APIs, timers, eval, Function, Date, performance, WebGL, Three.js or 3D.
Keep all drawing within the logical canvas {logical[0]}x{logical[1]}.
Make one clear animated action with simple easing and follow-through. Use only the composition layers needed for this shot. Keep code concise: aim for at most 900 output tokens; no comments, repeated character drawings or unnecessary decorative loops. Reuse shared helpers for all recurring entities. Do not render narration or subtitles.
STYLE: {style_id}
BINDING ART DIRECTION:
{art_direction_instructions}
SHOT VISUAL REFERENCES:
{json.dumps(shot_visual_context, ensure_ascii=False, separators=(",", ":"))}
SHOT:
{json.dumps(scene, ensure_ascii=False)}
SHOT WINDOW: {start_s:.3f}s to {end_s:.3f}s; local duration {end_s-start_s:.3f}s.
""".strip()
            async with semaphore:
                body = await self._validated_fragment(
                    "You are a senior Canvas 2D animation programmer. Return strict JSON only.",
                    shot_prompt + "\n\nWrite the complete draw_body now.",
                    min(self.max_output_tokens, 10000), "draw_body",
                    f"Shot {scene['index'] + 1}", MAX_SHOT_SOURCE,
                )
            return {
                "index": scene["index"],
                "start_frame": scene["start_frame"],
                "end_frame": scene["end_frame"],
                "name": str(scene.get("purpose", f"Shot {scene['index'] + 1}"))[:80],
                "draw_body": body,
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
            helper_prompt = f"""
You are ShortClipr's reusable Canvas 2D drawing-function engineer.
Implement every missing helper listed below as ordinary named JavaScript function
declarations. Return JSON only: {{"helpers_js":"JavaScript source"}}.
MISSING HELPERS: {json.dumps(missing_helpers)}
STYLE: {style_id}
BINDING ART DIRECTION: {art_direction_instructions}
VISUAL BIBLE: {json.dumps(visual_bible, ensure_ascii=False)}
SHOT CONTEXT: {json.dumps([
    {"index": shot["index"], "name": shot["name"], "body": shot["draw_body"]}
    for shot in compiled
    if any(name in shot["draw_body"] for name in missing_helpers)
], ensure_ascii=False)}
EXISTING SHARED HELPERS: {json.dumps(shared_helper_names)}
Rules:
- Define every requested helper with exactly its requested name.
- Use Canvas 2D only; function signature must start with (g, ...).
- Do not call any helper unless it is listed as existing or defined in this same fragment.
- Do not redefine existing helpers.
- No browser globals, DOM, imports, exports, network, filesystem, Node APIs, timers,
  eval, Function, Date, performance, random numbers, WebGL or 3D.
- Keep implementations deterministic, self-contained and visually consistent with
  the selected style. Return compact code, no markdown fences.
""".strip()
            helper_result = await self._json_completion(
                "You are a senior Canvas 2D JavaScript systems programmer. Return strict JSON only.",
                helper_prompt,
                min(self.max_output_tokens, 10000),
                label=f"On-demand drawing helpers pass {helper_pass + 1}",
            )
            generated_helpers = validate_generated_fragment(
                helper_result.get("helpers_js"),
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
        }


    @staticmethod
    def _assemble_film(shared_js: str, shots: list[dict[str, Any]], duration: int,
                       logical: list[int], style_id: str) -> str:
        functions, ranges, dispatch = [], [], []
        for shot in shots:
            index = shot["index"]
            start, end = shot["start_frame"] / 30, shot["end_frame"] / 30
            functions.append(f"function drawShot_{index}(g,t,env,absoluteTime) {{\n{shot['draw_body']}\n}}")
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
