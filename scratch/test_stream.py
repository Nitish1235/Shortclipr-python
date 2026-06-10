"""
Test script to diagnose stream extraction issues for a YouTube video.
Tests all stream methods individually with the configured proxy.
"""
import asyncio
import sys
import os
import logging

# Set up path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Set environment
os.environ.setdefault('APP_ENV', 'development')

logging.basicConfig(level=logging.DEBUG, format='%(name)s - %(levelname)s - %(message)s')

from app.core.proxy import get_proxy_url
import yt_dlp

VIDEO_ID = "6FNRVY2vYXw"

def test_ytdlp_formats():
    """Test different format selectors"""
    print("\n" + "="*60)
    print("TESTING yt-dlp FORMAT SELECTORS")
    print("="*60)
    
    proxy = get_proxy_url()
    print(f"Proxy: {proxy}")
    
    selectors = [
        ("best[height<=1080]", "No extension constraint, capped at 1080p"),
        ("best", "No constraints - any format"),
        ("bestvideo[height<=720]+bestaudio/best", "Video+audio split, capped at 720p"),
        ("bestvideo[height<=480]+bestaudio/best", "Video+audio split, capped at 480p"),
        ("bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best", "Original _fmt selector"),
    ]
    
    for selector, desc in selectors:
        print(f"\n--- Selector: {selector} ({desc}) ---")
        opts = {
            "quiet": True,
            "no_warnings": True,
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
                url = info.get("url")
                if not url and info.get("formats"):
                    # Get first format URL
                    for f in info.get("formats", []):
                        if f.get("url") and "googlevideo.com" in f.get("url", ""):
                            url = f.get("url")
                            break
                if url:
                    print(f"  SUCCESS! URL: {url[:80]}...")
                else:
                    print(f"  No URL found in response")
            else:
                print(f"  No info returned")
        except Exception as e:
            print(f"  FAILED: {str(e)[:200]}")

def test_ytdlp_clients():
    """Test different YouTube clients"""
    print("\n" + "="*60)
    print("TESTING yt-dlp CLIENT VARIANTS")
    print("="*60)
    
    proxy = get_proxy_url()
    
    clients = [
        ("web", "Default web client"),
        ("android", "Android client"),
        ("ios", "iOS client"),
        ("tv", "TV HTML5 client"),
        ("mweb", "Mobile web client"),
    ]
    
    for client, desc in clients:
        print(f"\n--- Client: {client} ({desc}) ---")
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "format": "best[height<=1080]",
        }
        if proxy:
            opts["proxy"] = proxy
        opts["extractor_args"] = {"youtube": {"player_client": [client]}}
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
            
            if info:
                url = info.get("url")
                if not url and info.get("formats"):
                    for f in info.get("formats", []):
                        if f.get("url"):
                            url = f.get("url")
                            break
                if url:
                    print(f"  SUCCESS! URL: {url[:80]}...")
                else:
                    print(f"  No URL found")
            else:
                print(f"  No info returned")
        except Exception as e:
            error_msg = str(e)
            print(f"  FAILED: {error_msg[:150]}")

def test_innertube():
    """Test InnerTube API directly"""
    print("\n" + "="*60)
    print("TESTING INNERTUBE API")
    print("="*60)
    
    import httpx
    from app.core.config import get_settings
    
    settings = get_settings()
    proxy = get_proxy_url()
    
    # ANDROID client config
    payload = {
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "19.44.41",
                "androidSdkVersion": 34,
                "hl": "en",
                "gl": "US",
                "osName": "Android",
                "osVersion": "14",
                "platform": "MOBILE",
            }
        },
        "videoId": VIDEO_ID,
        "playbackContext": {
            "contentPlaybackContext": {
                "vis": 0,
                "splay": False,
                "referer": f"https://www.youtube.com/watch?v={VIDEO_ID}",
                "signatureTimestamp": 20000,
            }
        },
        "contentCheckOk": True,
        "racyCheckOk": True,
    }
    
    headers = {
        "User-Agent": "com.google.android.youtube/19.44.41 (Linux; U; Android 14; en_US; Pixel 8 Build/AP2A.240905.003) gzip",
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": "19.44.41",
        "Content-Type": "application/json",
        "X-Goog-Api-Format-Version": "2",
        "Origin": "https://www.youtube.com",
    }
    
    api_key = "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"
    endpoint = f"{settings.INNERTUBE_API_BASE}/player"
    
    client_kwargs = {"timeout": 20, "follow_redirects": True}
    if proxy:
        client_kwargs["proxy"] = proxy
    
    async def run():
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.post(
                endpoint,
                json=payload,
                params={"key": api_key},
                headers=headers,
            )
            print(f"Status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"Error response: {resp.text[:300]}")
            else:
                data = resp.json()
                playability = data.get("playabilityStatus", {})
                print(f"Playability status: {playability.get('status')}")
                if playability.get('status') != 'OK':
                    print(f"Reason: {playability.get('reason')}")
                
                if "streamingData" in data:
                    formats = data["streamingData"].get("formats", []) + data["streamingData"].get("adaptiveFormats", [])
                    print(f"Formats count: {len(formats)}")
                
                if "videoDetails" in data:
                    print(f"Title: {data['videoDetails'].get('title')}")
    
    asyncio.run(run())

if __name__ == "__main__":
    print("Testing proxy configuration...")
    proxy = get_proxy_url()
    print(f"Proxy URL: {proxy}")
    
    test_ytdlp_formats()
    test_ytdlp_clients()
    test_innertube()