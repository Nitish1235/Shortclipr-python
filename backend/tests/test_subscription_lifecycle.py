import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from app.api import webhooks
from app.db import supabase as db


class SubscriptionExpiryTests(unittest.IsolatedAsyncioTestCase):
    async def test_expired_paid_plan_is_downgraded_on_user_lookup(self):
        user = {
            "id": "user-1",
            "plan": "starter_30",
            "plan_expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
            "credits_used": 12,
            "video_minutes_used": 50,
        }
        with patch.object(db, "_execute", new=AsyncMock(return_value="UPDATE 1")) as execute:
            result = await db._enforce_expired_subscriptions(user)

        self.assertEqual(result["plan"], "free")
        self.assertEqual(result["subscription_status"], "expired")
        self.assertEqual(execute.await_count, 1)

    async def test_unexpired_paid_plan_is_preserved(self):
        user = {
            "id": "user-2",
            "plan": "growth_100",
            "plan_expires_at": datetime.now(timezone.utc) + timedelta(days=2),
        }
        with patch.object(db, "_execute", new=AsyncMock()) as execute:
            result = await db._enforce_expired_subscriptions(user)

        self.assertEqual(result["plan"], "growth_100")
        execute.assert_not_awaited()

    async def test_internal_marketer_plan_does_not_expire(self):
        user = {
            "id": "user-3",
            "plan": "marketer",
            "plan_expires_at": datetime.now(timezone.utc) - timedelta(days=10),
        }
        with patch.object(db, "_execute", new=AsyncMock()) as execute:
            result = await db._enforce_expired_subscriptions(user)

        self.assertEqual(result["plan"], "marketer")
        execute.assert_not_awaited()

    def test_next_billing_date_is_paid_period_deadline(self):
        deadline = "2026-11-08T10:30:00Z"
        parsed = webhooks._subscription_access_until({
            "status": "active",
            "next_billing_date": deadline,
        })
        self.assertEqual(parsed, datetime(2026, 11, 8, 10, 30, tzinfo=timezone.utc))

    def test_past_due_grace_deadline_takes_precedence(self):
        parsed = webhooks._subscription_access_until({
            "status": "past_due",
            "next_billing_date": "2026-10-01T00:00:00Z",
            "past_due_ends_at": "2026-10-12T00:00:00Z",
        })
        self.assertEqual(parsed, datetime(2026, 10, 12, tzinfo=timezone.utc))

    async def test_renewal_persists_subscription_and_new_deadline(self):
        payload = {
            "subscription_id": "sub_123",
            "status": "active",
            "next_billing_date": "2026-11-08T00:00:00Z",
            "product_id": "ignored-because-metadata-wins",
            "metadata": {"user_id": "user-4", "plan": "starter_30"},
            "customer": {"email": "paid@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-4", "email": "paid@example.com"
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_payment_succeeded(payload)

        args = execute.await_args.args
        self.assertEqual(args[4], "sub_123")
        self.assertEqual(args[5], "active")
        self.assertEqual(args[6], datetime(2026, 11, 8, tzinfo=timezone.utc))
        self.assertIsNone(args[7])
        self.assertEqual(args[8], "user-4")

    async def test_product_id_overrides_stale_plan_change_metadata(self):
        payload = {
            "subscription_id": "sub_changed",
            "status": "active",
            "next_billing_date": "2026-11-08T00:00:00Z",
            "product_id": "pdt_0NgeHduLpMYA9bXMHQopz",
            "metadata": {"user_id": "user-9", "plan": "growth_100"},
            "customer": {"email": "changed@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-9", "email": "changed@example.com"
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_payment_succeeded(payload, reset_usage=False)

        self.assertEqual(execute.await_args.args[1], "starter_100")

    def test_payment_service_period_is_paid_period_deadline(self):
        parsed = webhooks._subscription_access_until({
            "subscription_id": "sub_123",
            "service_periods": [
                {
                    "subscription_id": "sub_123",
                    "ends_at": "2026-12-08T00:00:00Z",
                }
            ],
        })
        self.assertEqual(parsed, datetime(2026, 12, 8, tzinfo=timezone.utc))

    async def test_unpause_restores_plan_without_resetting_usage(self):
        payload = {
            "subscription_id": "sub_resume",
            "status": "active",
            "next_billing_date": "2026-11-08T00:00:00Z",
            "metadata": {"user_id": "user-6", "plan": "starter_30"},
            "customer": {"email": "resume@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-6", "email": "resume@example.com"
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_payment_succeeded(payload, reset_usage=False)

        query = execute.await_args.args[0]
        self.assertNotIn("credits_used", query)
        self.assertNotIn("video_minutes_used", query)

    async def test_same_paid_period_does_not_reset_usage_twice(self):
        payload = {
            "subscription_id": "sub_same_period",
            "status": "active",
            "next_billing_date": "2026-11-08T00:00:00Z",
            "metadata": {"user_id": "user-8", "plan": "starter_30"},
            "customer": {"email": "same-period@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-8", "email": "same-period@example.com"
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_payment_succeeded(payload)

        query = execute.await_args.args[0]
        self.assertIn("plan_expires_at < $6", query)
        self.assertIn("THEN 0 ELSE credits_used END", query)

    async def test_failed_payment_preserves_entitlement_and_deadline(self):
        payload = {
            "subscription_id": "sub_failed",
            "metadata": {"user_id": "user-7"},
            "customer": {"email": "failed@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-7",
                "email": "failed@example.com",
                "dodo_subscription_id": "sub_failed",
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_payment_failed(payload)

        query = execute.await_args.args[0]
        self.assertNotIn("SET plan", query)
        self.assertNotIn("plan_expires_at", query)
        self.assertIn("subscription_status = 'payment_failed'", query)

    async def test_past_due_sync_does_not_reset_usage_or_credits(self):
        payload = {
            "subscription_id": "sub_grace",
            "status": "past_due",
            "past_due_ends_at": "2026-10-12T00:00:00Z",
            "metadata": {"user_id": "user-5", "plan": "starter_30"},
            "customer": {"email": "grace@example.com"},
        }
        with (
            patch.object(webhooks.db, "_fetchrow", new=AsyncMock(return_value={
                "id": "user-5", "email": "grace@example.com"
            })),
            patch.object(webhooks.db, "_execute", new=AsyncMock()) as execute,
        ):
            await webhooks._handle_subscription_state(payload)

        query = execute.await_args.args[0]
        self.assertNotIn("credits_used", query)
        self.assertNotIn("video_minutes_used", query)
        self.assertEqual(execute.await_args.args[1], "sub_grace")
        self.assertEqual(execute.await_args.args[2], "past_due")


if __name__ == "__main__":
    unittest.main()
