import asyncio
import json
import os
import tempfile
from pathlib import Path
from typing import Any


class RevideoRenderer:
    def __init__(self, renderer_root: str = "/app/renderer"):
        self.renderer_root = Path(os.getenv("RENDERER_ROOT", renderer_root))

    async def render(self, plan: dict[str, Any], output_path: Path) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
            json.dump(plan, handle)
            plan_path = Path(handle.name)
        try:
            process = await asyncio.create_subprocess_exec(
                "npm", "run", "render", "--", str(plan_path), str(output_path),
                cwd=self.renderer_root,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "DISABLE_TELEMETRY": "true"},
            )
            stdout, stderr = await process.communicate()
            if process.returncode:
                raise RuntimeError(f"Revideo failed: {stderr.decode(errors='replace')[-4000:]}")
            return output_path
        finally:
            plan_path.unlink(missing_ok=True)
