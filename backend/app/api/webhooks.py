"""
webhooks.py — Dodo Payments webhook handler.

Handles:
  - payment.succeeded → upgrade user plan in Supabase
  - payment.refunded  → downgrade user plan
  - subscription.cancelled → downgrade to free

Verifies webhook signature using HMAC-SHA256.
"""

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import get_settings
from app.db import supabase as db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()

PLAN_CREDITS = {"free": 3, "starter": 20, "pro": 999999}

DODO_PLAN_MAP = {
    "starter_monthly": "starter",
    "starter_annual": "starter",
    "pro_monthly": "pro",
    "pro_annual": "pro",
}


@router.post("/dodo")
async def dodo_webhook(request: Request):
    """Receive and process Dodo Payments webhook events."""
    body = await request.body()
    signature = request.headers.get("dodo-signature", "")

    if not _verify_signature(body, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type", "")
    payload = event.get("data", {})

    logger.info(f"Dodo webhook: {event_type}")

    if event_type == "payment.succeeded":
        await _handle_payment_succeeded(payload)
    elif event_type in ("payment.refunded", "subscription.cancelled"):
        await _handle_downgrade(payload)
    else:
        logger.debug(f"Unhandled Dodo event type: {event_type}")

    return {"received": True}


def _verify_signature(body: bytes, signature: str) -> bool:
    """Verify Dodo HMAC-SHA256 signature."""
    if settings.APP_ENV == "development" and not settings.DODO_PAYMENTS_WEBHOOK_SECRET:
        logger.warning("DODO_PAYMENTS_WEBHOOK_SECRET not set — skipping verification (DEV ONLY)")
        return True
    
    if not settings.DODO_PAYMENTS_WEBHOOK_SECRET:
        logger.error("DODO_PAYMENTS_WEBHOOK_SECRET missing in production!")
        return False
    expected = hmac.new(
        settings.DODO_PAYMENTS_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


async def _handle_payment_succeeded(payload: dict) -> None:
    email = payload.get("customer", {}).get("email", "")
    product_id = payload.get("product_id", "")
    plan_name = DODO_PLAN_MAP.get(product_id, "starter")

    if not email:
        logger.error("Payment succeeded but no email in payload")
        return

    client = await db.get_client()
    result = await client.table("users").select("id").eq("email", email).execute()
    if not result.data:
        logger.error(f"No user found for email: {email}")
        return

    user_id = result.data[0]["id"]
    new_limit = PLAN_CREDITS.get(plan_name, 20)

    await client.table("users").update({
        "plan": plan_name,
        "credits_limit": new_limit,
        "credits_used": 0,  # Reset on new billing cycle
    }).eq("id", user_id).execute()

    logger.info(f"Upgraded {email} to {plan_name} (limit: {new_limit})")


async def _handle_downgrade(payload: dict) -> None:
    email = payload.get("customer", {}).get("email", "")
    if not email:
        return

    client = await db.get_client()
    result = await client.table("users").select("id").eq("email", email).execute()
    if not result.data:
        return

    user_id = result.data[0]["id"]
    await client.table("users").update({
        "plan": "free",
        "credits_limit": PLAN_CREDITS["free"],
    }).eq("id", user_id).execute()

    logger.info(f"Downgraded {email} to free plan")
