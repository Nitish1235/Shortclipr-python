"""
Comprehensive test script for Cloud Run - tests all stream methods and reports which work.
"""
import asyncio
import sys
import os
from pathlib import Path

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

import logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

# Check if running in Cloud Run - use real proxy settings
# Otherwise load from .env
if not os.environ.get('K_SERVICE'):
    # Load from .env for local testing
    env_file = backend_dir / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key] = val

from app.core.proxy import get_proxy_url
import yt_dlp

VIDEO_ID = "6FNRVY2vYXw"

async def test_method(name: str, format_str: str, client: str | None, proxy: str | None):
    """Test a single fallback method"""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
    }
    if proxy:
        opts["proxy"] = proxy
    opts["format"] = format_str
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    
    def run_sync():
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
    
    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(None, run_sync)
        url = info.get("url")
        if url:
            return f"SUCCESS: {url[:60]}..."
        return "FAILED: No URL in response"
    except Exception as e:
        return f"FAILED: {str(e)[:120]}"

async def main():
    proxy = get_proxy_url()
    print(f"Proxy configured: {bool(proxy)}")
    if proxy:
        # Safe display
        safe_proxy = f"{proxy[:20]}...{proxy[-20:]}"
        print(f"Proxy URL: {safe_proxy}")
    
    methods = [
        ("1. InnerTube ANDROID (will fail with RuntimeError - needs httpx)", None, None),
        ("2. yt-dlp + android + best", "best", "android"),
        ("3. yt-dlp + mweb + best", "best", "mweb"),
        ("4. yt-dlp + ios + best", "best", "ios"),
        ("5. yt-dlp + web + best", "best", "web"),
        ("6. yt-dlp + android + constrained", "bestvideo[height<=1080]+bestaudio/best", "android"),
        ("7. yt-dlp + unconstrained + best", "best", None),
    ]
    
    print("\nTesting stream methods:\n")
    for name, format_str, client in methods:
        result = await test_method(name, format_str, client, proxy)
        print(f"{name}: {result}")

if __name__ == "__main__":
    asyncio.run(main())