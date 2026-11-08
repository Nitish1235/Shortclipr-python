"""
Structured pipeline logger for ShortClipr.

In production (APP_ENV=production) every record is emitted as a single-line
JSON object that Cloud Logging parses natively.  In development the same
records are printed as coloured, human-readable text.

Usage
-----
    from .core.log import get_logger, bind, timed

    logger = get_logger(__name__)

    # Bind pipeline context at the start of a request handler.
    bind(project_id=str(project_id), attempt_id=str(attempt_id), job_class="api")

    # Wrap any awaitable to get .start / .done log lines with duration_ms.
    async with timed(logger, "planning.openai") as ctx:
        plan = await planner.plan(project)
        ctx["scene_count"] = len(plan["scenes"])   # extra fields on .done line
"""

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any, AsyncGenerator

# ---------------------------------------------------------------------------
# Pipeline context — stored per asyncio Task via ContextVar.
# Child tasks automatically inherit the parent's context.
# ---------------------------------------------------------------------------

_ctx_project_id: ContextVar[str] = ContextVar("sc_project_id", default="")
_ctx_attempt_id: ContextVar[str] = ContextVar("sc_attempt_id", default="")
_ctx_job_class: ContextVar[str] = ContextVar("sc_job_class", default="")


def bind(
    project_id: str = "",
    attempt_id: str = "",
    job_class: str = "",
) -> None:
    """Attach pipeline identifiers to the current async context."""
    if project_id:
        _ctx_project_id.set(project_id)
    if attempt_id:
        _ctx_attempt_id.set(attempt_id)
    if job_class:
        _ctx_job_class.set(job_class)


def _ctx_fields() -> dict[str, str]:
    fields: dict[str, str] = {}
    if pid := _ctx_project_id.get():
        fields["project_id"] = pid
    if aid := _ctx_attempt_id.get():
        fields["attempt_id"] = aid
    if jc := _ctx_job_class.get():
        fields["job_class"] = jc
    return fields


# ---------------------------------------------------------------------------
# Private log record attribute keys that must not be re-emitted as extras.
# ---------------------------------------------------------------------------
_SKIP_KEYS = frozenset({
    "args", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "message", "module", "msecs",
    "msg", "name", "pathname", "process", "processName", "relativeCreated",
    "stack_info", "taskName", "thread", "threadName",
})

# ---------------------------------------------------------------------------
# Service metadata
# ---------------------------------------------------------------------------
_SERVICE = os.getenv("SERVICE_ROLE", "api")
_IS_PROD = os.getenv("APP_ENV", "development").lower() == "production"

_LEVEL_COLOURS = {
    "DEBUG":    "\033[36m",
    "INFO":     "\033[32m",
    "WARNING":  "\033[33m",
    "ERROR":    "\033[31m",
    "CRITICAL": "\033[35m",
}
_RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    """Emit one JSON object per log record — Cloud Logging parses it natively."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        # formatTime gives e.g. "2026-11-08T04:32:16.123456" — trim to ms + Z
        ts = self.formatTime(record, "%Y-%m-%dT%H:%M:%S")
        ms = int(record.msecs)
        payload: dict[str, Any] = {
            "timestamp": f"{ts}.{ms:03d}Z",
            "severity": record.levelname,
            "service": _SERVICE,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge pipeline context (project_id, attempt_id, job_class).
        payload.update(_ctx_fields())
        # Merge caller-supplied extras (e.g. duration_ms, scene_count).
        for key, value in record.__dict__.items():
            if key not in _SKIP_KEYS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class _TextFormatter(logging.Formatter):
    """Human-readable coloured output for local development."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        colour = _LEVEL_COLOURS.get(record.levelname, "")
        ctx = _ctx_fields()
        # Abbreviate long UUIDs for readability.
        ctx_parts = [
            f"{k}={v[:8]}…" if len(v) > 12 else f"{k}={v}"
            for k, v in ctx.items()
        ]
        ctx_str = "  ".join(ctx_parts)
        base = f"{colour}{record.levelname:8}{_RESET} {record.name}  {record.getMessage()}"
        if ctx_str:
            base = f"{base}  [{ctx_str}]"
        extras = {
            k: v
            for k, v in record.__dict__.items()
            if k not in _SKIP_KEYS and not k.startswith("_")
        }
        if extras:
            base += "  " + "  ".join(f"{k}={v}" for k, v in extras.items())
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


# ---------------------------------------------------------------------------
# Public setup
# ---------------------------------------------------------------------------

def configure_logging(level: str = "INFO") -> None:
    """Install the ShortClipr formatter on the root logger.

    Call once at application startup — replaces logging.basicConfig().
    Safe to call multiple times (clears existing handlers first).
    """
    formatter: logging.Formatter = _JsonFormatter() if _IS_PROD else _TextFormatter()
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Silence noisy third-party loggers.
    for noisy in ("urllib3", "google.auth.transport", "google.auth"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    # Keep httpx at INFO so OpenAI + UnrealSpeech requests are visible.
    logging.getLogger("httpx").setLevel(logging.INFO)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a standard logger; context fields are injected by the formatter."""
    return logging.getLogger(name)


# ---------------------------------------------------------------------------
# Timed context manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def timed(
    logger: logging.Logger,
    event: str,
    **extra: Any,
) -> AsyncGenerator[dict[str, Any], None]:
    """Async context manager that bookends an operation with structured log lines.

    Logs ``<event>.start`` on entry and ``<event>.done`` with ``duration_ms``
    on clean exit.  On exception logs ``<event>.error`` instead and re-raises.

    The yielded dict is shared between both log lines; callers can mutate it
    inside the block to attach extra fields to the ``.done`` line::

        async with timed(logger, "planning.openai") as ctx:
            plan = await planner.plan(project)
            ctx["scene_count"] = len(plan["scenes"])
    """
    shared: dict[str, Any] = dict(extra)
    logger.info("%s.start", event, extra=dict(shared))
    t0 = time.monotonic()
    try:
        yield shared
        duration_ms = round((time.monotonic() - t0) * 1000)
        logger.info(
            "%s.done", event,
            extra={**shared, "duration_ms": duration_ms},
        )
    except Exception as exc:
        duration_ms = round((time.monotonic() - t0) * 1000)
        logger.error(
            "%s.error", event,
            extra={**shared, "duration_ms": duration_ms, "error": str(exc)[:500]},
            exc_info=True,
        )
        raise
