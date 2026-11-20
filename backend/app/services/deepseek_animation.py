"""DeepSeek full-film Canvas 2D animation code generator."""
from __future__ import annotations
import json, re
from typing import Any
from openai import AsyncOpenAI
from ..core.config import Settings

class DeepSeekAnimationCompiler:
    def __init__(self, settings: Settings):
        self.model = settings.DEEPSEEK_ANIMATION_MODEL
        self.reasoning_effort = settings.DEEPSEEK_REASONING_EFFORT
        self.max_output_tokens = settings.DEEPSEEK_MAX_OUTPUT_TOKENS
        self.client = AsyncOpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com",
            timeout=900.0, max_retries=2) if settings.DEEPSEEK_API_KEY else None

    async def compile(self, project: dict[str, Any], plan: dict[str, Any]) -> dict[str, str]:
        if self.client is None: raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        duration=int(project["duration_seconds"]); aspect=str(project["aspect_ratio"])
        logical={"9:16":[900,1600],"1:1":[1000,1000],"16:9":[1600,900]}.get(aspect)
        if logical is None: raise ValueError(f"Unsupported aspect ratio: {aspect}")
        prompt = f"""
You are ShortClipr's principal 2D animation director and creative-coding artist.
Create a COMPLETE, production-quality illustrated short film as executable JavaScript
for the supplied Drawn-by-Code Canvas 2D animation engine. It must look like a carefully
art-directed animated short, not generic motion graphics, a slideshow or placeholder shapes.

Return one JSON object: {{"style":"paper-cutout|risograph|comic|70s-poster|blueprint|line","scene_js":"complete JavaScript"}}.
The source must call Motion.scene({{...}}) exactly once and set fps:30, duration:{duration},
logical:{json.dumps(logical)}, shots:[...], draw(g,t,env){{...}}. Shots are [start,end,name]
ranges covering 0..{duration} with no gaps or overlaps.

ENGINE
- Motion and Ease are globals from engine/core.js. Available helpers include Motion.rng,
Motion.noise1, Motion.cam, Motion.shake, Motion.layer, Motion.drawLayer, Motion.quad,
Ease.seg, Ease.lerp, Ease.inOut, Ease.out, Ease.back, Ease.pop.
- Use CanvasRenderingContext2D, standard JS Math and deterministic pure functions.
- Redraw the complete frame from t each time. Never rely on previous frames.
- No imports, exports, JSX, TypeScript, DOM, network, file access, Node APIs, timers, eval,
Function, dynamic loading, Math.random, Date, external assets, WebGL, Three.js, meshes,
3D engines or photorealistic video techniques.
- Use one complete self-contained scene file. No Markdown fences.

ART DIRECTION AND CRAFT
- Choose one coherent style: paper cutout, risograph, hand-drawn comic, 70s poster,
blueprint or expressive line art. Use deliberate palette, material texture, shadows,
highlights, handmade irregularity and layered illustration.
- Draw recognisable topic-specific subjects with detail. People need heads, hair, faces,
clothing, limbs and readable poses; buildings need structure, windows and roofs; vehicles
need wheels and windows; landscapes need terrain; animals, machines and artefacts need
distinctive features. Do not substitute generic geometry for actual subjects.
- Define reusable drawing functions for recurring characters/objects. Keep identity,
clothing, proportions, colours, markings and screen direction consistent across shots.
- Use foreground, midground and background; perspective, parallax, lighting and camera
moves when appropriate. Compose shots differently and use motivated transitions.
- Animate meaningful actions: walk cycles, gestures, turning, operating, building, opening,
flowing, colliding, assembling, transforming, reacting and follow-through. Use anticipation,
easing, secondary motion and camera tracking.
- First second: strong visual hook. Middle: evolving visual cause/effect. End: resolved,
memorable composition. Avoid floating cards, random particles, generic circles/bars/graphs
unless topic genuinely requires them. Text supports illustration, not replaces it.
- Match visuals to supplied facts and narration. Do not invent historical or factual detail.
- Keep code performant; precompute static geometry outside draw where possible.
- Do not render narration transcripts or subtitles. Narration is muxed separately.
PROJECT:
__PROJECT__
STORY PLAN:
__PLAN__
Create 5–9 visually distinct shots across the duration. Return strict JSON only.
""".strip().replace("__PROJECT__",json.dumps(project,ensure_ascii=False,default=str)).replace("__PLAN__",json.dumps(plan,ensure_ascii=False,default=str))
        response=await self.client.chat.completions.create(model=self.model,
            messages=[{"role":"system","content":prompt},{"role":"user","content":"Generate the complete runnable animation program now. Follow every constraint."}],
            response_format={"type":"json_object"},max_tokens=self.max_output_tokens,
            extra_body={"thinking":{"type":"enabled"},"reasoning_effort":self.reasoning_effort})
        raw=response.choices[0].message.content
        if not raw: raise RuntimeError("DeepSeek returned an empty animation program")
        try: result=json.loads(raw)
        except json.JSONDecodeError as exc: raise RuntimeError("DeepSeek returned invalid JSON") from exc
        source=result.get("scene_js")
        if not isinstance(source,str): raise RuntimeError("DeepSeek response is missing scene_js")
        self.validate_source(source,duration,logical)
        return {"scene_js":source,"style":str(result.get("style","paper-cutout")),"model":self.model}

    @staticmethod
    def validate_source(source:str,duration:int,logical:list[int])->None:
        if not 300<=len(source)<=500000: raise ValueError("Generated animation source length is outside allowed bounds")
        if len(re.findall(r"\bMotion\s*\.\s*scene\s*\(",source))!=1: raise ValueError("Source must contain exactly one Motion.scene declaration")
        if not re.search(r"\bfps\s*:\s*30\b",source): raise ValueError("Animation source must declare fps: 30")
        if not re.search(rf"\bduration\s*:\s*{duration}(?:\.0+)?\b",source): raise ValueError(f"Animation source must declare duration: {duration}")
        compact=re.sub(r"\s+","",source)
        if f"logical:{json.dumps(logical,separators=(',',':'))}" not in compact: raise ValueError("Animation canvas does not match project aspect ratio")
        blocked=[r"\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\s*\(",r"\b(?:eval|Function)\s*\(",r"\b(?:process|require|globalThis|localStorage|sessionStorage|navigator|location)\b",r"\b(?:Date|performance)\s*\.",r"\bMath\s*\.\s*random\s*\(",r"\bimport\s*(?:\(|[('""{*])"]
        if any(re.search(p,source) for p in blocked): raise ValueError("Animation source contains a disallowed runtime capability")
