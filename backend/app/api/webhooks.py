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
from app.core.plan_limits import get_credits_limit, get_video_minutes_limit
from app.db import supabase as db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()

# Maps the product_id field Dodo sends in webhooks → our internal plan name.
# Dodo sends the dodoId string (set when creating checkout in payments.py).
DODO_PLAN_MAP = {
    # Current slider tiers
    "starter_100":  "starter_100",
    "starter_250":  "starter_250",
    "pro_500":      "pro_500",
    "pro_1000":     "pro_1000",
    "pro_2000":     "pro_2000",
    # Legacy plan names (kept for backward compat with old subscriptions)
    "starter_monthly": "starter",
    "starter_annual":  "starter",
    "pro_monthly":     "pro",
    "pro_annual":      "pro",
}


@router.post("/dodo")
async def dodo_webhook(request: Request):
    """Receive and process Dodo Payments webhook events."""
    body = await request.body()

    webhook_id        = request.headers.get("webhook-id", "")
    webhook_timestamp = request.headers.get("webhook-timestamp", "")
    webhook_signature = request.headers.get("webhook-signature", "")

    if not _verify_signature(body, webhook_id, webhook_timestamp, webhook_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type", "")
    payload    = event.get("data", {})

    logger.info(f"Dodo webhook: {event_type}")

    # Subscription activated (first payment) or plan changed or renewed → upgrade/reset
    if event_type in (
        "payment.succeeded",
        "subscription.active",
        "subscription.renewed",
        "subscription.plan_changed",
    ):
        await _handle_payment_succeeded(payload)
    elif event_type in (
        "payment.refunded",
        "subscription.cancelled",
        "subscription.expired",
    ):
        await _handle_downgrade(payload)
    elif event_type == "subscription.on_hold":
        logger.warning(f"Subscription on hold: {payload.get('subscription_id', '')}")
    else:
        logger.debug(f"Unhandled Dodo event type: {event_type}")

    return {"received": True}


def _verify_signature(
    body: bytes, webhook_id: str, webhook_timestamp: str, webhook_signature: str
) -> bool:
    """
    Verify Dodo webhook using Standard Webhooks spec.
    Signed message: "{webhook-id}.{webhook-timestamp}.{raw-body}"
    """
    if settings.APP_ENV == "development" and not settings.DODO_PAYMENTS_WEBHOOK_SECRET:
        logger.warning("DODO_PAYMENTS_WEBHOOK_SECRET not set — skipping verification (DEV ONLY)")
        return True

    if not settings.DODO_PAYMENTS_WEBHOOK_SECRET:
        logger.error("DODO_PAYMENTS_WEBHOOK_SECRET missing in production!")
        return False

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        logger.error("Missing webhook headers (webhook-id / webhook-timestamp / webhook-signature)")
        return False

    signed_content = f"{webhook_id}.{webhook_timestamp}.{body.decode()}"
    expected = hmac.new(
        settings.DODO_PAYMENTS_WEBHOOK_SECRET.encode(),
        signed_content.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, webhook_signature)


async def _handle_payment_succeeded(payload: dict) -> None:
    email      = payload.get("customer", {}).get("email", "")
    product_id = payload.get("product_id", "")
    plan_name  = DODO_PLAN_MAP.get(product_id, "starter_100")

    if not email:
        logger.error("Payment succeeded but no email in payload")
        return

    row = await db._fetchrow("SELECT id FROM users WHERE email=$1", email)
    if not row:
        logger.error(f"No user found for email: {email}")
        return

    user_id          = row["id"]
    new_credits      = get_credits_limit(plan_name)
    new_video_mins   = get_video_minutes_limit(plan_name)

    await db._execute(
        """
        UPDATE users
        SET plan                = $1,
            credits_limit       = $2,
            credits_used        = 0,
            video_minutes_limit = $3,
            video_minutes_used  = 0,
            credits_reset_at    = date_trunc('month', NOW())
        WHERE id = $4
        """,
        plan_name, new_credits, new_video_mins, user_id,
    )

    logger.info(
        f"Upgraded {email} → {plan_name} "
        f"(credits: {new_credits}, video_mins: {new_video_mins})"
    )


async def _handle_downgrade(payload: dict) -> None:
    email = payload.get("customer", {}).get("email", "")
    if not email:
        return

    row = await db._fetchrow("SELECT id FROM users WHERE email=$1", email)
    if not row:
        return

    user_id = row["id"]
    await db._execute(
        """
        UPDATE users
        SET plan                = 'free',
            credits_limit       = $1,
            video_minutes_limit = $2
        WHERE id = $3
        """,
        get_credits_limit("free"),
        get_video_minutes_limit("free"),
        user_id,
    )

    logger.info(f"Downgraded {email} → free plan")
