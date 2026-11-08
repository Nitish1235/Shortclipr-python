import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("shortclipr.renderer")


class RevideoRenderer:
    def __init__(self, renderer_root: str = "/app/renderer"):
        self.renderer_root = Path(os.getenv("RENDERER_ROOT", renderer_root))

    async def render(self, plan: dict[str, Any], output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
            json.dump(plan, handle)
            plan_path = Path(handle.name)
        t0 = time.monotonic()
        try:
            process = await asyncio.create_subprocess_exec(
                "npm", "run", "render", "--", str(plan_path), str(output_path),
                cwd=self.renderer_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "DISABLE_TELEMETRY": "true"},
            )
            stdout, stderr = await process.communicate()
            duration_ms = round((time.monotonic() - t0) * 1000)
            if process.returncode:
                stderr_tail = stderr.decode(errors="replace")[-4000:]
                logger.error(
                    "renderer.subprocess.failed",
                    extra={"duration_ms": duration_ms, "returncode": process.returncode, "stderr_tail": stderr_tail[-500:]},
                )
                raise RuntimeError(f"Revideo failed: {stderr_tail}")
            size_mb = round(output_path.stat().st_size / 1_048_576, 2) if output_path.exists() else None
            logger.info(
                "renderer.subprocess.done",
                extra={"duration_ms": duration_ms, "output_size_mb": size_mb},
            )
            return output_path
        finally:
            plan_path.unlink(missing_ok=True)
