import httpx
import logging
import asyncio
import hashlib
import time
from app.core.config import get_settings

logger = logging.getLogger(__name__)

async def send_tiktok_event(event_name: str, event_id: str, email: str = None, ip: str = None, user_agent: str = None):
    from app.db import supabase as db
    
    # Fire and forget database log
    try:
        await db.insert_tiktok_event(event_name, event_id, email, ip, user_agent)
    except Exception as e:
        logger.warning(f"Failed to log internal TikTok event {event_name}: {e}")

    settings = get_settings()
    if not settings.TIKTOK_PIXEL_ID or not settings.TIKTOK_ACCESS_TOKEN:
        return
        
    url = "https://business-api.tiktok.com/open_api/v1.3/pixel/track/"
    
    user_context = {}
    if email:
        hashed_email = hashlib.sha256(email.lower().strip().encode()).hexdigest()
        user_context["email"] = hashed_email
        
    context = {}
    if ip:
        context["ip"] = ip
    if user_agent:
        context["user_agent"] = user_agent
        
    event_data = {
        "event": event_name,
        "event_id": event_id,
        "event_time": int(time.time()),
        "user": user_context,
        "event_source": "web"
    }
    
    if context:
        event_data["context"] = context
        
    payload = {
        "pixel_code": settings.TIKTOK_PIXEL_ID,
        "data": [event_data]
    }
    
    headers = {
        "Access-Token": settings.TIKTOK_ACCESS_TOKEN,
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"TikTok Events API error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.warning(f"Failed to send TikTok event: {e}")

def send_tiktok_event_background(event_name: str, event_id: str, email: str = None, ip: str = None, user_agent: str = None):
    """
    Fire and forget helper to dispatch a TikTok event in the background.
    """
    try:
        asyncio.create_task(send_tiktok_event(event_name, event_id, email, ip, user_agent))
    except Exception as e:
        logger.warning(f"Failed to schedule TikTok event: {e}")
