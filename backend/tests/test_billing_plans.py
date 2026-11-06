import unittest

from app.core.config import Settings
from app.routers.billing import (
    ENTITLEMENT_EVENTS,
    PLAN_SYNC_EVENTS,
    SUSPENDED_EVENTS,
    event_plan,
    event_cycle_end,
    event_cycle_start,
    event_subscription_status,
    event_subscription_id,
    plan_from_product_id,
    plan_product_id,
    plan_render_seconds,
)


class BillingPlanTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            DODO_PRODUCT_STARTER="prod_starter",
            DODO_PRODUCT_CREATOR="prod_creator",
            DODO_PRODUCT_STUDIO="prod_studio",
        )

    def test_each_paid_plan_uses_its_own_dodo_product(self):
        self.assertEqual(plan_product_id(self.settings, "starter"), "prod_starter")
        self.assertEqual(plan_product_id(self.settings, "creator"), "prod_creator")
        self.assertEqual(plan_product_id(self.settings, "studio"), "prod_studio")

    def test_paid_allowances_are_exact_render_seconds(self):
        self.assertEqual(self.settings.FREE_MONTHLY_RENDER_SECONDS, 15)
        self.assertEqual(plan_render_seconds(self.settings, "starter"), 600)
        self.assertEqual(plan_render_seconds(self.settings, "creator"), 1800)
        self.assertEqual(plan_render_seconds(self.settings, "studio"), 4200)
        self.assertEqual(plan_render_seconds(self.settings, "free"), 0)

    def test_provider_product_is_authoritative_over_metadata(self):
        payload = {"subscription": {"id": "sub_123", "product_id": "prod_creator"}}
        self.assertEqual(plan_from_product_id(self.settings, "prod_creator"), "creator")
        self.assertEqual(event_plan(self.settings, payload, {"plan": "starter"}), "creator")
        self.assertEqual(event_subscription_id(payload), "sub_123")

    def test_lifecycle_event_sets_cover_entitlement_and_access(self):
        self.assertIn("subscription.active", ENTITLEMENT_EVENTS)
        self.assertIn("subscription.renewed", ENTITLEMENT_EVENTS)
        self.assertIn("subscription.plan_changed", PLAN_SYNC_EVENTS)
        self.assertIn("subscription.cancelled", SUSPENDED_EVENTS)
        self.assertIn("subscription.past_due", SUSPENDED_EVENTS)

    def test_subscription_snapshot_controls_status_and_billing_cycle(self):
        payload = {
            "status": "past_due",
            "previous_billing_date": "2026-10-06T10:00:00Z",
            "next_billing_date": "2026-11-06T10:00:00Z",
        }
        self.assertEqual(event_subscription_status("subscription.updated", payload), "past_due")
        self.assertEqual(event_cycle_start(payload), "2026-10-06T10:00:00Z")
        self.assertEqual(event_cycle_end(payload), "2026-11-06T10:00:00Z")

    def test_updated_pending_subscription_is_not_promoted_to_active(self):
        self.assertEqual(event_subscription_status("subscription.updated", {"status": "pending"}), "pending")
        self.assertEqual(event_subscription_status("subscription.renewed", {}), "active")


if __name__ == "__main__":
    unittest.main()
