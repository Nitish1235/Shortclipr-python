"""Drawn-by-Code renderer adapter for ShortClipr's ffmpeg worker."""
from __future__ import annotations
import asyncio, json, logging, os, shutil, tempfile
from collections import deque
from pathlib import Path
from typing import Any, Awaitable, Callable
logger=logging.getLogger("shortclipr.drawn_by_code")
class NonRetryableRenderError(RuntimeError):
    """Generated source or render input cannot succeed on retry."""
class DrawnByCodeRenderer:
    def __init__(self):
        self.root=Path(os.getenv("DRAWN_BY_CODE_ROOT","/app/drawn_by_code"))
        self.node=os.getenv("NODE_BINARY",shutil.which("node") or "node")
        self.ffmpeg=os.getenv("FFMPEG_PATH",shutil.which("ffmpeg") or "ffmpeg")
        self.chrome=os.getenv("CHROME_PATH",shutil.which("chromium") or "chromium")
        self.timeout=int(os.getenv("DRAWN_BY_CODE_RENDER_TIMEOUT","1400"))
        self.widths={"9:16":1080,"1:1":1080,"16:9":1920}

    @staticmethod
    def _format_output_tail(lines: list[str], max_chars: int = 4000) -> str:
        """Return a bounded diagnostic tail without retaining the full subprocess log."""
        value = "\n".join(lines)[-max_chars:]
        return value or "no subprocess output"
    async def preflight(self)->dict[str,str]:
        required=[self.root/"engine"/"render.mjs",self.root/"engine"/"browser.mjs",self.root/"engine"/"player.html",self.root/"engine"/"core.js",self.root/"node_modules"/"playwright-core"]
        missing=[str(p) for p in required if not p.exists()]
        for label,binary in (("node",self.node),("chromium",self.chrome),("ffmpeg",self.ffmpeg)):
            if Path(binary).is_absolute() and not Path(binary).is_file(): missing.append(f"{label}: {binary}")
        if missing: raise RuntimeError("Drawn-by-Code preflight failed: "+", ".join(missing))
        return {"engine_root":str(self.root),"node":self.node,"chromium":self.chrome,"ffmpeg":self.ffmpeg}
    async def render(self,plan:dict[str,Any],output_path:Path,progress_callback:Callable[[int],Awaitable[None]]|None=None)->Path:
        source=plan.get("scene_js"); aspect=plan.get("aspectRatio")
        if not isinstance(source,str) or not source: raise NonRetryableRenderError("Missing DeepSeek-generated scene_js program")
        if aspect not in self.widths: raise NonRetryableRenderError(f"Unsupported aspect ratio: {aspect}")
        work=Path(tempfile.mkdtemp(prefix="shortclipr-dbc-")); scene_dir=work/"film"; scene_dir.mkdir()
        scene_file=scene_dir/"scene.js"; scene_file.write_text(source,encoding="utf-8")
        syntax=await asyncio.create_subprocess_exec(self.node,"--check",str(scene_file),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        _,syntax_error=await syntax.communicate()
        if syntax.returncode!=0:
            raise NonRetryableRenderError("Generated animation JavaScript is invalid: "+syntax_error.decode(errors="replace")[-1200:])
        (scene_dir/"drawn-by-code.json").write_text(json.dumps({"version":1,"generator":"shortclipr"}),encoding="utf-8")
        output_path.parent.mkdir(parents=True,exist_ok=True)
        env=os.environ.copy(); env.update({"CHROME_PATH":self.chrome,"FFMPEG_PATH":self.ffmpeg,"NODE_ENV":"production"})
        command=[self.node,str(self.root/"engine"/"render.mjs"),str(scene_file),"--size",str(self.widths[aspect]),"--out",str(output_path),"--crf","18"]
        output_tail: deque[str] = deque(maxlen=40)
        started = asyncio.get_running_loop().time()
        try:
            proc=await asyncio.create_subprocess_exec(*command,cwd=str(self.root),env=env,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT)
            try:
                assert proc.stdout is not None
                while True:
                    line=await asyncio.wait_for(proc.stdout.readline(),timeout=self.timeout)
                    if not line: break
                    msg=line.decode(errors="replace").strip()
                    if msg:
                        output_tail.append(msg[-1000:])
                        logger.info("drawn_by_code.output",extra={"line":msg[-700:]})
                code=await asyncio.wait_for(proc.wait(),timeout=self.timeout)
            except asyncio.TimeoutError as error:
                if proc.returncode is None:
                    proc.kill()
                await proc.wait()
                tail=self._format_output_tail(list(output_tail))
                duration_ms=round((asyncio.get_running_loop().time()-started)*1000)
                logger.error("drawn_by_code.process.timeout",extra={
                    "project_id":plan.get("projectId"),"aspect_ratio":aspect,
                    "duration_seconds":plan.get("durationSeconds"),"timeout_seconds":self.timeout,
                    "duration_ms":duration_ms,"output_tail":tail,
                })
                raise RuntimeError(
                    f"Drawn-by-Code render exceeded {self.timeout}s timeout; "
                    f"last subprocess output:\n{tail}"
                ) from error
            duration_ms=round((asyncio.get_running_loop().time()-started)*1000)
            if code!=0:
                tail=self._format_output_tail(list(output_tail))
                output_exists=output_path.is_file()
                output_size=output_path.stat().st_size if output_exists else 0
                logger.error("drawn_by_code.process.failed",extra={
                    "project_id":plan.get("projectId"),"aspect_ratio":aspect,
                    "duration_seconds":plan.get("durationSeconds"),"exit_code":code,
                    "duration_ms":duration_ms,"source_chars":len(source),
                    "output_exists":output_exists,"output_size_bytes":output_size,
                    "output_tail":tail,
                })
                raise RuntimeError(
                    f"Drawn-by-Code exited with code {code}; "
                    f"last subprocess output:\\n{tail}"
                )
            if not output_path.is_file() or output_path.stat().st_size<1024:
                tail=self._format_output_tail(list(output_tail))
                logger.error("drawn_by_code.output.invalid",extra={
                    "project_id":plan.get("projectId"),"duration_ms":duration_ms,
                    "output_exists":output_path.is_file(),
                    "output_size_bytes":output_path.stat().st_size if output_path.is_file() else 0,
                    "output_tail":tail,
                })
                raise RuntimeError("Drawn-by-Code produced no valid MP4; last subprocess output:\n"+tail)
            if progress_callback: await progress_callback(100)
            return output_path
        finally: shutil.rmtree(work,ignore_errors=True)
