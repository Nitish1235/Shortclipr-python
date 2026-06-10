"""
Comprehensive test of all stream methods - simulating Cloud Run environment.
Tests each method individually to identify which ones work/fail.
"""
import asyncio
import sys
import os
import logging
from pathlib import Path

# Load .env
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

# Load environment variables manually
env_file = backend_dir / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ[key] = val

logging.basicConfig(level=logging.WARNING, format='%(name)s - %(levelname)s - %(message)s')

from app.core.proxy import get_proxy_url
from app.pipeline.stream import (
    call_player_api,
    _fmt,
    _fmt_relaxed,
    _pick_stream_ytdlp,
    _YTDLP_POOL,
    _ytdlp_run_sync,
    _ytdlp_base_opts,
    _innertube_is_blocked,
    _ytdlp_is_blocked,
)

VIDEO_ID = "6FNRVY2vYXw"

async def test_innertube_android():
    """Test InnerTube ANDROID + proxy"""
    print("\n=== Testing InnerTube ANDROID + proxy ===")
    proxy = get_proxy_url()
    
    try:
        data = await call_player_api(VIDEO_ID, client_name="ANDROID", send_params=True, proxy_url=proxy)
        
        blocked, reason = _innertube_is_blocked(data)
        if blocked:
            print(f"  BLOCKED: {reason}")
        else:
            print(f"  SUCCESS! playabilityStatus: {data.get('playabilityStatus', {}).get('status')}")
            if "streamingData" in data:
                formats = data["streamingData"].get("formats", []) + data["streamingData"].get("adaptiveFormats", [])
                print(f"  Formats count: {len(formats)}")
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {str(e)[:150]}")

async def test_ytdlp_method(label: str, format_str: str, client: str | None = None):
    """Test a single yt-dlp method"""
    proxy = get_proxy_url()
    opts = _ytdlp_base_opts(proxy)
    opts["format"] = format_str
    if client:
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
    
    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(
            _YTDLP_POOL,
            _ytdlp_run_sync,
            opts,
            f"https://www.youtube.com/watch?v={VIDEO_ID}",
        )
        
        url = _pick_stream_ytdlp(info)
        if url:
            print(f"  SUCCESS! URL: {url[:60]}...")
        else:
            print(f"  No URL in response")
    except Exception as e:
        msg = str(e)
        if _ytdlp_is_blocked(msg):
            print(f"  BLOCKED SIGNAL: {msg[:120]}")
        else:
            print(f"  FAILED: {msg[:120]}")

async def test_all_methods():
    """Test all stream methods"""
    proxy = get_proxy_url()
    print(f"\nProxy: {proxy}")
    
    methods = [
        ("yt-dlp+tv_embedded (fmt)", _fmt(1080), "tv_embedded"),
        ("yt-dlp+1080p-relaxed", _fmt_relaxed(1080), None),
        ("yt-dlp+default (best)", "best", None),
        ("yt-dlp+android (fmt)", _fmt(1080), "android"),
        ("yt-dlp+web (fmt)", _fmt(1080), "web"),
        ("yt-dlp+mweb (best)", "best", "mweb"),
        ("yt-dlp+ios (best)", "best", "ios"),
    ]
    
    for label, format_str, client in methods:
        print(f"\n--- {label} ---")
        await test_ytdlp_method(label, format_str, client)

async def main():
    print("="*60)
    print(f"Testing stream extraction for video: {VIDEO_ID}")
    print("="*60)
    
    await test_innertube_android()
    await test_all_methods()

if __name__ == "__main__":
    asyncio.run(main())