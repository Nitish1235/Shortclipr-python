"""
webhooks.py — Dodo Payments webhook handler.

Handles:
  - payment.succeeded → upgrade user plan in Supabase
  - payment.refunded  → downgrade user plan
  - subscription.cancelled → downgrade to free

Verifies webhook signature using HMAC-SHA256.
"""

import base64
import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import get_settings
from app.core.plan_limits import PLAN_LIMITS, get_credits_limit, get_video_minutes_limit
from app.db import supabase as db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()

# Maps the product_id field Dodo sends in webhooks → our internal plan name.
# Dodo sends the REAL product id (a "pdt_..." string from the Dodo
# dashboard), NOT a friendly slug — this is only ever consulted as a
# fallback (see _handle_payment_succeeded below), since the primary path
# resolves the plan from metadata.plan, stamped at checkout time in
# payments.py. Keep these in sync with DODO_PRODUCT_* in .env / config.py.
DODO_PLAN_MAP = {
    # Legacy slider tiers — real Dodo product IDs (app.dodopayments.com → Products)
    "pdt_0NgeHduLpMYA9bXMHQopz": "starter_100",   # Shortclipr Starter — $10
    "pdt_0NgeHuMEjTGZ5NT8y6n0M": "starter_250",   # Shortclipr Starter — $25
    "pdt_0NgeITaaybng8nbFGGQVJ": "pro_500",       # Shortclipr Pro — $45
    "pdt_0NgeIeZ1xzG2zp0LrON1E": "pro_1000",      # Shortclipr Pro — $79
    "pdt_0NgeIyALtdIRfRW1CrXc1": "pro_2000",      # Shortclipr Max — $145
    # Current pricing tiers — no Dodo product created yet, add here once one exists
}

# Successful payment with an unresolvable plan → grant the lowest paid tier
# rather than free (they DID pay). Only hit if both metadata.plan and the
# product_id map miss. starter_30 has no real Dodo product (see PRODUCT_IDS
# in payments.py) — starter_100 is the cheapest tier that's actually for sale.
_FALLBACK_PAID_PLAN = "starter_100"


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
    Verify Dodo webhook using the Standard Webhooks (Svix) spec.
    Signed message: "{webhook-id}.{webhook-timestamp}.{raw-body}"

    Per spec: the secret is "whsec_<base64>" — strip the prefix and
    base64-decode it before using as the HMAC key. The resulting signature
    is base64 (NOT hex), and the webhook-signature header can carry several
    space-separated "v1,<sig>" candidates — any match is valid.
    """
    if not settings.DODO_PAYMENTS_WEBHOOK_SECRET:
        if settings.DODO_ALLOW_UNSIGNED_WEBHOOKS:
            logger.warning("DODO_PAYMENTS_WEBHOOK_SECRET not set — skipping verification "
                            "(DODO_ALLOW_UNSIGNED_WEBHOOKS=true, DEV ONLY)")
            return True
        logger.error("DODO_PAYMENTS_WEBHOOK_SECRET is not set — rejecting webhook. "
                      "Set DODO_ALLOW_UNSIGNED_WEBHOOKS=true only for local dev.")
        return False

    if not webhook_id or not webhook_timestamp or not webhook_signature:
        logger.error("Missing webhook headers (webhook-id / webhook-timestamp / webhook-signature)")
        return False

    secret = settings.DODO_PAYMENTS_WEBHOOK_SECRET
    if secret.startswith("whsec_"):
        secret = secret[len("whsec_"):]
    secret_bytes = base64.b64decode(secret)

    signed_content = f"{webhook_id}.{webhook_timestamp}.{body.decode()}"
    expected = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()

    for candidate in webhook_signature.split():
        _, _, sig = candidate.partition(",")
        if sig and hmac.compare_digest(expected, sig):
            return True
    return False


async def _handle_payment_succeeded(payload: dict) -> None:
    email      = payload.get("customer", {}).get("email", "")
    product_id = payload.get("product_id", "")

    # Prefer the plan we stamped into checkout metadata — the raw product_id
    # Dodo echoes is the prd_… id, which the friendly-name map won't match.
    meta_plan = (payload.get("metadata") or {}).get("plan")
    if meta_plan in PLAN_LIMITS:
        plan_name = meta_plan
    elif product_id in DODO_PLAN_MAP:
        plan_name = DODO_PLAN_MAP[product_id]
    else:
        # Neither the checkout-time metadata nor the product-id map resolved
        # to a known plan. This is a real config bug (new Dodo product added
        # without updating PRODUCT_IDS/DODO_PLAN_MAP) — a paid customer
        # should never silently land on the lowest-tier default. Log loudly
        # so this surfaces in alerts, and still grant the fallback so they
        # aren't left with $0 entitlements after paying.
        plan_name = _FALLBACK_PAID_PLAN
        logger.error(
            f"UNRESOLVED PAID PLAN — product_id={product_id!r}, "
            f"metadata.plan={meta_plan!r}, email={payload.get('customer', {}).get('email', '')!r}. "
            f"Granted fallback {_FALLBACK_PAID_PLAN!r}; add this product_id to DODO_PLAN_MAP or "
            f"stamp metadata.plan at checkout to fix. Manual reconciliation likely needed."
        )

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
    # Also reset credits_used / video_minutes_used, clamped to the new
    # (lower) free-tier limits. Otherwise a paid user who'd already used
    # e.g. 25 of 30 clips on starter_30 would land on free with
    # credits_used=25 against credits_limit=2 → videos_remaining=0, fully
    # locked out until the next monthly reset. Clamping preserves the
    # intent (they've used their free-tier allowance this cycle) without
    # the accidental hard lockout.
    free_credits = get_credits_limit("free")
    free_video_mins = get_video_minutes_limit("free")
    await db._execute(
        """
        UPDATE users
        SET plan                = 'free',
            credits_limit       = $1,
            credits_used        = LEAST(credits_used, $1),
            video_minutes_limit = $2,
            video_minutes_used  = LEAST(video_minutes_used, $2)
        WHERE id = $3
        """,
        free_credits, free_video_mins, user_id,
    )

    logger.info(f"Downgraded {email} → free plan")
