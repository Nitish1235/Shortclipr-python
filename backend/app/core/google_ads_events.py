"""Internal audit log for Google Ads conversion milestones.

Browser conversions are sent by the Google tag. This log records the
server-confirmed business action so an admin can reconcile Ads reporting with
actual registrations, checkouts, and paid subscriptions.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def record_google_ads_event(event_name: str, event_id: str, email: str | None = None, product: str | None = None) -> None:
    from app.db import supabase as db
    try:
        await db.insert_google_ads_event(event_name, event_id, email, product)
    except Exception as exc:
        logger.warning("Failed to record Google Ads event %s: %s", event_name, exc)


def record_google_ads_event_background(**kwargs) -> None:
    try:
        asyncio.create_task(record_google_ads_event(**kwargs))
    except Exception as exc:
        logger.warning("Failed to schedule Google Ads event: %s", exc)
