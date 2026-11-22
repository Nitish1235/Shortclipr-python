"""Drawn-by-Code renderer adapter for ShortClipr's FFmpeg worker."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import signal
import tempfile
import time
from collections import deque
from pathlib import Path
from typing import Any, Awaitable, Callable

logger = logging.getLogger("shortclipr.drawn_by_code")


class NonRetryableRenderError(RuntimeError):
    """Generated source or render input cannot succeed on retry."""


class DrawnByCodeRenderer:
    def __init__(self):
        self.root = Path(os.getenv("DRAWN_BY_CODE_ROOT", "/app/drawn_by_code"))
        self.node = os.getenv("NODE_BINARY", shutil.which("node") or "node")
        self.ffmpeg = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
        self.chrome = os.getenv("CHROME_PATH", shutil.which("chromium") or "chromium")
        self.timeout = max(60, int(os.getenv("DRAWN_BY_CODE_RENDER_TIMEOUT", "1400")))
        self.syntax_timeout = max(5, int(os.getenv("DRAWN_BY_CODE_SYNTAX_TIMEOUT", "30")))
        self.widths = {"9:16": 1080, "1:1": 1080, "16:9": 1920}

    @staticmethod
    def _format_output_tail(lines: list[str], max_chars: int = 4000) -> str:
        """Return a bounded diagnostic tail without retaining the full subprocess log."""
        value = "\n".join(lines)[-max_chars:]
        return value or "no subprocess output"

    @staticmethod
    async def _kill_and_wait(process: asyncio.subprocess.Process) -> None:
        # start_new_session=True makes pid the process-group ID. Kill the
        # whole group even if Node already exited, because FFmpeg/Chromium
        # children can outlive their parent after an abnormal exit.
        if os.name == "posix":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except OSError:
                if process.returncode is None:
                    try:
                        process.kill()
                    except ProcessLookupError:
                        pass
        elif process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        try:
            await process.wait()
        except ProcessLookupError:
            pass

    async def preflight(self) -> dict[str, str]:
        required = [
            self.root / "engine" / "render.mjs",
            self.root / "engine" / "browser.mjs",
            self.root / "engine" / "player.html",
            self.root / "engine" / "core.js",
            self.root / "node_modules" / "playwright-core",
        ]
        missing = [str(path) for path in required if not path.exists()]
        for label, binary in (("node", self.node), ("chromium", self.chrome), ("ffmpeg", self.ffmpeg)):
            resolved = binary if Path(binary).is_absolute() else shutil.which(binary)
            if not resolved or not Path(resolved).is_file():
                missing.append(f"{label}: {binary}")
        if missing:
            raise RuntimeError("Drawn-by-Code preflight failed: " + ", ".join(missing))
        return {"engine_root": str(self.root), "node": self.node, "chromium": self.chrome, "ffmpeg": self.ffmpeg}

    async def render(
        self,
        plan: dict[str, Any],
        output_path: Path,
        progress_callback: Callable[[int], Awaitable[None]] | None = None,
    ) -> Path:
        source = plan.get("scene_js")
        aspect = plan.get("aspectRatio")
        if not isinstance(source, str) or not source:
            raise NonRetryableRenderError("Missing DeepSeek-generated scene_js program")
        if aspect not in self.widths:
            raise NonRetryableRenderError(f"Unsupported aspect ratio: {aspect}")

        work = Path(tempfile.mkdtemp(prefix="shortclipr-dbc-"))
        output_tail: deque[str] = deque(maxlen=40)
        started = time.monotonic()
        try:
            scene_dir = work / "film"
            scene_dir.mkdir()
            scene_file = scene_dir / "scene.js"
            scene_file.write_text(source, encoding="utf-8")

            syntax = await asyncio.create_subprocess_exec(
                self.node, "--check", str(scene_file),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                start_new_session=(os.name == "posix"),
            )
            try:
                _, syntax_error = await asyncio.wait_for(syntax.communicate(), timeout=self.syntax_timeout)
            except asyncio.TimeoutError as error:
                await self._kill_and_wait(syntax)
                raise NonRetryableRenderError(
                    f"Generated animation JavaScript syntax check exceeded {self.syntax_timeout}s"
                ) from error
            except asyncio.CancelledError:
                await self._kill_and_wait(syntax)
                raise
            if syntax.returncode != 0:
                raise NonRetryableRenderError(
                    "Generated animation JavaScript is invalid: "
                    + syntax_error.decode(errors="replace")[-1200:]
                )

            (scene_dir / "drawn-by-code.json").write_text(
                json.dumps({"version": 1, "generator": "shortclipr"}), encoding="utf-8",
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            env = os.environ.copy()
            env.update({"CHROME_PATH": self.chrome, "FFMPEG_PATH": self.ffmpeg, "NODE_ENV": "production"})
            command = [
                self.node, str(self.root / "engine" / "render.mjs"), str(scene_file),
                "--size", str(self.widths[aspect]), "--out", str(output_path), "--crf", "18",
            ]
            proc = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(self.root),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
            )
            deadline = asyncio.get_running_loop().time() + self.timeout
            try:
                assert proc.stdout is not None
                while True:
                    remaining = deadline - asyncio.get_running_loop().time()
                    if remaining <= 0:
                        raise asyncio.TimeoutError
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=remaining)
                    if not line:
                        break
                    message = line.decode(errors="replace").strip()
                    if not message:
                        continue
                    output_tail.append(message[-1000:])

                    progress = None
                    try:
                        event = json.loads(message)
                        if event.get("event") == "drawn_by_code.progress":
                            raw_progress = event.get("progress")
                            if isinstance(raw_progress, (int, float)):
                                progress = max(0, min(100, round(raw_progress)))
                    except (ValueError, TypeError, AttributeError):
                        pass

                    logger.info(
                        "drawn_by_code.output",
                        extra={"line": message[-700:], "progress": progress},
                    )
                    if progress is not None and progress_callback is not None:
                        try:
                            await progress_callback(progress)
                        except Exception:
                            logger.exception("drawn_by_code.progress_callback_failed")

                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise asyncio.TimeoutError
                code = await asyncio.wait_for(proc.wait(), timeout=remaining)
            except asyncio.TimeoutError as error:
                await self._kill_and_wait(proc)
                tail = self._format_output_tail(list(output_tail))
                duration_ms = round((time.monotonic() - started) * 1000)
                logger.error("drawn_by_code.process.timeout", extra={
                    "project_id": plan.get("projectId"),
                    "aspect_ratio": aspect,
                    "duration_seconds": plan.get("durationSeconds"),
                    "timeout_seconds": self.timeout,
                    "duration_ms": duration_ms,
                    "output_tail": tail,
                })
                raise RuntimeError(
                    f"Drawn-by-Code render exceeded {self.timeout}s timeout; last subprocess output:\n{tail}"
                ) from error
            except asyncio.CancelledError:
                await self._kill_and_wait(proc)
                raise
            except Exception:
                await self._kill_and_wait(proc)
                raise

            duration_ms = round((time.monotonic() - started) * 1000)
            if code != 0:
                await self._kill_and_wait(proc)
                tail = self._format_output_tail(list(output_tail))
                output_exists = output_path.is_file()
                output_size = output_path.stat().st_size if output_exists else 0
                logger.error("drawn_by_code.process.failed", extra={
                    "project_id": plan.get("projectId"),
                    "aspect_ratio": aspect,
                    "duration_seconds": plan.get("durationSeconds"),
                    "exit_code": code,
                    "duration_ms": duration_ms,
                    "source_chars": len(source),
                    "output_exists": output_exists,
                    "output_size_bytes": output_size,
                    "output_tail": tail,
                })
                output_path.unlink(missing_ok=True)
                detail = f"Drawn-by-Code exited with code {code}; last subprocess output:\n{tail}"
                lowered_tail = tail.lower()
                if "[page error]" in lowered_tail or "error(s) in the page" in lowered_tail:
                    raise NonRetryableRenderError(
                        "Generated animation triggered a deterministic browser error: " + detail[-1800:]
                    )
                raise RuntimeError(detail)

            if not output_path.is_file() or output_path.stat().st_size < 1024:
                tail = self._format_output_tail(list(output_tail))
                logger.error("drawn_by_code.output.invalid", extra={
                    "project_id": plan.get("projectId"),
                    "duration_ms": duration_ms,
                    "output_exists": output_path.is_file(),
                    "output_size_bytes": output_path.stat().st_size if output_path.is_file() else 0,
                    "output_tail": tail,
                })
                raise RuntimeError(
                    "Drawn-by-Code produced no valid MP4; last subprocess output:\n" + tail
                )

            if progress_callback:
                try:
                    await progress_callback(100)
                except Exception:
                    logger.exception("drawn_by_code.progress_callback_failed")
            return output_path
        except asyncio.CancelledError:
            output_path.unlink(missing_ok=True)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
