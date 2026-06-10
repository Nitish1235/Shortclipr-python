import sys
import os
import asyncio
from pathlib import Path

backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

env_file = backend_dir / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key] = val

from app.pipeline.stream import get_stream_url

async def test():
    try:
        url = await get_stream_url("6FNRVY2vYXw", "1080p")
        print(f"SUCCESS! Stream URL: {url[:80]}...")
    except Exception as e:
        print(f"FAILED: {e}")

asyncio.run(test())