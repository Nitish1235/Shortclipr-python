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
from app.core.brainrot_plan_limits import BRAINROT_PLAN_LIMITS, get_brainrot_credits_limit
from app.db import supabase as db

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)
settings = get_settings()

# Maps the product_id field Dodo sends in webhooks → our internal plan name.
# Dodo sends the dodoId string (set when creating checkout in payments.py).
DODO_PLAN_MAP = {
    # Current pricing tiers
    "starter_30":   "starter_30",
    "growth_100":   "growth_100",
    "unlimited":    "unlimited",
    # Legacy slider tiers
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

# Successful payment with an unresolvable plan → grant the lowest paid tier
# rather than free (they DID pay). Only hit if both metadata.plan and the
# product_id map miss.
_FALLBACK_PAID_PLAN = "starter_30"

# Brainrot product_id → plan map, parallel to DODO_PLAN_MAP above. Brainrot
# checkout (payments.py's /brainrot/checkout-session) always stamps
# metadata.plan directly with a BRAINROT_PLAN_LIMITS key, so this is really
# only a fallback for webhook events that don't carry metadata.
DODO_BRAINROT_PLAN_MAP = {
    "starter": "starter",
    "growth": "growth",
    "unlimited": "unlimited",
}
_FALLBACK_PAID_BRAINROT_PLAN = "starter"


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

    # metadata.product distinguishes which app this purchase is for — stamped
    # at checkout time (see payments.py: /checkout-session for YT-Shorts vs.
    # /brainrot/checkout-session for Brainrot, which sets product="brainrot").
    is_brainrot = (payload.get("metadata") or {}).get("product") == "brainrot"

    # Subscription activated (first payment) or plan changed or renewed → upgrade/reset
    if event_type in (
        "payment.succeeded",
        "subscription.active",
        "subscription.renewed",
        "subscription.plan_changed",
    ):
        if is_brainrot:
            await _handle_brainrot_payment_succeeded(payload)
        else:
            await _handle_payment_succeeded(payload)
    elif event_type in (
        "payment.refunded",
        "subscription.cancelled",
        "subscription.expired",
    ):
        if is_brainrot:
            await _handle_brainrot_downgrade(payload)
        else:
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


# ── Brainrot — mirrors the two handlers above, fully separate pool ──

async def _handle_brainrot_payment_succeeded(payload: dict) -> None:
    email      = payload.get("customer", {}).get("email", "")
    product_id = payload.get("product_id", "")

    meta_plan = (payload.get("metadata") or {}).get("plan")
    if meta_plan in BRAINROT_PLAN_LIMITS:
        plan_name = meta_plan
    elif product_id in DODO_BRAINROT_PLAN_MAP:
        plan_name = DODO_BRAINROT_PLAN_MAP[product_id]
    else:
        plan_name = _FALLBACK_PAID_BRAINROT_PLAN
        logger.error(
            f"UNRESOLVED PAID BRAINROT PLAN — product_id={product_id!r}, "
            f"metadata.plan={meta_plan!r}, email={payload.get('customer', {}).get('email', '')!r}. "
            f"Granted fallback {_FALLBACK_PAID_BRAINROT_PLAN!r}; add this product_id to "
            f"DODO_BRAINROT_PLAN_MAP or stamp metadata.plan at checkout to fix. "
            f"Manual reconciliation likely needed."
        )

    if not email:
        logger.error("Brainrot payment succeeded but no email in payload")
        return

    row = await db._fetchrow("SELECT id FROM users WHERE email=$1", email)
    if not row:
        logger.error(f"No user found for email: {email}")
        return

    user_id     = row["id"]
    new_credits = get_brainrot_credits_limit(plan_name)

    await db._execute(
        """
        UPDATE users
        SET brainrot_plan             = $1,
            brainrot_credits_limit    = $2,
            brainrot_credits_used     = 0,
            brainrot_credits_reset_at = date_trunc('month', NOW())
        WHERE id = $3
        """,
        plan_name, new_credits, user_id,
    )

    logger.info(f"Upgraded {email} → brainrot:{plan_name} (credits: {new_credits})")


async def _handle_brainrot_downgrade(payload: dict) -> None:
    email = payload.get("customer", {}).get("email", "")
    if not email:
        return

    row = await db._fetchrow("SELECT id FROM users WHERE email=$1", email)
    if not row:
        return

    user_id = row["id"]
    # Same clamp-rather-than-lockout reasoning as _handle_downgrade() above.
    free_credits = get_brainrot_credits_limit("free")
    await db._execute(
        """
        UPDATE users
        SET brainrot_plan          = 'free',
            brainrot_credits_limit = $1,
            brainrot_credits_used  = LEAST(brainrot_credits_used, $1)
        WHERE id = $2
        """,
        free_credits, user_id,
    )

    logger.info(f"Downgraded {email} → brainrot free plan")
