"""Always-on, Postgres-backed dispatcher for ShortClipr workers.

The database is the durable queue. LISTEN/NOTIFY only wakes this process
quickly; polling and leases make a watcher restart or lost notification safe.
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from itertools import cycle
from uuid import UUID, uuid4

import asyncpg
import httpx


# ---------------------------------------------------------------------------
# Logging setup — JSON in production, plain text in development
# ---------------------------------------------------------------------------

_IS_PROD = os.getenv("APP_ENV", "development").lower() == "production"


class _WatcherJsonFormatter(logging.Formatter):
    """Minimal JSON formatter for the standalone watcher process."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        ts = self.formatTime(record, "%Y-%m-%dT%H:%M:%S")
        ms = int(record.msecs)
        payload = {
            "timestamp": f"{ts}.{ms:03d}Z",
            "severity": record.levelname,
            "service": "watcher",
            "logger": record.name,
            "message": record.getMessage(),
        }
        _SKIP = frozenset({
            "args", "created", "exc_info", "exc_text", "filename", "funcName",
            "levelname", "levelno", "lineno", "message", "module", "msecs",
            "msg", "name", "pathname", "process", "processName",
            "relativeCreated", "stack_info", "taskName", "thread", "threadName",
        })
        for key, value in record.__dict__.items():
            if key not in _SKIP and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _setup_logging() -> None:
    formatter: logging.Formatter = (
        _WatcherJsonFormatter() if _IS_PROD
        else logging.Formatter("%(asctime)s %(levelname)-8s %(name)s  %(message)s")
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    for noisy in ("urllib3", "httpcore", "google.auth"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_setup_logging()
logger = logging.getLogger("shortclipr.watcher")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def csv(name: str, *, strip_url: bool = True) -> list[str]:
    values = [value.strip() for value in os.getenv(name, "").split(",") if value.strip()]
    return [value.rstrip("/") for value in values] if strip_url else values


@dataclass(frozen=True)
class WorkerTarget:
    url: str
    region: str
    capacity: int


def targets(url_setting: str, region_setting: str, capacity_setting: str, default_capacity: int = 1) -> list[WorkerTarget]:
    urls = csv(url_setting)
    labels = csv(region_setting, strip_url=False)
    capacity = max(1, int(os.getenv(capacity_setting, str(default_capacity))))
    if labels and len(labels) != len(urls):
        raise RuntimeError(f"{region_setting} must have one label for every {url_setting} URL")
    return [WorkerTarget(url, labels[index] if labels else url, capacity) for index, url in enumerate(urls)]


def is_region_rejection(error: Exception) -> bool:
    """Errors proving a worker region did not accept the job; safe to fail over."""
    if isinstance(error, (httpx.ConnectError, httpx.ConnectTimeout)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in {429, 503}
    return False


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

@dataclass
class Dispatcher:
    pool: asyncpg.Pool
    secret: str
    api_targets: list[WorkerTarget]
    render_targets: list[WorkerTarget]
    cooldown_seconds: int

    def __post_init__(self):
        self.api_cycle = cycle(self.api_targets)
        self.render_cycle = cycle(self.render_targets)
        self.blocked_until: dict[tuple[str, str], float] = {}
        self.tasks: set[asyncio.Task] = set()
        self.wake: asyncio.Event | None = None

    async def register_targets(self) -> None:
        for job_class, configured in (("api", self.api_targets), ("render", self.render_targets)):
            regions = sorted({target.region for target in configured})
            await self.pool.execute(
                "DELETE FROM worker_region_state WHERE job_class=$1 AND NOT (region=ANY($2::text[]))",
                job_class, regions,
            )
            for target in configured:
                await self.pool.execute(
                    """INSERT INTO worker_region_state(job_class,region,capacity)
                       VALUES($1,$2,$3)
                       ON CONFLICT(job_class,region) DO UPDATE SET capacity=EXCLUDED.capacity,updated_at=now()""",
                    job_class, target.region, target.capacity,
                )
        rows = await self.pool.fetch(
            "SELECT job_class,region,blocked_until FROM worker_region_state WHERE blocked_until>now()"
        )
        now = datetime.now(timezone.utc)
        for row in rows:
            self.blocked_until[(row["job_class"], row["region"])] = time.monotonic() + max(0, (row["blocked_until"] - now).total_seconds())
        logger.info(
            "watcher.registered_targets",
            extra={
                "api_regions": [t.region for t in self.api_targets],
                "render_regions": [t.region for t in self.render_targets],
                "api_capacity": sum(t.capacity for t in self.api_targets),
                "render_capacity": sum(t.capacity for t in self.render_targets),
            },
        )

    async def record_rejection(self, job_class: str, target: WorkerTarget, error: str) -> None:
        await self.pool.execute(
            """UPDATE worker_region_state SET blocked_until=now()+($4 * interval '1 second'),
               last_error=$3,last_rejection_at=now(),updated_at=now()
               WHERE job_class=$1 AND region=$2""",
            job_class, target.region, error[:1000], self.cooldown_seconds,
        )

    async def record_success(self, job_class: str, target: WorkerTarget) -> None:
        await self.pool.execute(
            """UPDATE worker_region_state SET blocked_until=NULL,last_error=NULL,last_success_at=now(),updated_at=now()
               WHERE job_class=$1 AND region=$2""",
            job_class, target.region,
        )

    async def active_counts(self, job_class: str) -> dict[str, int]:
        rows = await self.pool.fetch(
            """SELECT worker_region,count(*) AS count FROM job_attempts
               WHERE job_class=$1 AND status IN ('leased','running')
                 AND lease_expires_at>now() AND worker_region IS NOT NULL
               GROUP BY worker_region""",
            job_class,
        )
        return {row["worker_region"]: row["count"] for row in rows}

    async def next_target(self, job_class: str) -> WorkerTarget | None:
        pool = self.api_targets if job_class == "api" else self.render_targets
        chooser = self.api_cycle if job_class == "api" else self.render_cycle
        if not pool:
            return None
        counts = await self.active_counts(job_class)
        now = time.monotonic()
        for _ in range(len(pool)):
            target = next(chooser)
            if self.blocked_until.get((job_class, target.region), 0) > now:
                continue
            if counts.get(target.region, 0) < target.capacity:
                return target
        return None

    async def claim(self, job_class: str, target: WorkerTarget) -> asyncpg.Record | None:
        token = uuid4()
        lease_interval = timedelta(minutes=28 if job_class == "render" else 6)
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                row = await connection.fetchrow(
                    """SELECT * FROM job_attempts
                       WHERE job_class=$1 AND status='ready' AND due_at<=now() AND attempts<max_attempts
                       ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT 1""",
                    job_class,
                )
                if not row:
                    return None
                claimed = await connection.fetchrow(
                    """UPDATE job_attempts SET status='leased',lease_token=$2,
                       lease_expires_at=now()+$3::interval,attempts=attempts+1,worker_region=$4
                       WHERE id=$1 RETURNING *""",
                    row["id"], token, lease_interval, target.region,
                )
                if claimed:
                    logger.info(
                        "watcher.claim",
                        extra={
                            "job_class": job_class,
                            "project_id": str(claimed["project_id"]),
                            "attempt_id": str(claimed["id"]),
                            "attempt": claimed["attempts"],
                            "max_attempts": claimed["max_attempts"],
                            "region": target.region,
                        },
                    )
                return claimed

    async def defer_for_region(self, job: asyncpg.Record, error: str) -> None:
        """Release an unaccepted job without consuming a user-visible retry."""
        await self.pool.execute(
            """UPDATE job_attempts SET status='ready',attempts=GREATEST(0,attempts-1),
               due_at=now()+interval '3 seconds',lease_token=NULL,lease_expires_at=NULL,last_error=$3
               WHERE id=$1 AND lease_token=$2 AND status IN ('leased','running')""",
            job["id"], job["lease_token"], error[:1000],
        )

    async def mark_project_failed(self, connection: asyncpg.Connection, project_id: UUID, message: str) -> None:
        project = await connection.fetchrow("SELECT * FROM projects WHERE id=$1 FOR UPDATE", project_id)
        if not project or project["status"] in {"complete", "cancelled", "failed"}:
            return
        released = await connection.fetchval(
            """INSERT INTO credit_ledger(user_id,project_id,entry_type,amount,idempotency_key)
               VALUES($1,$2,'release',$3,$4) ON CONFLICT DO NOTHING RETURNING id""",
            project["user_id"], project_id, -project["credits_reserved"], f"project:{project_id}:watcher-exhausted-release",
        )
        if released:
            await connection.execute(
                "UPDATE credit_accounts SET reserved_credits=GREATEST(0,reserved_credits-$2) WHERE user_id=$1",
                project["user_id"], project["credits_reserved"],
            )
        await connection.execute(
            "UPDATE projects SET status='failed',error_code='worker_delivery_failed',error_message=$2 WHERE id=$1",
            project_id, message[:1000],
        )
        await connection.execute(
            """UPDATE job_attempts SET status='cancelled',lease_token=NULL,lease_expires_at=NULL
               WHERE project_id=$1 AND status IN ('ready','leased','running')""",
            project_id,
        )
        await connection.execute(
            """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
               VALUES($1,'failed','watcher',0,jsonb_build_object('code','worker_delivery_failed'))""",
            project_id,
        )
        logger.error(
            "watcher.project_failed",
            extra={
                "project_id": str(project_id),
                "error": message[:500],
                "credits_released": bool(released),
            },
        )

    async def retry_or_fail(self, job_id: UUID, lease_token: UUID, error: str, retry_seconds: int) -> None:
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                job = await connection.fetchrow("SELECT * FROM job_attempts WHERE id=$1 FOR UPDATE", job_id)
                if not job or job["lease_token"] != lease_token or job["status"] not in {"leased", "running"}:
                    return
                if job["attempts"] < job["max_attempts"]:
                    await connection.execute(
                        """UPDATE job_attempts SET status='ready',due_at=now()+($3 * interval '1 second'),
                           lease_token=NULL,lease_expires_at=NULL,last_error=$4 WHERE id=$1 AND lease_token=$2""",
                        job_id, lease_token, retry_seconds, error[:1000],
                    )
                    if job["job_class"] == "render":
                        # A delivery failure/reconnect timeout can happen
                        # outside the renderer process. Reset the project
                        # state too, otherwise the UI can stay at 45/48% until
                        # the next attempt completes.
                        await connection.execute(
                            "UPDATE projects SET status='queued',progress=45 WHERE id=$1 AND status='rendering'",
                            job["project_id"],
                        )
                        await connection.execute(
                            """INSERT INTO project_events(project_id,event_type,stage,progress,payload)
                               VALUES($1,'retrying','render',45,jsonb_build_object('retry_in_s',$2,'error',$3))""",
                            job["project_id"], retry_seconds, error[:1000],
                        )
                    logger.warning(
                        "watcher.retry",
                        extra={
                            "job_class": job["job_class"],
                            "project_id": str(job["project_id"]),
                            "attempt_id": str(job_id),
                            "attempt": job["attempts"],
                            "max_attempts": job["max_attempts"],
                            "retry_in_s": retry_seconds,
                            "error": error[:300],
                        },
                    )
                    return
                await connection.execute(
                    """UPDATE job_attempts SET status='failed',lease_token=NULL,lease_expires_at=NULL,last_error=$3
                       WHERE id=$1 AND lease_token=$2""",
                    job_id, lease_token, error[:1000],
                )
                await self.mark_project_failed(connection, job["project_id"], error)

    async def reconcile(self) -> None:
        rows = await self.pool.fetch(
            """SELECT id,lease_token,project_id,job_class FROM job_attempts
               WHERE status IN ('leased','running') AND lease_expires_at<now() AND lease_token IS NOT NULL
               LIMIT 100"""
        )
        if rows:
            logger.warning(
                "watcher.reconcile",
                extra={
                    "expired_leases": len(rows),
                    "job_ids": [str(r["id"]) for r in rows[:5]],
                },
            )
        for row in rows:
            await self.retry_or_fail(row["id"], row["lease_token"], "Worker lease expired", 30)

    async def deliver(self, job: asyncpg.Record, target: WorkerTarget, client: httpx.AsyncClient) -> None:
        endpoint = "/internal/api-stage/run" if job["job_class"] == "api" else "/internal/ffmpeg-stage/run"
        timeout = 1450 if job["job_class"] == "render" else 290
        t0 = time.monotonic()
        project_id_str = str(job["project_id"])
        attempt_id_str = str(job["id"])
        try:
            await self.pool.execute(
                "UPDATE job_attempts SET status='running' WHERE id=$1 AND lease_token=$2 AND status='leased'",
                job["id"], job["lease_token"],
            )
            logger.info(
                "watcher.dispatch",
                extra={
                    "job_class": job["job_class"],
                    "project_id": project_id_str,
                    "attempt_id": attempt_id_str,
                    "region": target.region,
                    "attempt": job["attempts"],
                },
            )
            response = await client.post(
                target.url + endpoint,
                headers={"X-Internal-Secret": self.secret},
                json={"projectId": str(job["project_id"]), "attemptId": str(job["id"]), "leaseToken": str(job["lease_token"])},
                timeout=timeout,
            )
            response.raise_for_status()
            duration_ms = round((time.monotonic() - t0) * 1000)
            await self.record_success(job["job_class"], target)
            logger.info(
                "watcher.deliver_ok",
                extra={
                    "job_class": job["job_class"],
                    "project_id": project_id_str,
                    "attempt_id": attempt_id_str,
                    "region": target.region,
                    "duration_ms": duration_ms,
                    "status_code": response.status_code,
                },
            )
        except Exception as error:
            duration_ms = round((time.monotonic() - t0) * 1000)
            if is_region_rejection(error):
                self.blocked_until[(job["job_class"], target.region)] = time.monotonic() + self.cooldown_seconds
                await self.record_rejection(job["job_class"], target, str(error))
                await self.defer_for_region(job, f"Region {target.region} unavailable: {error}")
                logger.warning(
                    "watcher.region_reject",
                    extra={
                        "job_class": job["job_class"],
                        "project_id": project_id_str,
                        "region": target.region,
                        "cooldown_s": self.cooldown_seconds,
                        "duration_ms": duration_ms,
                        "error": str(error)[:300],
                    },
                )
            elif isinstance(error, httpx.ReadTimeout):
                # The remote worker may still be rendering. Keep its lease and
                # let lease expiry decide safely whether a retry is needed.
                await self.pool.execute(
                    "UPDATE job_attempts SET last_error=$3 WHERE id=$1 AND lease_token=$2",
                    job["id"], job["lease_token"], "Worker response timed out; awaiting lease expiry",
                )
                logger.warning(
                    "watcher.read_timeout",
                    extra={
                        "job_class": job["job_class"],
                        "project_id": project_id_str,
                        "attempt_id": attempt_id_str,
                        "region": target.region,
                        "timeout_s": timeout,
                    },
                )
            else:
                retry_s = min(300, 15 * job["attempts"])
                logger.error(
                    "watcher.deliver_error",
                    extra={
                        "job_class": job["job_class"],
                        "project_id": project_id_str,
                        "attempt_id": attempt_id_str,
                        "region": target.region,
                        "duration_ms": duration_ms,
                        "retry_in_s": retry_s,
                        "error": str(error)[:500],
                    },
                )
                await self.retry_or_fail(job["id"], job["lease_token"], str(error), retry_s)

    def track(self, task: asyncio.Task) -> None:
        self.tasks.add(task)

        def finished(completed: asyncio.Task) -> None:
            self.tasks.discard(completed)
            if self.wake:
                self.wake.set()
            if completed.cancelled():
                return
            try:
                completed.result()
            except Exception:
                logger.exception("watcher.task_crashed")

        task.add_done_callback(finished)

    async def fill_available_slots(self, client: httpx.AsyncClient) -> bool:
        launched_api = 0
        launched_render = 0
        for job_class in ("api", "render"):
            while True:
                target = await self.next_target(job_class)
                if not target:
                    break
                job = await self.claim(job_class, target)
                if not job:
                    break
                self.track(asyncio.create_task(self.deliver(job, target, client)))
                if job_class == "api":
                    launched_api += 1
                else:
                    launched_render += 1
        if launched_api or launched_render:
            logger.info(
                "watcher.dispatch_pass",
                extra={"launched_api": launched_api, "launched_render": launched_render},
            )
        return bool(launched_api or launched_render)

    async def run(self) -> None:
        wake = asyncio.Event()
        async with self.pool.acquire() as listener:
            def on_job_notification(*_args: object) -> None:
                wake.set()

            await listener.add_listener("shortclipr_jobs", on_job_notification)
            self.wake = wake
            logger.info("watcher.listening", extra={"channel": "shortclipr_jobs"})
            try:
                async with httpx.AsyncClient() as client:
                    while True:
                        wake.clear()
                        try:
                            await self.reconcile()
                            launched = await self.fill_available_slots(client)
                        except asyncio.CancelledError:
                            raise
                        except Exception:
                            logger.exception("watcher.loop_error")
                            launched = False
                            await asyncio.sleep(5)
                            continue
                        if wake.is_set():
                            continue
                        try:
                            await asyncio.wait_for(wake.wait(), timeout=1 if launched else 10)
                        except asyncio.TimeoutError:
                            pass
            finally:
                await listener.remove_listener("shortclipr_jobs", on_job_notification)


# ---------------------------------------------------------------------------
# Cloud Run health server
# ---------------------------------------------------------------------------

async def health_server() -> None:
    """Cloud Run workers must bind their assigned HTTP port."""
    async def respond(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=5)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, TimeoutError):
            pass
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 35\r\nConnection: close\r\n\r\n{\"status\":\"ok\",\"service\":\"watcher\"}")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(respond, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
    async with server:
        await server.serve_forever()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main() -> None:
    db_url = os.environ["SUPABASE_DB_URL"]
    secret = os.environ["INTERNAL_TASK_SECRET"]
    api_targets = targets("API_WORKER_URLS", "API_WORKER_REGIONS", "API_REGION_SOFT_CAP", 12) or targets("WORKER_SERVICE_URLS", "WORKER_SERVICE_REGIONS", "API_REGION_SOFT_CAP", 12)
    render_targets = targets("FFMPEG_WORKER_URLS", "FFMPEG_WORKER_REGIONS", "FFMPEG_REGION_SOFT_CAP", 4) or targets("WORKER_SERVICE_URLS", "WORKER_SERVICE_REGIONS", "FFMPEG_REGION_SOFT_CAP", 4)
    if not api_targets or not render_targets:
        raise RuntimeError("API_WORKER_URLS and FFMPEG_WORKER_URLS are required")
    logger.info(
        "watcher.startup",
        extra={
            "api_workers": len(api_targets),
            "render_workers": len(render_targets),
        },
    )
    pool = await asyncpg.create_pool(db_url, min_size=1, max_size=8, server_settings={"application_name": "shortclipr-watcher"})
    try:
        cooldown = max(5, int(os.getenv("WORKER_REGION_COOLDOWN_SECONDS", "60")))
        dispatcher = Dispatcher(pool, secret, api_targets, render_targets, cooldown)
        await dispatcher.register_targets()
        async with asyncio.TaskGroup() as tasks:
            tasks.create_task(health_server())
            tasks.create_task(dispatcher.run())
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
