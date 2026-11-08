import asyncio
import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("shortclipr.renderer")


class NonRetryableRenderError(RuntimeError):
    """A render input or worker configuration cannot succeed on retry."""


class RevideoRenderer:
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
        revideo_path = self.renderer_root / "node_modules" / "@revideo" / "renderer"
        if not revideo_path.is_dir():
            raise RuntimeError(f"Revideo package is missing: {revideo_path}")
        required_binaries = {"node": self.node_path, "ffmpeg": self.ffmpeg_path, "chromium": self.chromium_path}
        missing = [label for label, path in required_binaries.items() if Path(path).is_absolute() and not Path(path).is_file()]
        if missing:
            raise RuntimeError(f"Renderer binaries are missing: {', '.join(missing)}")
        logger.info(
            "renderer.preflight.ok",
            extra={"renderer_root": str(self.renderer_root), "revideo_path": str(revideo_path), **required_binaries},
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
            for field in ("headline", "caption", "primary_value", "visual_family", "motion", "background"):
                if not isinstance(animation.get(field), str):
                    raise NonRetryableRenderError(f"Scene {index} animation field {field} is invalid")
            if not isinstance(animation.get("density"), (int, float)) or animation["density"] < 1:
                raise NonRetryableRenderError(f"Scene {index} has invalid animation density")
        audio_path = plan.get("audioPath")
        if audio_path:
            audio = Path(audio_path)
            if not audio.is_file() or audio.stat().st_size == 0:
                raise NonRetryableRenderError("Narration audio is missing or empty")

    async def render(self, plan: dict[str, Any], output_path: Path) -> Path:
        self.validate_plan(plan)
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
            stdout, stderr = await process.communicate()
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
                raise RuntimeError(f"Revideo failed (exit {process.returncode}): {detail[-1500:]}")
            size_mb = round(output_path.stat().st_size / 1_048_576, 2) if output_path.exists() else None
            logger.info(
                "renderer.subprocess.done",
                extra={"duration_ms": duration_ms, "output_size_mb": size_mb},
            )
            return output_path
        finally:
            plan_path.unlink(missing_ok=True)
