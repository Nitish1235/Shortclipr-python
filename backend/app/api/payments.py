"""
payments.py — Dodo Payments integration for the FastAPI backend.

Flow:
  1. Frontend clicks "Upgrade" on Pricing page
  2. POST /payments/checkout-session {plan, period} → this endpoint
  3. Backend calls Dodo Payments API to create a checkout session
  4. Returns checkout URL → frontend opens Dodo Overlay Checkout
  5. User pays → Dodo fires webhook → webhooks.py upgrades plan in Supabase

Plans are configured as Products in the Dodo Payments dashboard.
Product IDs are stored in env vars: DODO_PRODUCT_*
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUser
from app.core.config import get_settings

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)
settings = get_settings()

DODO_API_BASE = "https://live.dodopayments.com"
DODO_CHECKOUT_ENDPOINT = f"{DODO_API_BASE}/checkouts"

# ── Plan → Dodo Product ID mapping ──────────────────────────────
# Each key maps to a Product ID set in your Dodo dashboard.
# Add these IDs to .env after creating the products.
PRODUCT_IDS: dict[str, str] = {
    # Slider tier plan IDs (monthly, no annual for simplicity)
    "starter_100":  settings.DODO_PRODUCT_STARTER_100,
    "starter_250":  settings.DODO_PRODUCT_STARTER_250,
    "pro_500":      settings.DODO_PRODUCT_PRO_500,
    "pro_1000":     settings.DODO_PRODUCT_PRO_1000,
    "pro_2000":     settings.DODO_PRODUCT_PRO_2000,    # $145 — 2000 shorts
}


class CheckoutRequest(BaseModel):
    plan: str    # starter_100 | starter_250 | pro_500 | pro_1000 | pro_2000
    period: str = "monthly"  # kept for webhook compatibility


@router.post("/checkout-session")
async def create_checkout_session(body: CheckoutRequest, current_user: CurrentUser):
    """
    Create a Dodo Payments checkout session and return the checkout URL.
    Frontend uses this URL with dodopayments-checkout SDK to open the overlay.
    """
    plan = body.plan.lower()

    if plan not in PRODUCT_IDS:
        raise HTTPException(status_code=422, detail=f"Unknown plan: {plan}")

    product_id = PRODUCT_IDS[plan]
    if not product_id:
        raise HTTPException(
            status_code=503,
            detail=f"Product not configured for '{plan}'. Contact support.",
        )

    checkout_url = await _create_dodo_checkout_session(
        product_id=product_id,
        user_email=current_user.email,
        success_url="https://shortclipr.com/payment/success",
        cancel_url="https://shortclipr.com/youtube-shorts#pricing",
        metadata={
            "user_id": current_user.user_id,
            "plan": plan,
        },
    )

    return {"checkout_url": checkout_url, "plan": plan}


async def _create_dodo_checkout_session(
    product_id: str,
    user_email: str,
    success_url: str,
    cancel_url: str,
    metadata: dict,
) -> str:
    """
    Call Dodo Payments API to create a checkout session.
    Returns the checkout URL to pass to DodoPayments.Checkout.open()
    """
    headers = {
        "Authorization": f"Bearer {settings.DODO_PAYMENTS_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "product_cart": [
            {"product_id": product_id, "quantity": 1},
        ],
        "customer": {
            "email": user_email,
        },
        "return_url": success_url,
        "metadata": metadata,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                DODO_CHECKOUT_ENDPOINT,
                json=payload,
                headers=headers,
            )
    except httpx.ConnectError as exc:
        logger.error(f"Dodo API DNS/connect failure: {exc}")
        raise HTTPException(
            status_code=503,
            detail="Payment service unreachable. Please try again.",
        )
    except httpx.TimeoutException as exc:
        logger.error(f"Dodo API timeout: {exc}")
        raise HTTPException(status_code=504, detail="Payment service timed out. Please try again.")
    except httpx.RequestError as exc:
        logger.error(f"Dodo API request error: {exc}")
        raise HTTPException(status_code=502, detail="Payment service connection failed. Please try again.")

    if resp.status_code not in (200, 201):
        logger.error(f"Dodo API error: {resp.status_code} — {resp.text[:500]}")
        raise HTTPException(
            status_code=502,
            detail="Failed to create checkout session. Please try again.",
        )
    data = resp.json()

    checkout_url = data.get("checkout_url") or data.get("url") or data.get("payment_link")
    if not checkout_url:
        logger.error(f"Dodo response missing checkout_url. Keys: {list(data.keys())}")
        raise HTTPException(status_code=502, detail="No checkout URL in Dodo response")

    logger.info(f"Created Dodo checkout session for {user_email} → {plan_from_metadata(metadata)}")
    return checkout_url


def plan_from_metadata(metadata: dict) -> str:
    return f"{metadata.get('plan', '?')}/{metadata.get('period', '?')}"
