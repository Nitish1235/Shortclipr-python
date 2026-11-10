import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, Awaitable, Callable

logger = logging.getLogger("shortclipr.renderer")

SUPPORTED_VISUAL_FAMILIES = {
    "typography", "diagram", "orbit", "bars", "timeline", "particles",
    "split", "counter", "bridge", "wave", "map", "mechanism",
}


class NonRetryableRenderError(RuntimeError):
    """A render input or worker configuration cannot succeed on retry."""


class RemotionRenderer:
    def __init__(self, renderer_root: str = "/app/renderer"):
        self.renderer_root = Path(os.getenv("RENDERER_ROOT", renderer_root))
        self.node_path = os.getenv("NODE_BINARY", shutil.which("node") or "node")
        self.ffmpeg_path = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
        self.chromium_path = os.getenv("PUPPETEER_EXECUTABLE_PATH", shutil.which("chromium") or "chromium")
        self.tsx_path = self.renderer_root / "node_modules" / "tsx" / "dist" / "cli.mjs"

    async def preflight(self) -> dict[str, str]:
        """Validate packaged renderer files without blocking Cloud Run startup."""
        if not self.renderer_root.is_dir():
            raise RuntimeError(f"Renderer root does not exist: {self.renderer_root}")
        if not self.tsx_path.is_file():
            raise RuntimeError(f"Renderer TypeScript runner is missing: {self.tsx_path}")
        remotion_path = self.renderer_root / "node_modules" / "@remotion" / "renderer"
        bundler_path = self.renderer_root / "node_modules" / "@remotion" / "bundler"
        core_path = self.renderer_root / "node_modules" / "remotion"
        if not remotion_path.is_dir() or not bundler_path.is_dir() or not core_path.is_dir():
            raise RuntimeError(f"Remotion packages are missing: {core_path}, {remotion_path}, {bundler_path}")
        required_binaries = {"node": self.node_path, "ffmpeg": self.ffmpeg_path, "chromium": self.chromium_path}
        missing = [label for label, path in required_binaries.items() if Path(path).is_absolute() and not Path(path).is_file()]
        if missing:
            raise RuntimeError(f"Renderer binaries are missing: {', '.join(missing)}")
        logger.info(
            "renderer.preflight.ok",
            extra={"renderer_root": str(self.renderer_root), "remotion_path": str(remotion_path), **required_binaries},
        )
        return required_binaries

    def validate_plan(self, plan: dict[str, Any]) -> None:
        allowed_ratios = {"9:16", "1:1", "16:9"}
        if plan.get("aspectRatio") not in allowed_ratios:
            raise NonRetryableRenderError(f"Unsupported aspect ratio: {plan.get('aspectRatio')}")
        if not isinstance(plan.get("scenes"), list) or not plan["scenes"]:
            raise NonRetryableRenderError("Render plan contains no scenes")
        if not isinstance(plan.get("durationSeconds"), (int, float)) or plan["durationSeconds"] <= 0:
            raise NonRetryableRenderError("Render plan has an invalid duration")
        for index, scene in enumerate(plan["scenes"]):
            if not isinstance(scene, dict) or not isinstance(scene.get("animation"), dict):
                raise NonRetryableRenderError(f"Scene {index} has no renderable animation program")
            animation = scene["animation"]
            visual_family = animation.get("visual_family")
            if visual_family not in SUPPORTED_VISUAL_FAMILIES:
                raise NonRetryableRenderError(
                    f"Scene {index} requests unsupported visual family: {visual_family!r}"
                )
            for field in ("headline", "caption", "primary_value", "visual_family", "motion", "background"):
                if not isinstance(animation.get(field), str):
                    raise NonRetryableRenderError(f"Scene {index} animation field {field} is invalid")
            if not isinstance(animation.get("objects"), list) or len(animation["objects"]) < 2:
                raise NonRetryableRenderError(f"Scene {index} has fewer than two concrete visual objects")
            if not isinstance(animation.get("events"), list) or not animation["events"]:
                raise NonRetryableRenderError(f"Scene {index} has no visual events")
            if not isinstance(animation.get("density"), (int, float)) or animation["density"] < 1:
                raise NonRetryableRenderError(f"Scene {index} has invalid animation density")

    async def _consume_output(
        self,
        stream: asyncio.StreamReader,
        stream_name: str,
        progress_callback: Callable[[int], Awaitable[None]] | None = None,
    ) -> bytes:
        chunks: list[bytes] = []
        last_progress = -1
        async for raw_line in stream:
            chunks.append(raw_line)
            line = raw_line.decode(errors="replace").strip()
            if not line:
                continue
            # Remotion prints structured progress on stdout. Keep the worker
            # log useful without emitting every frame update.
            progress = None
            if '"event":"remotion.render.progress"' in line:
                try:
                    payload = json.loads(line)
                    raw_progress = payload.get("overallProgress", payload.get("progress"))
                    if isinstance(raw_progress, (int, float)):
                        progress = round(raw_progress * 100) if raw_progress <= 1 else round(raw_progress)
                except (TypeError, ValueError, json.JSONDecodeError):
                    progress = None
            if progress is not None and progress < last_progress + 5 and progress != 100:
                continue
            if progress is not None:
                last_progress = progress
                if progress_callback is not None and stream_name == "stdout":
                    try:
                        await progress_callback(progress)
                    except Exception:
                        logger.exception("renderer.progress_callback.failed")
            logger.info(
                "renderer.subprocess.output",
                extra={"stream": stream_name, "line": line[-500:], "progress": progress},
            )
        return b"".join(chunks)

    async def render(
        self,
        plan: dict[str, Any],
        output_path: Path,
        progress_callback: Callable[[int], Awaitable[None]] | None = None,
    ) -> Path:
        self.validate_plan(plan)
        logger.info(
            "renderer.plan.accepted",
            extra={
                "project_id": plan.get("projectId"),
                "scene_count": len(plan["scenes"]),
                "visual_families": [scene["animation"]["visual_family"] for scene in plan["scenes"]],
                "scene_ranges": [
                    {"index": scene.get("index"), "start": scene.get("start_frame"), "end": scene.get("end_frame")}
                    for scene in plan["scenes"]
                ],
            },
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
            json.dump(plan, handle)
            plan_path = Path(handle.name)
        t0 = time.monotonic()
        try:
            process = await asyncio.create_subprocess_exec(
                self.node_path, str(self.tsx_path), "src/render.ts", str(plan_path), str(output_path),
                cwd=self.renderer_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "DISABLE_TELEMETRY": "true"},
            )
            timeout_seconds = max(60, int(os.getenv("RENDER_TIMEOUT_SECONDS", "900")))
            logger.info(
                "renderer.subprocess.start",
                extra={"pid": process.pid, "timeout_seconds": timeout_seconds, "output": str(output_path)},
            )
            stdout_task = asyncio.create_task(self._consume_output(process.stdout, "stdout", progress_callback))
            stderr_task = asyncio.create_task(self._consume_output(process.stderr, "stderr"))
            try:
                await asyncio.wait_for(
                    asyncio.gather(process.wait(), stdout_task, stderr_task),
                    timeout=timeout_seconds,
                )
                stdout, stderr = stdout_task.result(), stderr_task.result()
            except asyncio.TimeoutError as error:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                await process.wait()
                stdout, stderr = await asyncio.gather(stdout_task, stderr_task)
                detail = (stderr.decode(errors="replace").strip() or stdout.decode(errors="replace").strip())[-1500:]
                logger.error(
                    "renderer.subprocess.timeout",
                    extra={"timeout_seconds": timeout_seconds, "detail": detail},
                )
                raise RuntimeError(
                    f"Remotion timed out after {timeout_seconds}s" + (f": {detail}" if detail else "")
                ) from error
            duration_ms = round((time.monotonic() - t0) * 1000)
            if process.returncode:
                stderr_tail = stderr.decode(errors="replace")[-4000:]
                stdout_tail = stdout.decode(errors="replace")[-1000:]
                detail = stderr_tail.strip() or stdout_tail.strip() or "no subprocess output"
                logger.error(
                    f"renderer.subprocess.failed: {detail[-1500:]}",
                    extra={
                        "duration_ms": duration_ms,
                        "returncode": process.returncode,
                        "stderr_tail": stderr_tail[-1500:],
                        "stdout_tail": stdout_tail,
                    },
                )
                raise RuntimeError(f"Remotion failed (exit {process.returncode}): {detail[-1500:]}")
            size_mb = round(output_path.stat().st_size / 1_048_576, 2) if output_path.exists() else None
            logger.info(
                "renderer.subprocess.done",
                extra={"duration_ms": duration_ms, "output_size_mb": size_mb},
            )
            return output_path
        finally:
            plan_path.unlink(missing_ok=True)
