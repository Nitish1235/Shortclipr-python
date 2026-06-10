"""
Test all stream methods for a video ID individually to diagnose failures.
"""
import asyncio
import sys
sys.path.insert(0, 'backend')

from app.core.proxy import get_proxy_url
from app.pipeline.stream import (
    call_player_api,
    _ytdlp_base_opts,
    _ytdlp_run_sync,
    _fmt,
)

VIDEO_ID = "6FNRVY2vYXw"

async def test_innertube_android():
    """Test Method 1: InnerTube ANDROID + proxy"""
    print("\n=== Testing InnerTube ANDROID + proxy ===")
    proxy = get_proxy_url()
    print(f"Proxy URL: {proxy}")
    try:
        data = await call_player_api(VIDEO_ID, client_name="ANDROID", send_params=True, proxy_url=proxy)
        blocked, reason = call_player_api.__wrapped__.__code__.co_consts  # Just to see if we can check blocked status
        print("Success! Keys:", list(data.keys()))
        if "streamingData" in data:
            formats = data["streamingData"].get("formats", []) + data["streamingData"].get("adaptiveFormats", [])
            print(f"Found {len(formats)} formats")
            for f in sorted(formats, key=lambda x: x.get("height", 0), reverse=True)[:5]:
                print(f"  - itag={f.get('itag')}, height={f.get('height')}, ext={f.get('ext')}, mime={f.get('mimeType')}")
    except Exception as e:
        print(f"Failed: {type(e).__name__}: {e}")

async def test_ytdlp_list_formats():
    """List available formats for the video"""
    print("\n=== Listing available yt-dlp formats ===")
    proxy = get_proxy_url()
    print(f"Proxy URL: {proxy}")
    
    import yt_dlp
    opts = {
        "quiet": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
    }
    if proxy:
        opts["proxy"] = proxy
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
        if info:
            formats = info.get("formats", [])
            print(f"Total formats available: {len(formats)}")
            for f in sorted(formats, key=lambda x: x.get("height", 0) or 0, reverse=True)[:15]:
                print(f"  - format_id={f.get('format_id')}, height={f.get('height')}, ext={f.get('ext')}, vcodec={f.get('vcodec')}, acodec={f.get('acodec')}")
    except Exception as e:
        print(f"Failed to list formats: {e}")

async def test_ytdlp_methods():
    """Test each yt-dlp method individually"""
    print("\n=== Testing yt-dlp methods ===")
    proxy = get_proxy_url()
    
    methods = [
        ("yt-dlp+tv_embedded", "tv_embedded", _fmt(1080)),
        ("yt-dlp+1080p-relaxed", None, "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"),
        ("yt-dlp+default", None, "bestvideo+bestaudio/best"),
        ("yt-dlp+android", "android", _fmt(1080)),
        ("yt-dlp+web", "web", _fmt(1080)),
    ]
    
    for label, client, format_str in methods:
        print(f"\n--- Testing {label} ---")
        opts = _ytdlp_base_opts(proxy)
        opts["format"] = format_str
        if client:
            opts["extractor_args"] = {"youtube": {"player_client": [client]}}
        
        try:
            info = await asyncio.get_running_loop().run_in_executor(
                None,
                _ytdlp_run_sync,
                opts,
                f"https://www.youtube.com/watch?v={VIDEO_ID}",
            )
            # Check what format was actually selected
            selected_format = format_str
            print(f"Success! Format selector: {format_str}")
        except Exception as e:
            print(f"Failed: {type(e).__name__}: {str(e)[:200]}")

async def main():
    await test_innertube_android()
    await test_ytdlp_list_formats()
    await test_ytdlp_methods()

if __name__ == "__main__":
    asyncio.run(main())