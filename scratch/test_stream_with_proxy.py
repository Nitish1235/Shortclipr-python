"""Test stream extraction with proxy"""
import asyncio
import sys
import os
import logging
from pathlib import Path

# Load .env
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

# Load environment variables manually
import re
env_file = backend_dir / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key] = val

logging.basicConfig(level=logging.INFO, format='%(name)s - %(levelname)s - %(message)s')

from app.core.proxy import get_proxy_url

VIDEO_ID = "6FNRVY2vYXw"

async def test_with_proxy():
    proxy = get_proxy_url()
    print(f"Proxy URL: {proxy}")
    
    # Test yt-dlp with proxy
    import yt_dlp
    
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "proxy": proxy,
        "format": "best[height<=1080]",
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
        
        if info and info.get("url"):
            print(f"\nSUCCESS! Stream URL: {info['url'][:80]}...")
        else:
            print("\nNo URL in response")
            if info:
                print(f"Available formats: {len(info.get('formats', []))}")
    except Exception as e:
        print(f"\nFAILED: {e}")

asyncio.run(test_with_proxy())