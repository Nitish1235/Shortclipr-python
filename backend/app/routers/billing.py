import json
from datetime import datetime, timezone

import asyncpg
from dodopayments import APIError, AsyncDodoPayments
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

from ..core.config import Settings, get_settings
from ..db import get_pool
from ..dependencies import CurrentUser, current_user
from ..models.schemas import BillingCheckoutStatusResponse, BillingPortalResponse, CheckoutRequest, CheckoutResponse


router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])
checkout_router = APIRouter(prefix="/v1/billing", tags=["billing"])

PAID_PLANS = frozenset({"starter", "creator", "studio"})
ENTITLEMENT_EVENTS = frozenset({"subscription.active", "subscription.renewed"})
PLAN_SYNC_EVENTS = ENTITLEMENT_EVENTS | {"subscription.updated", "subscription.plan_changed", "subscription.unpaused"}
SUSPENDED_EVENTS = frozenset({"subscription.cancelled", "subscription.expired", "subscription.failed", "subscription.on_hold", "subscription.past_due", "subscription.paused"})
KNOWN_SUBSCRIPTION_STATUSES = frozenset({"pending", "active", "cancelled", "expired", "failed", "on_hold", "past_due", "paused"})


def plan_product_id(settings: Settings, plan: str) -> str:
    return {
        "starter": settings.DODO_PRODUCT_STARTER,
        "creator": settings.DODO_PRODUCT_CREATOR,
        "studio": settings.DODO_PRODUCT_STUDIO,
    }.get(plan, "")


def plan_from_product_id(settings: Settings, product_id: object) -> str:
    value = str(product_id or "")
    for plan in PAID_PLANS:
        if plan_product_id(settings, plan) == value:
            return plan
    return ""


def plan_render_seconds(settings: Settings, plan: str) -> int:
    return {
        "starter": settings.DODO_STARTER_MONTHLY_RENDER_SECONDS,
        "creator": settings.DODO_CREATOR_MONTHLY_RENDER_SECONDS,
        "studio": settings.DODO_STUDIO_MONTHLY_RENDER_SECONDS,
    }.get(plan, 0)


def event_time(payload: dict, data: dict) -> datetime:
    raw = payload.get("timestamp") or payload.get("created_at") or data.get("created_at")
    if isinstance(raw, str):
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def checkout_session_id(data: dict) -> str | None:
    """Accept known checkout-session shapes without trusting browser redirects."""
    nested = data.get("checkout_session") or data.get("checkoutSession") or {}
    payment = data.get("payment") or {}
    for value in (data.get("checkout_session_id"), data.get("checkoutSessionId"), nested.get("id"), payment.get("checkout_session_id")):
        if value:
            return str(value)
    return None


def subscription_snapshot(data: dict) -> dict:
    subscription = data.get("subscription")
    return subscription if isinstance(subscription, dict) else data


def event_subscription_id(data: dict) -> str | None:
    subscription = subscription_snapshot(data)
    value = subscription.get("subscription_id") or subscription.get("id") or data.get("subscription_id")
    return str(value) if value else None


def event_plan(settings: Settings, data: dict, metadata: dict) -> str:
    subscription = subscription_snapshot(data)
    plan = plan_from_product_id(settings, subscription.get("product_id") or data.get("product_id"))
    if plan:
        return plan
    candidate = metadata.get("plan")
    return candidate if candidate in PAID_PLANS else ""


def event_cycle_end(data: dict) -> object:
    subscription = subscription_snapshot(data)
    return subscription.get("next_billing_date") or data.get("next_billing_date")


def event_cycle_start(data: dict) -> object:
    subscription = subscription_snapshot(data)
    return subscription.get("previous_billing_date") or data.get("previous_billing_date")


