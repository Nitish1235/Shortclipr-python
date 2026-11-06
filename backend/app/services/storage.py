import asyncio
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from google.cloud import storage
from google.auth import default as google_auth_default
from google.auth.transport.requests import Request as GoogleRequest

from ..core.config import Settings


class ObjectStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = storage.Client() if settings.GCS_BUCKET_NAME else None
        self.credentials = google_auth_default()[0] if self.client else None

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
        await asyncio.to_thread(self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name).delete)

    async def upload_file_private(self, path: Path, content_type: str, prefix: str) -> str:
        if not self.client or not self.settings.GCS_BUCKET_NAME:
            raise RuntimeError("GCS_BUCKET_NAME is not configured")
        object_name = f"{prefix.strip('/')}/{uuid4().hex}{path.suffix.lower()}"

        def upload() -> None:
            blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
            blob.upload_from_filename(str(path), content_type=content_type)

        await asyncio.to_thread(upload)
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

        def upload() -> None:
            self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name).upload_from_string(data, content_type=content_type)

        await asyncio.to_thread(upload)
        return object_name

    async def signed_url(self, object_name: str | None, minutes: int = 15) -> str | None:
        if not object_name or not self.client or not self.settings.GCS_BUCKET_NAME:
            return None

        def sign() -> str:
            blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
            # Cloud Run's attached service account has no downloadable private key.
            # Passing an access token + service account delegates V4 signing to IAM SignBlob.
            if self.credentials:
                self.credentials.refresh(GoogleRequest())
                service_account = self.settings.GCS_SIGNING_SERVICE_ACCOUNT or getattr(self.credentials, "service_account_email", "")
                if service_account and self.credentials.token:
                    return blob.generate_signed_url(
                        version="v4", expiration=timedelta(minutes=minutes), method="GET",
                        service_account_email=service_account, access_token=self.credentials.token,
                    )
            return blob.generate_signed_url(version="v4", expiration=timedelta(minutes=minutes), method="GET")

        return await asyncio.to_thread(sign)

    async def signed_download_url(self, object_name: str | None, filename: str, minutes: int = 10080) -> str | None:
        """Create a time-limited attachment link suitable for a delivery email."""
        if not object_name or not self.client or not self.settings.GCS_BUCKET_NAME:
            return None

        safe_name = "".join(char if char.isalnum() or char in " -_." else "_" for char in filename).strip() or "shortclipr-film"
        if not safe_name.lower().endswith(".mp4"):
            safe_name += ".mp4"

        def sign() -> str:
            blob = self.client.bucket(self.settings.GCS_BUCKET_NAME).blob(object_name)
            params = {"response-content-disposition": f'attachment; filename="{safe_name}"'}
            if self.credentials:
                self.credentials.refresh(GoogleRequest())
                service_account = self.settings.GCS_SIGNING_SERVICE_ACCOUNT or getattr(self.credentials, "service_account_email", "")
                if service_account and self.credentials.token:
                    return blob.generate_signed_url(version="v4", expiration=timedelta(minutes=minutes), method="GET", query_parameters=params, service_account_email=service_account, access_token=self.credentials.token)
            return blob.generate_signed_url(version="v4", expiration=timedelta(minutes=minutes), method="GET", query_parameters=params)

        return await asyncio.to_thread(sign)
