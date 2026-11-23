import asyncio
import logging
from pathlib import Path
from uuid import uuid4

from google.cloud import storage

from ..core.config import Settings

logger = logging.getLogger(__name__)


class ObjectStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = storage.Client() if settings.GCS_BUCKET_NAME else None

    async def _run_blocking(self, operation, on_cancel=None):
        """Keep thread-backed GCS operations alive until settled, then clean up on cancellation."""
        task = asyncio.create_task(asyncio.to_thread(operation))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            try:
                await asyncio.shield(task)
            except Exception:
                pass
            if on_cancel is not None:
                try:
                    await asyncio.shield(asyncio.to_thread(on_cancel))
                except Exception:
                    logger.exception("storage.cancel_cleanup_failed")
            raise

    async def upload_public(self, data: bytes, content_type: str, prefix: str, filename: str) -> tuple[str, str]:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        suffix = Path(filename).suffix.lower()[:12]
        object_name = f"{prefix.strip('/')}/{uuid4().hex}{suffix}"

        def upload() -> None:
            bucket = self.client.bucket(self.settings.GCS_BUCKET_NAME)
            blob = bucket.blob(object_name)
            blob.upload_from_string(data, content_type=content_type)

        await asyncio.to_thread(upload)
        base = self.settings.GCS_PUBLIC_BASE_URL.rstrip("/")
        return object_name, f"{base}/{self.settings.GCS_BUCKET_NAME}/{object_name}"

    async def delete(self, object_name: str | None) -> None:
        if not object_name or not self.client or not self.settings.GCS_BUCKET_NAME:
            return
        blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
        await self._run_blocking(lambda: blob.delete(timeout=30))

    async def upload_file_private(self, path: Path, content_type: str, prefix: str) -> str:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        object_name = f"{prefix.strip('/')}/{uuid4().hex}{path.suffix.lower()}"

        blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)

        def upload() -> None:
            blob.upload_from_filename(str(path), content_type=content_type, timeout=60)

        await self._run_blocking(
            upload,
            on_cancel=lambda: blob.delete(timeout=30),
        )
        return object_name

    async def copy_to_public(self, source_object: str, prefix: str) -> tuple[str, str]:
        """Copy a private generated output into the deliberately public showcase namespace."""
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        suffix = Path(source_object).suffix.lower()[:12]
        object_name = f"{prefix.strip('/')}/{uuid4().hex}{suffix}"

        def copy() -> None:
            bucket = self.client.bucket(self.settings.GCS_BUCKET_NAME)
            bucket.copy_blob(bucket.blob(source_object), bucket, new_name=object_name)

        await asyncio.to_thread(copy)
        base = self.settings.GCS_PUBLIC_BASE_URL.rstrip("/")
        return object_name, f"{base}/{self.settings.GCS_BUCKET_NAME}/{object_name}"

    async def upload_bytes_private(self, data: bytes, content_type: str, prefix: str, suffix: str) -> str:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        object_name = f"{prefix.strip('/')}/{uuid4().hex}{suffix}"

        blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)

        def upload() -> None:
            blob.upload_from_string(data, content_type=content_type, timeout=60)

        await self._run_blocking(
            upload,
            on_cancel=lambda: blob.delete(timeout=30),
        )
        return object_name

    async def private_object_info(self, object_name: str) -> tuple[str, int | None]:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")

        def load() -> tuple[str, int | None]:
            blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
            blob.reload(timeout=30)
            return blob.content_type or "application/octet-stream", blob.size

        return await self._run_blocking(load)

    async def download_private(self, object_name: str, destination: Path) -> None:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")

        blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)

        def download() -> None:
            destination.parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(str(destination), timeout=60)

        await self._run_blocking(download, on_cancel=lambda: destination.unlink(missing_ok=True))

    async def stream_private(self, object_name: str):
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
        reader = await asyncio.to_thread(blob.open, "rb")
        try:
            while True:
                chunk = await asyncio.to_thread(reader.read, 1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            await asyncio.to_thread(reader.close)
