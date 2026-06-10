import sys
import os
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

# Override proxy settings BEFORE importing
os.environ["PROXY_HOST"] = ""
os.environ["PROXY_USER"] = ""
os.environ["PROXY_PASS"] = ""

from app.pipeline.stream import get_stream_url

async def test():
    try:
        url = await get_stream_url("6FNRVY2vYXw", "1080p")
        print(f"SUCCESS! Stream URL: {url[:80]}...")
    except Exception as e:
        print(f"FAILED: {e}")

asyncio.run(test())