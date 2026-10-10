"""Meta Conversions API delivery for server-confirmed conversion events."""

import asyncio
import hashlib
import logging
import time

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


async def send_meta_event(
    event_name: str,
    event_id: str,
    email: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    fbp: str | None = None,
    fbc: str | None = None,
    custom_data: dict | None = None,
) -> None:
    """Log and submit a Meta Conversions API event without blocking the request."""
    from app.db import supabase as db

    try:
        await db.insert_meta_event(event_name, event_id, email, ip, user_agent)
    except Exception as exc:
        logger.warning("Failed to log internal Meta event %s: %s", event_name, exc)

    settings = get_settings()
    if not settings.META_PIXEL_ID or not settings.META_CONVERSIONS_API_TOKEN:
        return

    user_data = {}
    if email:
        user_data['em'] = [_sha256(email)]
    if ip:
        user_data['client_ip_address'] = ip
    if user_agent:
        user_data['client_user_agent'] = user_agent
    if fbp:
        user_data['fbp'] = fbp
    if fbc:
        user_data['fbc'] = fbc

    event = {
        'event_name': event_name,
        'event_time': int(time.time()),
        'event_id': event_id,
        'action_source': 'website',
        'user_data': user_data,
    }
    if custom_data:
        event['custom_data'] = custom_data

    payload = {'data': [event]}
    if settings.META_TEST_EVENT_CODE:
        payload['test_event_code'] = settings.META_TEST_EVENT_CODE

    url = f'https://graph.facebook.com/v22.0/{settings.META_PIXEL_ID}/events'
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                url,
                params={'access_token': settings.META_CONVERSIONS_API_TOKEN},
                json=payload,
            )
            if response.status_code >= 300:
                logger.warning('Meta Conversions API error: %s - %s', response.status_code, response.text)
    except Exception as exc:
        logger.warning('Failed to send Meta conversion event: %s', exc)


def send_meta_event_background(**kwargs) -> None:
    try:
        asyncio.create_task(send_meta_event(**kwargs))
    except Exception as exc:
        logger.warning('Failed to schedule Meta conversion event: %s', exc)
