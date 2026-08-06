"""
email.py — Shared Resend send helper for transactional (single-recipient) emails.

Admin broadcast emails (bulk, many recipients, same content) live in
app/api/admin_email.py and use resend.Batch.send for efficiency. This
module is for one-off transactional sends triggered by pipeline events
(e.g. "your clips are ready") — it never raises; a failed send is logged
and swallowed so an email hiccup can never fail a job that already
succeeded.
"""

import logging

import resend

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_email(to: str, subject: str, html: str) -> bool:
    """Send a single transactional email via Resend. Returns True on success,
    False on any failure (missing config, API error) — never raises."""
    if not settings.RESEND_API_KEY:
        logger.warning(f"RESEND_API_KEY not configured — skipping email to {to}: {subject!r}")
        return False
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        logger.info(f"Sent email to {to}: {subject!r}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to} ({subject!r}): {e}")
        return False
