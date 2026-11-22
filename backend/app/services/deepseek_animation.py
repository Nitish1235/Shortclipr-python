"""Shot-by-shot DeepSeek compiler for deterministic Drawn-by-Code films."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

from openai import AsyncOpenAI

from ..core.config import Settings
from .generation_policy import coding_effort
from .animation_contracts import (
    ASPECT_LOGICAL,
    MAX_FILM_SOURCE,
    MAX_SHARED_SOURCE,
    MAX_SHOT_SOURCE,
    validate_generated_fragment,
    validate_scene_plan,
    validate_visual_bible,
)


class DeepSeekAnimationCompiler:
    """Compiles a visual bible into shared drawing helpers and independent shot functions."""

    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_ANIMATION_MODEL
        self.reasoning_effort = settings.DEEPSEEK_REASONING_EFFORT
        self.max_output_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS
        self.max_parallel_shots = max(1, min(4, settings.DEEPSEEK_MAX_PARALLEL_SHOTS))
        self.enable_shot_review = settings.DEEPSEEK_ENABLE_SHOT_REVIEW
        self.client = (
            AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com",
                        timeout=900.0, max_retries=2)
            if settings.DEEPSEEK_API_KEY else None
        )

    async def _json_completion(self, system_prompt: str, user_prompt: str, token_limit: int, reasoning_effort: str = "medium") -> dict[str, Any]:
        if self.client is None:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        # DeepSeek JSON mode can return whitespace-only content when it cannot
        # recognize the generated output as JSON. Capture finish_reason/usage and
        # make one conservative non-thinking retry before failing the job.
        last_error = "unknown response"
        for attempt in range(2):
            request_started = asyncio.get_running_loop().time()
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=token_limit,
                # Animation source generation is a constrained coding task, not a
                # reasoning benchmark. Reserve the completion budget for JSON/code.
                reasoning_effort=("none" if attempt else reasoning_effort),
                extra_body={"thinking": {"type": "disabled" if attempt else "enabled"}},
            )
            latency_ms = round((asyncio.get_running_loop().time() - request_started) * 1000)
            choice = response.choices[0] if response.choices else None
            message = choice.message if choice else None
            raw = (message.content or "").strip() if message else ""
            usage = response.usage
            usage_info = {
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                "reasoning_tokens": getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", None),
            }
            finish_reason = getattr(choice, "finish_reason", None)
            logger.info(
                "deepseek.animation.response",
                extra={
                    "model": self.model,
                    "attempt": attempt + 1,
                    "latency_ms": latency_ms,
                    "finish_reason": finish_reason,
                    "response_id": getattr(response, "id", None),
                    **usage_info,
                    "content_chars": len(raw),
                    "reasoning_chars": len(getattr(message, "reasoning_content", None) or "") if message else 0,
                },
            )
            if not raw:
                last_error = f"empty JSON content (finish_reason={finish_reason}, usage={usage_info})"
                if attempt == 0:
                    logger.warning("deepseek.animation.empty_response_retry", extra={"finish_reason": finish_reason, **usage_info})
                    continue
                raise RuntimeError(f"DeepSeek returned empty animation JSON after fallback retry: {last_error}")
            try:
                value = json.loads(raw)
            except json.JSONDecodeError as exc:
                last_error = f"invalid JSON (finish_reason={finish_reason}, content_chars={len(raw)})"
                if attempt == 0:
                    logger.warning("deepseek.animation.invalid_json_retry", extra={"finish_reason": finish_reason})
                    continue
                raise RuntimeError(f"DeepSeek returned invalid animation JSON after fallback retry: {last_error}") from exc
            if not isinstance(value, dict):
                raise RuntimeError("DeepSeek animation response must be a JSON object")
            return value
        raise RuntimeError(f"DeepSeek animation generation failed: {last_error}")

    async def _validated_fragment(
        self, system_prompt: str, user_prompt: str, token_limit: int,
        field: str, label: str, max_chars: int, reasoning_effort: str,
    ) -> str:
        """Generate, validate, then make one targeted repair using the validator error."""
        result = await self._json_completion(system_prompt, user_prompt, token_limit, reasoning_effort)
        try:
            return validate_generated_fragment(result.get(field), label, max_chars)
        except ValueError as validation_error:
            logger.warning("deepseek.animation.fragment_repair", extra={
                "label": label, "reason": str(validation_error)[:300],
                "reasoning_effort": reasoning_effort,
            })
            repair_prompt = (
                f"The previous {label} failed deterministic validation: {validation_error}. "
                f"Return a complete corrected JSON object with the field {field!r}. "
                "Keep the original visual intent and obey every Canvas-only restriction. "
                f"Previous value:\\n{str(result.get(field, ''))[:max_chars]}"
            )
            repaired = await self._json_completion(
                system_prompt, repair_prompt, token_limit, reasoning_effort
            )
            return validate_generated_fragment(repaired.get(field), f"Repaired {label}", max_chars)

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

        shared_prompt = f"""
