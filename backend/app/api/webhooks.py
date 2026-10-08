"""
webhooks.py — Dodo Payments webhook handler.

Handles:
  - payment.succeeded → upgrade user plan in Supabase
  - payment.refunded  → downgrade user plan
  - subscription lifecycle events → keep plan access in sync with Dodo
  - payment.cancelled → record the abandoned checkout without changing access

Verifies webhook signature using HMAC-SHA256.
"""

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

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

    # Subscription activated (first payment), renewed, or changed → grant the
    # current paid period. The paid-through deadline is persisted by the
    # handlers and independently enforced on every user lookup.
    if event_type in (
        "payment.succeeded",
        "subscription.active",
        "subscription.renewed",
        "subscription.plan_changed",
        "subscription.unpaused",
    ):
        # Fire TikTok Events
        from app.core.tiktok_events import send_tiktok_event_background
        tt_event_name = "Purchase" if event_type == "payment.succeeded" else "Subscribe"
        tt_email = (payload.get("customer") or {}).get("email")
        if tt_email:
            send_tiktok_event_background(
                event_name=tt_event_name,
                event_id=f"dodo_{event_type}_{payload.get('payment_id') or payload.get('subscription_id')}",
                email=tt_email
            )

        await _handle_payment_succeeded(payload)
    elif event_type == "subscription.past_due":
        # Dodo explicitly keeps access during the configured grace period.
        # Sync the deadline without resetting monthly usage.
        await _handle_subscription_state(payload)
    elif event_type == "subscription.updated":
        subscription_status = str(payload.get("status") or "").lower()
        if subscription_status in ("active", "past_due"):
            await _handle_subscription_state(payload)
        elif subscription_status in ("on_hold", "paused", "cancelled", "failed", "expired"):
            await _handle_downgrade(payload, subscription_status)
    elif event_type == "payment.cancelled":
        # A cancelled checkout never granted an entitlement.  In particular,
        # do not downgrade by customer email here: a customer can abandon a
        # second checkout while still having an unrelated active subscription.
        logger.info(
            "Dodo payment cancelled; no entitlement change "
            "(payment_id=%s, subscription_id=%s)",
            payload.get("payment_id"),
            payload.get("subscription_id"),
        )
    elif event_type in (
        "payment.refunded",
        "subscription.cancelled",
        "subscription.expired",
        "subscription.failed",
        "subscription.on_hold",
        "subscription.paused",
    ):
        terminal_status = event_type.removeprefix("subscription.").removeprefix("payment.")
        await _handle_downgrade(payload, terminal_status)
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


