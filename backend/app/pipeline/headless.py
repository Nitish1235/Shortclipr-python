import asyncio
import json
import logging
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

logger = logging.getLogger(__name__)

async def get_player_data_headless(video_id: str) -> dict:
    """
    Uses a headless browser (Playwright) to fetch InnerTube player data.
    Bypasses simple bot detection by mimicking a real user session.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a realistic user agent
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        page = await context.new_page()
        # Apply stealth patterns
        await stealth_async(page)
        
        try:
            logger.info(f"Navigating to {url} via Headless Browser...")
            # Navigate and wait for some player signals
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            # Wait a few seconds for JS to populate ytInitialPlayerResponse
            # We don't need to wait for full network idle, just for the variable to exist
            await asyncio.sleep(2)
            
            # Extract the player response from the window object
            player_data = await page.evaluate("() => window.ytInitialPlayerResponse")
            
            if not player_data:
                logger.error("Failed to extract ytInitialPlayerResponse from page.")
                # Fallback: check if we were redirected to a login page or CAPTCHA
                if "google.com/sorry" in page.url:
                    raise RuntimeError("Bypassed by CAPTCHA.")
                raise RuntimeError("ytInitialPlayerResponse is empty.")

            return player_data
            
        except Exception as e:
            logger.error(f"Headless extraction failed for {video_id}: {e}")
            raise
        finally:
            await browser.close()