You are ShortClipr's senior 2D character and illustration systems artist.
Create a reusable JavaScript drawing library for a {style_id} Canvas 2D film.
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
Prefer named functions such as drawExplorer(g, x, y, scale, pose, expression). Include
common palette, shape, texture and shadow helpers. Keep code deterministic and self-contained.
Do not use external assets. Do not redefine ShortcliprStyles.
Visual bible:
{json.dumps(visual_bible, ensure_ascii=False)}
""".strip()
        shared_effort = coding_effort(None, project, "medium", "max")
        shared_js = await self._validated_fragment(
            "You are a senior Canvas 2D JavaScript systems programmer. Return strict JSON only.",
            shared_prompt + "\\n\\nReturn only the required JSON object.",
            min(self.max_output_tokens, 12000), "shared_js", "Shared drawing library",
            MAX_SHARED_SOURCE, shared_effort,
        )

        semaphore = asyncio.Semaphore(self.max_parallel_shots)

        async def compile_one(scene: dict[str, Any]) -> dict[str, Any]:
            start_s = scene["start_frame"] / 30
            end_s = scene["end_frame"] / 30
            shot_prompt = f"""
You are ShortClipr's 2D animation shot director and Canvas artist.
Generate only the drawing body for one shot. Return JSON only:
{{"draw_body":"JavaScript statements"}}.
The body is inserted inside:
function drawShot_{scene["index"]}(g, t, env, absoluteTime) {{ ... }}
Here t is local shot time starting at zero; absoluteTime is film time in seconds.
The shared drawing library is already defined before this function. Reuse its named
functions for recurring characters and props; do not redraw their defining features.
Use only CanvasRenderingContext2D methods on g, local variables, standard Math and
the shared helper functions. Redraw the full shot deterministically from t. No state
accumulation, random numbers, DOM/browser globals, imports, exports, network, file access,
Node APIs, timers, eval, Function, Date, performance, WebGL, Three.js or 3D.
Keep all drawing within the logical canvas {logical[0]}x{logical[1]}.
Make this a real animated action with anticipation, easing, follow-through and secondary
motion. Compose foreground/midground/background where useful. Avoid generic placeholder
geometry. Do not render narration or subtitles.
STYLE: {style_id}
VISUAL BIBLE:
{json.dumps(visual_bible, ensure_ascii=False)}
SHOT:
{json.dumps(scene, ensure_ascii=False)}
SHOT WINDOW: {start_s:.3f}s to {end_s:.3f}s; local duration {end_s-start_s:.3f}s.
""".strip()
            async with semaphore:
                effort = coding_effort(scene, project, "medium", "max")
                body = await self._validated_fragment(
                    "You are a senior Canvas 2D animation programmer. Return strict JSON only.",
                    shot_prompt + "\\n\\nWrite the complete draw_body now.",
                    min(self.max_output_tokens, 10000), "draw_body",
                    f"Shot {scene['index'] + 1}", MAX_SHOT_SOURCE, effort,
                )
            return {
                "index": scene["index"],
                "start_frame": scene["start_frame"],
                "end_frame": scene["end_frame"],
                "name": str(scene.get("purpose", f"Shot {scene['index'] + 1}"))[:80],
                "draw_body": body,
                "transition_out": str(scene.get("transition_out", "cut")).lower(),
            }

        compiled = await asyncio.gather(*(compile_one(scene) for scene in scenes))
        compiled, review_summary = await self._review_and_repair_shots(
            compiled, scenes, visual_bible, style_id, logical
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
            "quality_review": review_summary,
        }


    async def _review_and_repair_shots(
        self,
        shots: list[dict[str, Any]],
        scenes: list[dict[str, Any]],
        visual_bible: dict[str, Any],
        style_id: str,
        logical: list[int],
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """Review shot source and repair only shots with actionable defects.

        This is source-level review, not rendered-frame or visual QA.
        """
        if not self.enable_shot_review:
            return shots, {
                "mode": "disabled", "shots_reviewed": 0, "passed": 0,
                "repaired": 0, "skipped": len(shots), "issues": [],
            }
        semaphore = asyncio.Semaphore(self.max_parallel_shots)
        scene_by_index = {scene["index"]: scene for scene in scenes}

        async def review_one(shot: dict[str, Any]) -> dict[str, Any]:
            scene = scene_by_index[shot["index"]]
            body = shot["draw_body"]
            prompt = f"""