def _parse_webhook_datetime(value) -> datetime | None:
    """Parse a Dodo ISO-8601 timestamp into an aware UTC datetime."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        logger.warning("Invalid Dodo subscription timestamp: %r", value)
        return None


def _subscription_access_until(payload: dict) -> datetime | None:
    """Return the deadline through which the current charge grants access.

    Dodo documents next_billing_date as the end of the current billing period.
    A past-due subscription keeps access until past_due_ends_at, so that grace
    deadline takes precedence while status is past_due.
    """
    subscription_status = str(payload.get("status") or "").lower()
    if subscription_status == "past_due" or payload.get("past_due_ends_at"):
        grace_end = _parse_webhook_datetime(payload.get("past_due_ends_at"))
        if grace_end:
            return grace_end
    return _parse_webhook_datetime(payload.get("next_billing_date"))


async def _handle_subscription_state(payload: dict) -> None:
    """Sync lifecycle timestamps without granting credits or resetting usage."""
    user_id = (payload.get("metadata") or {}).get("user_id")
    customer = payload.get("customer")
    email = customer.get("email", "") if isinstance(customer, dict) else ""

    row = None
    if user_id:
        row = await db._fetchrow("SELECT id, email FROM users WHERE id=$1", user_id)
    if not row and email:
        row = await db._fetchrow("SELECT id, email FROM users WHERE email=$1", email)
    if not row:
        logger.error("Subscription state sync failed: no user for user_id=%s, email=%s", user_id, email)
        return

    subscription_id = payload.get("subscription_id") or ""
    subscription_status = str(payload.get("status") or "active").lower()
    access_until = _subscription_access_until(payload)

    await db._execute(
        """
        UPDATE users
        SET dodo_subscription_id = COALESCE(NULLIF($1, ''), dodo_subscription_id),
            subscription_status  = $2,
            plan_expires_at      = COALESCE($3, plan_expires_at),
            updated_at           = NOW()
        WHERE id = $4
        """,
        subscription_id, subscription_status, access_until, row["id"],
    )


async def _handle_payment_succeeded(payload: dict) -> None:
    # Prefer the plan we stamped into checkout metadata — the raw product_id
    # Dodo echoes is the prd_… id, which the friendly-name map won't match.
    product_id = payload.get("product_id", "")
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
            f"metadata.plan={meta_plan!r}. "
            f"Granted fallback {_FALLBACK_PAID_PLAN!r}; add this product_id to DODO_PLAN_MAP or "
            f"stamp metadata.plan at checkout to fix. Manual reconciliation likely needed."
        )

    user_id = (payload.get("metadata") or {}).get("user_id")
    customer = payload.get("customer")
    email = customer.get("email", "") if isinstance(customer, dict) else ""

    row = None
    if user_id:
        row = await db._fetchrow("SELECT id, email FROM users WHERE id=$1", user_id)
    if not row and email:
        row = await db._fetchrow("SELECT id, email FROM users WHERE email=$1", email)

    if not row:
        logger.error(f"Payment succeeded but no user found for user_id={user_id}, email={email}")
        return

    user_id = row["id"]
    email = row["email"]
    new_credits      = get_credits_limit(plan_name)
    new_video_mins   = get_video_minutes_limit(plan_name)
    subscription_id  = payload.get("subscription_id") or ""
    subscription_status = str(payload.get("status") or "active").lower()
    access_until = _subscription_access_until(payload)

    await db._execute(
        """
        UPDATE users
        SET plan                = $1,
            credits_limit       = $2,
            credits_used        = 0,
            video_minutes_limit = $3,
            video_minutes_used  = 0,
            credits_reset_at    = date_trunc('month', NOW()),
            dodo_subscription_id = COALESCE(NULLIF($4, ''), dodo_subscription_id),
            subscription_status  = $5,
            plan_expires_at      = COALESCE($6, plan_expires_at, NOW() + INTERVAL '31 days'),
            updated_at           = NOW()
        WHERE id = $7
        """,
        plan_name, new_credits, new_video_mins, subscription_id,
        subscription_status, access_until, user_id,
    )

    logger.info(
        f"Upgraded {email} → {plan_name} "
        f"(credits: {new_credits}, video_mins: {new_video_mins})"
    )


async def _handle_downgrade(payload: dict, subscription_status: str = "cancelled") -> None:
    user_id = (payload.get("metadata") or {}).get("user_id")
    customer = payload.get("customer")
    email = customer.get("email", "") if isinstance(customer, dict) else ""

    row = None
    if user_id:
        row = await db._fetchrow("SELECT id, email FROM users WHERE id=$1", user_id)
    if not row and email:
        row = await db._fetchrow("SELECT id, email FROM users WHERE email=$1", email)

    if not row:
        logger.error(f"Downgrade failed: no user found for user_id={user_id}, email={email}")
        return

    user_id = row["id"]
    email = row["email"]
    # Also reset credits_used / video_minutes_used, clamped to the new
    # (lower) free-tier limits. Otherwise a paid user who'd already used
    # e.g. 25 of 30 clips on starter_30 would land on free with
    # credits_used=25 against credits_limit=2 → videos_remaining=0, fully
    # locked out until the next monthly reset. Clamping preserves the
    # intent (they've used their free-tier allowance this cycle) without
    # the accidental hard lockout.
    free_credits = get_credits_limit("free")
    free_video_mins = get_video_minutes_limit("free")
    subscription_id = payload.get("subscription_id") or ""
    await db._execute(
        """
        UPDATE users
        SET plan                = 'free',
            credits_limit       = $1,
            credits_used        = LEAST(credits_used, $1),
            video_minutes_limit = $2,
            video_minutes_used  = LEAST(video_minutes_used, $2),
            dodo_subscription_id = COALESCE(NULLIF($3, ''), dodo_subscription_id),
            subscription_status  = $4,
            plan_expires_at      = NOW(),
            updated_at           = NOW()
        WHERE id = $5
        """,
        free_credits, free_video_mins, subscription_id, subscription_status, user_id,
    )

    logger.info(f"Downgraded {email} → free plan")
