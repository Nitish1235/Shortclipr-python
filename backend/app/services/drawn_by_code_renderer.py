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

from .animation_contracts import find_unresolved_film_draw_helpers

logger = logging.getLogger("shortclipr.drawn_by_code")


class NonRetryableRenderError(RuntimeError):
    """Generated source or render input cannot succeed on retry."""


class DrawnByCodeRenderer:
    def __init__(self):
        self.root = Path(os.getenv("DRAWN_BY_CODE_ROOT", "/app/drawn_by_code"))
        self.node = os.getenv("NODE_BINARY", shutil.which("node") or "node")
        self.ffmpeg = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
        self.ffprobe = os.getenv("FFPROBE_PATH", shutil.which("ffprobe") or "ffprobe")
        self.chrome = os.getenv("CHROME_PATH", shutil.which("chromium") or "chromium")
        self.timeout = max(60, int(os.getenv("DRAWN_BY_CODE_RENDER_TIMEOUT", "1100")))
        self.syntax_timeout = max(5, int(os.getenv("DRAWN_BY_CODE_SYNTAX_TIMEOUT", "30")))
        self.widths = {"9:16": 1080, "1:1": 1080, "16:9": 1920}

    @staticmethod
    def _format_output_tail(lines: list[str], max_chars: int = 4000) -> str:
        """Return a bounded diagnostic tail without retaining the full subprocess log."""
        value = "\n".join(lines)[-max_chars:]
        return value or "no subprocess output"

    @staticmethod
    def _validate_generated_helpers(source: str) -> None:
        unresolved_helpers = find_unresolved_film_draw_helpers(source)
        if unresolved_helpers:
            raise NonRetryableRenderError(
                "Generated animation references drawing helpers that are not defined "
                "in the shared runtime scope: " + ", ".join(unresolved_helpers)
            )

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

    async def _preflight_command(
        self, label: str, *command: str, cwd: Path | None = None,
        env: dict[str, str] | None = None, timeout: int = 15,
    ) -> str:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd) if cwd else None,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=(os.name == "posix"),
        )
        try:
            output, _ = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            await self._kill_and_wait(process)
            raise
        if process.returncode != 0:
            raise RuntimeError(
                f"Drawn-by-Code startup smoke test failed ({label}): "
                + output.decode(errors="replace")[-1200:]
            )
        return output.decode(errors="replace").strip().splitlines()[0][:240] if output else "ok"

    async def preflight(self) -> dict[str, str]:
        required = [
            self.root / "engine" / "render.mjs",
            self.root / "engine" / "browser.mjs",
            self.root / "engine" / "player.html",
            self.root / "engine" / "core.js",
            self.root / "node_modules" / "playwright-core",
        ]
        missing = [str(path) for path in required if not path.exists()]
        binaries = (
            ("node", self.node), ("chromium", self.chrome),
            ("ffmpeg", self.ffmpeg), ("ffprobe", self.ffprobe),
        )
        resolved: dict[str, str] = {}
        for label, binary in binaries:
            path = binary if Path(binary).is_absolute() else shutil.which(binary)
            if not path or not Path(path).is_file():
                missing.append(f"{label}: {binary} (not found or not a file)")
            else:
                resolved[label] = path
        if missing:
            raise RuntimeError("Drawn-by-Code preflight failed: " + ", ".join(missing))

        env = os.environ.copy()
        env.update({
            "CHROME_PATH": resolved["chromium"],
            "FFMPEG_PATH": resolved["ffmpeg"],
            "FFPROBE_PATH": resolved["ffprobe"],
        })
        versions = {
            "node": await self._preflight_command("Node", resolved["node"], "--version", timeout=10),
            "chromium": await self._preflight_command("Chromium", resolved["chromium"], "--version", timeout=10),
            "ffmpeg": await self._preflight_command("FFmpeg", resolved["ffmpeg"], "-version", timeout=10),
            "ffprobe": await self._preflight_command("ffprobe", resolved["ffprobe"], "-version", timeout=10),
        }
        browser_smoke = (
            "import { chromium } from 'playwright-core';"
            "const browser = await chromium.launch({headless:true,"
            "executablePath:process.env.CHROME_PATH,"
            "args:['--no-sandbox','--disable-dev-shm-usage']});"
            "try { const page = await browser.newPage();"
            "await page.setContent('<!doctype html><title>shortclipr-preflight</title>');"
            "if (await page.title() !== 'shortclipr-preflight') throw new Error('page smoke test failed');"
            "} finally { await browser.close(); }"
        )
        await self._preflight_command(
            "Playwright/Chromium launch", resolved["node"], "--input-type=module", "-e",
            browser_smoke, cwd=self.root, env=env, timeout=25,
        )
        return {
            "engine_root": str(self.root),
            "node": resolved["node"],
            "chromium": resolved["chromium"],
            "ffmpeg": resolved["ffmpeg"],
            "ffprobe": resolved["ffprobe"],
            "node_version": versions["node"],
            "chromium_version": versions["chromium"],
            "ffmpeg_version": versions["ffmpeg"],
            "ffprobe_version": versions["ffprobe"],
            "browser_smoke": "passed",
        }

    @staticmethod
    def _motion_qa_samples(shot_manifest: Any) -> list[dict[str, Any]]:
        """Choose three interior frames per shot, away from transition boundaries."""
        if not isinstance(shot_manifest, list):
            return []
        samples: list[dict[str, Any]] = []
        seen: set[int] = set()
        valid_shots = 0
        for shot in shot_manifest:
            if valid_shots >= 12:
                break
            if not isinstance(shot, dict):
                continue
            start, end = shot.get("start_frame"), shot.get("end_frame")
            if (isinstance(start, bool) or not isinstance(start, int)
                    or isinstance(end, bool) or not isinstance(end, int)
                    or start < 0 or end <= start):
                continue
            valid_shots += 1
            span = max(0, end - start - 1)
            shot_samples = []
            for fraction in (0.15, 0.5, 0.85):
                frame = min(end - 1, start + round(span * fraction))
                if frame not in seen:
                    seen.add(frame)
                    shot_samples.append({
                        "sample_index": len(samples) + len(shot_samples),
                        "frame": frame,
                        "time_seconds": round(frame / 30, 6),
                        "shot_index": shot.get("index"),
                        "shot_name": str(shot.get("name", ""))[:80],
                        "mechanism_ids": shot.get("mechanism_ids", []),
                    })
            samples.extend(shot_samples)
        return samples

    async def _build_motion_contact_sheet(self, frames_dir: Path, output_path: Path, frame_count: int) -> None:
        """Build a compact private review sheet from the captured PNGs."""
        columns = 3
        rows = max(1, (frame_count + columns - 1) // columns)
        vf = (
            "scale=320:568:force_original_aspect_ratio=decrease,"
            "pad=320:568:(ow-iw)/2:(oh-ih)/2,"
            f"tile={columns}x{rows}:padding=12:margin=12"
        )
        process = await asyncio.create_subprocess_exec(
            self.ffmpeg, "-y", "-v", "error", "-framerate", "1",
            "-pattern_type", "glob", "-i", str(frames_dir / "q_*.png"),
            "-vf", vf, "-frames:v", "1", "-update", "1", str(output_path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            start_new_session=(os.name == "posix"),
        )
        try:
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=self.syntax_timeout)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            await self._kill_and_wait(process)
            raise
        if process.returncode != 0 or not output_path.is_file() or output_path.stat().st_size < 256:
            raise RuntimeError(
                "Motion QA contact sheet failed: " + stderr.decode(errors="replace")[-1000:]
            )

    async def render(
        self,
        plan: dict[str, Any],
        output_path: Path,
        progress_callback: Callable[[int], Awaitable[None]] | None = None,
        deadline: float | None = None,
    ) -> tuple[Path, dict[str, Any] | None]:
        source = plan.get("scene_js")
        aspect = plan.get("aspectRatio")
        if not isinstance(source, str) or not source:
            raise NonRetryableRenderError("Missing DeepSeek-generated scene_js program")

        self._validate_generated_helpers(source)
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
            motion_samples = self._motion_qa_samples(plan.get("shot_manifest"))
            qa_frames_dir = scene_dir / "out" / "motion-qa"
            if motion_samples:
                command.extend([
                    "--qa-at", ",".join(f"{item['time_seconds']:.6f}" for item in motion_samples),
                    "--qa-out", str(qa_frames_dir),
                ])
            proc = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(self.root),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,
            )
            render_deadline = asyncio.get_running_loop().time() + self.timeout
            if deadline is not None:
                render_deadline = min(render_deadline, deadline)
            if render_deadline <= asyncio.get_running_loop().time():
                raise RuntimeError("Render stage deadline expired before Chromium launch")
            try:
                assert proc.stdout is not None
                while True:
                    remaining = render_deadline - asyncio.get_running_loop().time()
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

                remaining = render_deadline - asyncio.get_running_loop().time()
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

            motion_qa = None
            if motion_samples:
                contact_sheet_path = output_path.with_name(output_path.stem + ".motion-qa.png")
                motion_qa = {
                    "status": "captured",
                    "sample_count": len(motion_samples),
                    "samples": motion_samples,
                    "contact_sheet_path": str(contact_sheet_path),
                }
                try:
                    captured = list(qa_frames_dir.glob("q_*.png"))
                    if len(captured) != len(motion_samples):
                        raise RuntimeError(
                            f"Expected {len(motion_samples)} QA frames, found {len(captured)}"
                        )
                    await self._build_motion_contact_sheet(
                        qa_frames_dir, contact_sheet_path, len(captured),
                    )
                except Exception as error:
                    contact_sheet_path.unlink(missing_ok=True)
                    motion_qa["status"] = "capture_incomplete"
                    motion_qa["error"] = str(error)[:500]
                    motion_qa.pop("contact_sheet_path", None)
                    logger.warning("drawn_by_code.motion_qa.failed", extra={
                        "project_id": plan.get("projectId"),
                        "error": str(error)[:500],
                    })

            if progress_callback:
                try:
                    await progress_callback(100)
                except Exception:
                    logger.exception("drawn_by_code.progress_callback_failed")
            return output_path, motion_qa
        except asyncio.CancelledError:
            output_path.unlink(missing_ok=True)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)