def event_subscription_status(event_type: str, data: dict) -> str:
    """Prefer Dodo's subscription snapshot instead of guessing from the event name."""
    raw = str(subscription_snapshot(data).get("status") or "").strip().lower()
    if raw in KNOWN_SUBSCRIPTION_STATUSES:
        return raw
    if event_type in ENTITLEMENT_EVENTS or event_type == "subscription.unpaused":
        return "active"
    if event_type in SUSPENDED_EVENTS:
        return event_type.split(".", 1)[-1]
    return ""


def dodo_environment(settings: Settings) -> str:
    return "test_mode" if "test" in settings.DODO_API_BASE else "live_mode"


@checkout_router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(payload: CheckoutRequest, user: CurrentUser = Depends(current_user), settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)):
    if user.plan in PAID_PLANS and user.subscription_status == "active":
        raise HTTPException(status_code=409, detail="Manage an active subscription in the billing portal instead of starting another checkout")
    product_id = plan_product_id(settings, payload.plan)
    if not settings.DODO_PAYMENTS_API_KEY or not product_id:
        raise HTTPException(status_code=503, detail="Billing checkout is not configured")
    try:
        async with AsyncDodoPayments(bearer_token=settings.DODO_PAYMENTS_API_KEY, environment=dodo_environment(settings), timeout=30) as client:
            session = await client.checkout_sessions.create(
                product_cart=[{"product_id": product_id, "quantity": 1}],
                customer={"email": user.email, "name": user.full_name or user.email.split("@", 1)[0]},
                metadata={"user_id": str(user.id), "plan": payload.plan},
                return_url=f"{settings.FRONTEND_URL.rstrip('/')}/studio/credits?checkout=returned",
                cancel_url=f"{settings.FRONTEND_URL.rstrip('/')}/studio/credits?checkout=cancelled",
            )
    except APIError:
        raise HTTPException(status_code=502, detail="Dodo could not create checkout") from None
    if not session.checkout_url:
        raise HTTPException(status_code=502, detail="Dodo did not return a checkout URL")
    await pool.execute(
        """INSERT INTO billing_checkout_sessions(session_id,user_id,plan) VALUES($1,$2,$3)
           ON CONFLICT(session_id) DO UPDATE SET user_id=EXCLUDED.user_id,plan=EXCLUDED.plan,status='created'""",
        session.session_id, user.id, payload.plan,
    )
    return {"checkout_url": session.checkout_url, "session_id": session.session_id}


@checkout_router.post("/portal", response_model=BillingPortalResponse)
async def open_billing_portal(user: CurrentUser = Depends(current_user), settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)):
    """Create a short-lived Dodo customer-portal link for the signed-in owner only."""
    if not settings.DODO_PAYMENTS_API_KEY:
        raise HTTPException(status_code=503, detail="Billing portal is not configured")
    row = await pool.fetchrow("SELECT email,dodo_subscription_id FROM users WHERE id=$1", user.id)
    if not row or not row["dodo_subscription_id"]:
        raise HTTPException(status_code=409, detail="No active Dodo subscription is available to manage")
    try:
        async with AsyncDodoPayments(bearer_token=settings.DODO_PAYMENTS_API_KEY, environment=dodo_environment(settings), timeout=30) as client:
            subscription = await client.subscriptions.retrieve(row["dodo_subscription_id"])
            if subscription.customer.email.strip().lower() != row["email"].strip().lower():
                raise HTTPException(status_code=403, detail="The billing subscription does not belong to this account")
            session = await client.customers.customer_portal.create(
                subscription.customer.customer_id,
                return_url=f"{settings.FRONTEND_URL.rstrip('/')}/studio/credits?billing=returned",
            )
    except HTTPException:
        raise
    except APIError:
        raise HTTPException(status_code=502, detail="Dodo could not open the billing portal") from None
    if not session.link:
        raise HTTPException(status_code=502, detail="Dodo did not return a billing portal link")
    return {"portal_url": session.link}