You are a strict source-code reviewer for a generated 2D Canvas animation shot.
Review the supplied JavaScript drawing body against the shot brief and visual bible.
You cannot see rendered frames. Do not claim to assess visual appearance; assess only
source-level correctness and likely drawing defects.

Check for: missing or ineffective visible action; missing background or composition;
broken/imbalanced Canvas save/restore state; use of undeclared character/prop helper IDs;
inconsistent use of the shared character drawing functions; unsupported APIs; use of
browser/Node/network/time/random APIs; obvious unbounded loops; drawing outside the
logical canvas {logical[0]}x{logical[1]}; failure to use deterministic time t; and
style helper misuse. Do not demand a background if the shot intentionally continues a
continuous environment and the code clearly paints that environment.

Return strict JSON:
{{"status":"pass"|"repair","issues":["short actionable defect"],"repaired_draw_body":"complete replacement body or empty string"}}
Use status=pass and an empty repaired_draw_body when no material defect is found.
Use status=repair only for concrete defects that can be fixed without changing the story,
character identity, shot purpose, or style. Preserve all useful animation detail.
Do not add external assets, imports, DOM, WebGL or 3D.
STYLE: {style_id}
VISUAL BIBLE:
{json.dumps(visual_bible, ensure_ascii=False)}
SHOT BRIEF:
{json.dumps(scene, ensure_ascii=False)}
CURRENT DRAW BODY:
{body}
""".strip()
            async with semaphore:
                try:
                    result = await self._json_completion(
                        "You are a conservative JavaScript animation code reviewer. Return strict JSON only.",
                        prompt,
                        min(self.max_output_tokens, 10000), "medium",
                    )
                    status = result.get("status")
                    issues = result.get("issues", [])
                    if not isinstance(issues, list):
                        issues = []
                    issues = [str(x)[:240] for x in issues[:8]]
                    if status != "repair":
                        return {**shot, "review_status": "passed", "review_issues": issues}
                    repaired = validate_generated_fragment(
                        result.get("repaired_draw_body"),
                        f"Repaired shot {shot['index'] + 1}",
                        MAX_SHOT_SOURCE,
                    )
                    return {
                        **shot, "draw_body": repaired, "review_status": "repaired",
                        "review_issues": issues,
                    }
                except Exception as exc:
                    return {
                        **shot, "review_status": "skipped",
                        "review_issues": [f"Review unavailable: {type(exc).__name__}"],
                    }

        reviewed = await asyncio.gather(*(review_one(shot) for shot in shots))
        counts = {
            "passed": sum(x["review_status"] == "passed" for x in reviewed),
            "repaired": sum(x["review_status"] == "repaired" for x in reviewed),
            "skipped": sum(x["review_status"] == "skipped" for x in reviewed),
        }
        return reviewed, {
            "mode": "source_only",
            "shots_reviewed": len(reviewed) - counts["skipped"],
            **counts,
            "issues": [
                {"shot": x["index"] + 1, "status": x["review_status"], "items": x["review_issues"]}
                for x in reviewed if x["review_issues"]
            ],
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
