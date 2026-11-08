"""Transactional-adjacent delivery of production-ready email notifications.

The render result is always the source of truth.  Email is deliberately a
best-effort side effect: Resend downtime must never mark a finished film as
failed or spend/release credits twice.
"""

import html
import logging
from typing import Any

import asyncpg
import httpx

from ..core.config import Settings
from .storage import ObjectStorage


logger = logging.getLogger(__name__)


class ProjectReadyEmailer:
    def __init__(self, settings: Settings, storage: ObjectStorage):
        self.settings = settings
        self.storage = storage

    @property
    def configured(self) -> bool:
        return bool(self.settings.RESEND_API_KEY and self.settings.RESEND_FROM_EMAIL)

    async def send_project_ready(self, pool: asyncpg.Pool, project: dict[str, Any], owner: dict[str, Any]) -> None:
        """Send one ready email per project, without propagating delivery errors."""
        if not self.configured:
            logger.warning("Project-ready email skipped: Resend is not configured", extra={"project_id": str(project["id"])})
            return
        if not project.get("output_object"):
            logger.error("Project-ready email skipped: no final output", extra={"project_id": str(project["id"])})
            return

        project_id = str(project["id"])
        try:
            async with pool.acquire() as connection:
                existing = await connection.fetchrow(
                    "SELECT status FROM project_email_notifications WHERE project_id=$1 AND notification_type='ready'",
                    project["id"],
                )
                if existing and existing["status"] == "sent":
                    return
                await connection.execute(
                    """
                    INSERT INTO project_email_notifications(project_id,user_id,recipient,notification_type,status,attempts)
                    VALUES($1,$2,$3,'ready','sending',1)
                    ON CONFLICT(project_id,notification_type) DO UPDATE SET
                      status='sending', attempts=project_email_notifications.attempts+1,
                      last_error=NULL, updated_at=now()
                    """,
                    project["id"], project["user_id"], owner["email"],
                )

            studio_url = f"{self.settings.FRONTEND_URL.rstrip('/')}/studio/projects/{project_id}"
            # Keep the object private. The Studio route authenticates the owner
            # and streams the file through the API without a signed GCS URL.
            download_url = None
            payload = {
                "from": self.settings.RESEND_FROM_EMAIL,
                "to": [owner["email"]],
                "subject": f"Your ShortClipr film is ready — {project['title']}",
                "html": self._html(project, owner, studio_url, download_url),
                "text": self._text(project, studio_url, download_url),
            }
            headers = {
                "Authorization": f"Bearer {self.settings.RESEND_API_KEY}",
                "Idempotency-Key": f"shortclipr-project-ready-{project_id}",
            }
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
                response.raise_for_status()
                provider_id = str(response.json().get("id") or "")
            await pool.execute(
                """UPDATE project_email_notifications
                   SET status='sent',provider_message_id=$2,sent_at=now(),last_error=NULL,updated_at=now()
                   WHERE project_id=$1 AND notification_type='ready'""",
                project["id"], provider_id,
            )
            logger.info("Project-ready email sent", extra={"project_id": project_id, "recipient": owner["email"]})
        except Exception as error:
            message = str(error)[:1000]
            logger.exception("Project-ready email failed", extra={"project_id": project_id})
            try:
                await pool.execute(
                    """UPDATE project_email_notifications
                       SET status='failed',last_error=$2,updated_at=now()
                       WHERE project_id=$1 AND notification_type='ready'""",
                    project["id"], message,
                )
            except Exception:
                logger.exception("Could not record project-ready email failure", extra={"project_id": project_id})

    @staticmethod
    def _text(project: dict[str, Any], studio_url: str, download_url: str | None) -> str:
        direct = f"\n\nDownload MP4 (available for 7 days): {download_url}" if download_url else ""
        return (
            f"Your ShortClipr film is ready: {project['title']}\n\n"
            f"{project['duration_seconds']} seconds · {project['aspect_ratio']} · {project['clip_type']}\n\n"
            f"Open your film in the Studio: {studio_url}{direct}\n\n"
            "Made in ShortClipr."
        )

    @staticmethod
    def _html(project: dict[str, Any], owner: dict[str, Any], studio_url: str, download_url: str | None) -> str:
        title = html.escape(str(project["title"]))
        name = html.escape(str(owner.get("full_name") or "there").split(" ")[0])
        kind = html.escape(str(project["clip_type"]))
        duration = html.escape(f"{project['duration_seconds']} SEC")
        ratio = html.escape(str(project["aspect_ratio"]))
        safe_studio_url = html.escape(studio_url, quote=True)
        download_button = ""
        if download_url:
            safe_download_url = html.escape(download_url, quote=True)
            download_button = f'''<a href="{safe_download_url}" style="display:inline-block;padding:13px 18px;border:1px solid #23251d;color:#23251d;text-decoration:none;font:700 12px Arial,sans-serif;letter-spacing:.08em">DOWNLOAD MP4 ↗</a>'''
        return f'''<!doctype html>
<html><body style="margin:0;background:#eeece2;color:#20231b;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#f8f7f0">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #d6d4ca"><span style="font-size:17px;font-weight:800;letter-spacing:-.06em">SHORTCLIPR</span><span style="float:right;font-size:10px;letter-spacing:.12em;color:#6a6c63">PRODUCTION DESK</span></td></tr>
      <tr><td style="padding:44px 28px 24px"><div style="font-size:10px;letter-spacing:.16em;color:#73756c;margin-bottom:14px">FINAL EXPORT / READY</div><h1 style="margin:0;font-family:Georgia,serif;font-weight:400;font-size:40px;line-height:1.02;letter-spacing:-.045em">Your film is<br><i>ready to screen.</i></h1><p style="font-size:16px;line-height:1.6;margin:22px 0 0;color:#45473f">Hi {name}, the studio has completed the final cut. Your clip passed rendering and quality checks.</p></td></tr>
      <tr><td style="padding:0 28px 28px"><div style="background:#24271d;color:#f5f4eb;padding:25px 24px"><div style="font-size:10px;letter-spacing:.15em;color:#bdff32;margin-bottom:38px">YOUR FINISHED CLIP</div><div style="font-family:Georgia,serif;font-size:28px;line-height:1.1;margin-bottom:20px">{title}</div><div style="font-size:11px;letter-spacing:.08em;color:#c4c6bb">{kind.upper()} &nbsp; / &nbsp; {duration} &nbsp; / &nbsp; {ratio}</div></div></td></tr>
      <tr><td style="padding:2px 28px 44px"><a href="{safe_studio_url}" style="display:inline-block;margin:0 10px 10px 0;padding:14px 18px;background:#bdff32;color:#20231b;text-decoration:none;font:700 12px Arial,sans-serif;letter-spacing:.08em">OPEN IN STUDIO ↗</a>{download_button}<p style="font-size:12px;line-height:1.5;color:#71736a;margin:20px 0 0">Your film remains private in your Studio archive. Open the project to watch or download it.</p></td></tr>
      <tr><td style="padding:20px 28px;background:#e5e3d8;color:#74766d;font-size:11px;line-height:1.5">Made with ShortClipr · This is an automated production update.</td></tr>
    </table>
  </td></tr></table>
</body></html>'''
