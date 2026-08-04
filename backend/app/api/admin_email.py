"""
admin_email.py — Admin email broadcast via Resend API.

Two recipient modes:
  1. "All subscribers" — fetches every user where plan != 'free'
  2. "Custom SQL"      — admin provides a SQL SELECT that must return an `email` column

Endpoints:
  POST /admin/email/recipients   — preview recipient list (returns emails + count)
  POST /admin/email/send         — send an email to a list of recipients
"""

import logging
from typing import Annotated

import resend
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.admin import AdminUser, require_admin
from app.core.config import get_settings
from app.db import supabase as db

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["admin-email"])


# ── Request / Response models ─────────────────────────────────

class RecipientsRequest(BaseModel):
    mode: str = "subscribers"  # "subscribers" | "query"
    query: str = ""            # raw SQL when mode == "query"


class SendEmailRequest(BaseModel):
    to: list[str]              # list of email addresses
    subject: str
    html: str                  # HTML body


# ── Helpers ────────────────────────────────────────────────────

_SUBSCRIBERS_QUERY = """
    SELECT email FROM users
    WHERE plan != 'free'
    ORDER BY created_at DESC
"""


def _validate_read_only(sql: str) -> None:
    """Reject anything that isn't a plain SELECT."""
    normalized = sql.strip().rstrip(";").upper()
    if not normalized.startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    forbidden = {"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"}
    tokens = set(normalized.split())
    hit = tokens & forbidden
    if hit:
        raise HTTPException(status_code=400, detail=f"Forbidden SQL keyword(s): {', '.join(hit)}")


# ── Endpoints ──────────────────────────────────────────────────

@router.post("/admin/email/recipients")
async def get_recipients(body: RecipientsRequest, admin: AdminUser):
    """Preview the recipient list before sending."""
    if body.mode == "subscribers":
        rows = await db._fetch(_SUBSCRIBERS_QUERY)
    elif body.mode == "query":
        if not body.query.strip():
            raise HTTPException(status_code=400, detail="Query is empty")
        _validate_read_only(body.query)
        try:
            rows = await db._fetch(body.query)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"SQL error: {e}")
    else:
        raise HTTPException(status_code=400, detail="mode must be 'subscribers' or 'query'")

    emails = []
    for r in rows:
        email = r.get("email")
        if email and isinstance(email, str) and "@" in email:
            emails.append(email)

    return {"emails": emails, "count": len(emails)}


@router.post("/admin/email/send")
async def send_email(body: SendEmailRequest, admin: AdminUser):
    """Send an email to a list of recipients via Resend batch API."""
    if not body.to:
        raise HTTPException(status_code=400, detail="No recipients")
    if not body.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is empty")
    if not body.html.strip():
        raise HTTPException(status_code=400, detail="Email body is empty")

    api_key = settings.RESEND_API_KEY
    if not api_key:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY is not configured")

    resend.api_key = api_key
    from_addr = settings.RESEND_FROM_EMAIL

    # Resend batch send: up to 100 emails per call
    results = []
    errors = []
    batch_size = 100
    for i in range(0, len(body.to), batch_size):
        batch = body.to[i : i + batch_size]
        params_list = [
            {
                "from": from_addr,
                "to": [email],
                "subject": body.subject,
                "html": body.html,
            }
            for email in batch
        ]
        try:
            batch_response = resend.Batch.send(params_list)
            results.append({"batch": i // batch_size + 1, "sent": len(batch), "response": str(batch_response)})
            logger.info(f"Admin {admin.email} sent email batch {i // batch_size + 1} ({len(batch)} recipients)")
        except Exception as e:
            logger.error(f"Resend batch {i // batch_size + 1} failed: {e}")
            errors.append({"batch": i // batch_size + 1, "error": str(e)})

    total_sent = sum(r["sent"] for r in results)
    return {
        "success": len(errors) == 0,
        "total_sent": total_sent,
        "total_failed": len(body.to) - total_sent,
        "batches": results,
        "errors": errors,
    }