@checkout_router.get("/checkout/{session_id}", response_model=BillingCheckoutStatusResponse)
async def checkout_status(session_id: str, user: CurrentUser = Depends(current_user), pool: asyncpg.Pool = Depends(get_pool)):
    """Return only the signed-in owner's server-recorded checkout state.

    The browser uses this after Dodo redirects back. It never trusts query-string
    payment fields; only the verified webhook can mark a checkout completed.
    """
    row = await pool.fetchrow(
        "SELECT session_id,plan,status FROM billing_checkout_sessions WHERE session_id=$1 AND user_id=$2",
        session_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Checkout session not found")
    status_value = row["status"] if row["status"] in {"created", "completed", "failed"} else "created"
    return {"session_id": row["session_id"], "plan": row["plan"], "status": status_value}


@router.post("/dodo", status_code=204)
async def dodo_webhook(request: Request, settings: Settings = Depends(get_settings), pool: asyncpg.Pool = Depends(get_pool)):
    raw=await request.body()
    if not settings.DODO_PAYMENTS_WEBHOOK_SECRET and not settings.DODO_ALLOW_UNSIGNED_WEBHOOKS:
        raise HTTPException(status_code=503,detail="Dodo webhook verification is not configured")
    try:
        if settings.DODO_PAYMENTS_WEBHOOK_SECRET:
            payload=Webhook(settings.DODO_PAYMENTS_WEBHOOK_SECRET).verify(raw,dict(request.headers))
        else:
            payload=json.loads(raw)
    except (WebhookVerificationError,ValueError,json.JSONDecodeError):
        raise HTTPException(status_code=401,detail="Invalid webhook signature") from None
    event_id=str(payload.get("id") or request.headers.get("webhook-id") or "")
    event_type=str(payload.get("type") or payload.get("event_type") or "unknown")
    if not event_id: raise HTTPException(status_code=400,detail="Webhook id is required")
    data=payload.get("data") or {}
    if not isinstance(data,dict):
        raise HTTPException(status_code=400,detail="Webhook data must be an object")
    snapshot=subscription_snapshot(data)
    metadata=data.get("metadata") or snapshot.get("metadata") or {}
    metadata=metadata if isinstance(metadata,dict) else {}
    user_id=metadata.get("user_id") or metadata.get("userId")
    occurred_at=event_time(payload,data)
    async with pool.acquire() as connection:
        async with connection.transaction():
            inserted=await connection.fetchval("INSERT INTO dodo_webhook_events(id,event_type,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING id",event_id,event_type,json.dumps(payload))
            if not inserted:return Response(status_code=204)
            session_id=checkout_session_id(data)
            session_row=await connection.fetchrow("SELECT user_id,plan FROM billing_checkout_sessions WHERE session_id=$1 FOR UPDATE",session_id) if session_id else None
            # A checkout-session record is the server-owned binding between this
            # payment and a user.  Prefer it over mutable provider metadata.
            if session_row:
                user_id=str(session_row["user_id"])
            if user_id and event_type in PLAN_SYNC_EVENTS:
                plan = event_plan(settings, data, metadata) or (session_row["plan"] if session_row else "")
                access_status = event_subscription_status(event_type, data)
                user_updated = None
                if plan:
                    subscription_id=event_subscription_id(data)
                    user_updated = await connection.fetchval(
                        """UPDATE users SET plan=$2,subscription_status=$6,dodo_subscription_id=COALESCE($3,dodo_subscription_id),
                           plan_expires_at=COALESCE($4::timestamptz,plan_expires_at),dodo_event_at=$5
                           WHERE id=$1 AND (dodo_event_at IS NULL OR dodo_event_at<=$5)
                           RETURNING id""",
                        user_id,plan,subscription_id,event_cycle_end(data),occurred_at,access_status or "active",
                    )
                # Only a first activation or completed renewal grants a fresh
                # monthly allowance. Profile updates and stale events cannot
                # reset credits. Preserve active reservations across a cycle
                # boundary so an in-flight render can still settle safely.
                if plan and user_updated and event_type in ENTITLEMENT_EVENTS:
                    credits = plan_render_seconds(settings, plan)
                    cycle_start = event_cycle_start(data)
                    subscription_id = event_subscription_id(data) or f"user-{user_id}"
                    grant_key = f"dodo:{subscription_id}:{cycle_start or occurred_at.isoformat()}:grant"
                    grant_created = await connection.fetchval(
                        """INSERT INTO credit_ledger(user_id,entry_type,amount,idempotency_key,metadata)
                           VALUES($1,'grant',$2,$3,jsonb_build_object('plan',$4,'event_type',$5))
                           ON CONFLICT DO NOTHING RETURNING id""",
                        user_id,credits,grant_key,plan,event_type,
                    )
                    if grant_created:
                        await connection.execute("""
                            INSERT INTO credit_accounts(user_id,total_credits,spent_credits,reserved_credits,cycle_started_at,cycle_ends_at)
                            VALUES($1,$2,0,0,COALESCE($3::timestamptz,now()),COALESCE($4::timestamptz,now()+interval '1 month'))
                            ON CONFLICT(user_id) DO UPDATE SET
                                total_credits=EXCLUDED.total_credits+credit_accounts.reserved_credits,
                                spent_credits=0,
                                cycle_started_at=EXCLUDED.cycle_started_at,
                                cycle_ends_at=EXCLUDED.cycle_ends_at
                        """,user_id,credits,cycle_start,event_cycle_end(data))
                elif plan and user_updated and event_type == "subscription.plan_changed":
                    credits = plan_render_seconds(settings, plan)
                    await connection.execute(
                        """UPDATE credit_accounts
                           SET total_credits=GREATEST($2,spent_credits+reserved_credits),
                               cycle_ends_at=COALESCE($3::timestamptz,cycle_ends_at)
                           WHERE user_id=$1""",
                        user_id,credits,event_cycle_end(data),
                    )
                if session_row and access_status == "active":
                    await connection.execute("UPDATE billing_checkout_sessions SET status='completed',completed_at=now() WHERE session_id=$1",session_id)
                elif plan and user_updated and event_type == "subscription.active":
                    # Subscription webhooks carry our metadata but do not
                    # guarantee a checkout-session id. Complete the newest
                    # matching server-owned session for return-page polling.
                    await connection.execute(
                        """UPDATE billing_checkout_sessions SET status='completed',completed_at=now()
                           WHERE session_id=(
                               SELECT session_id FROM billing_checkout_sessions
                               WHERE user_id=$1 AND plan=$2 AND status='created'
                               ORDER BY created_at DESC LIMIT 1
                           )""",
                        user_id,plan,
                    )
            elif user_id and event_type in SUSPENDED_EVENTS:
                status_value=event_subscription_status(event_type,data)
                await connection.execute(
                    """UPDATE users SET subscription_status=$2,
                       plan_expires_at=COALESCE($3::timestamptz,plan_expires_at),dodo_event_at=$4
                       WHERE id=$1 AND (dodo_event_at IS NULL OR dodo_event_at<=$4)""",
                    user_id,status_value,event_cycle_end(data),occurred_at,
                )
            elif event_type in {"checkout_session.expired","payment.failed"}:
                if session_row:
                    await connection.execute("UPDATE billing_checkout_sessions SET status='failed' WHERE session_id=$1 AND status='created'",session_id)
                elif user_id and metadata.get("plan") in PAID_PLANS:
                    await connection.execute(
                        """UPDATE billing_checkout_sessions SET status='failed'
                           WHERE session_id=(
                               SELECT session_id FROM billing_checkout_sessions
                               WHERE user_id=$1 AND plan=$2 AND status='created'
                               ORDER BY created_at DESC LIMIT 1
                           )""",
                        user_id,metadata["plan"],
                    )
            await connection.execute("UPDATE dodo_webhook_events SET processed_at=now() WHERE id=$1",event_id)
    return Response(status_code=204)
