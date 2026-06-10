"""
Diagnose stream extraction for a video ID - test all methods individually.
"""
import asyncio
import sys
import logging

sys.path.insert(0, 'backend')

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(name)s - %(levelname)s - %(message)s')

import yt_dlp

VIDEO_ID = "6FNRVY2vYXw"
PROXY_URL = "http://OyQOEnhVOxIz1Cr:4ypLJeR3QRqSiJD@thehub.proxy-cheap.com:8080"


def list_formats():
    """List all available formats for the video"""
    print("\n=== Listing available formats ===")
    
    opts = {
        "quiet": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "proxy": PROXY_URL,
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
        
        if info:
            formats = info.get("formats", [])
            print(f"Total formats available: {len(formats)}")
            
            print("\n--- Video formats (sorted by height) ---")
            video_formats = [f for f in formats if f.get('vcodec') and f.get('vcodec') != 'none']
            for f in sorted(video_formats, key=lambda x: x.get("height", 0) or 0, reverse=True)[:20]:
                print(f"  - format_id={f.get('format_id'):12s} height={f.get('height') or 'audio':5s} ext={f.get('ext'):4s} vcodec={f.get('vcodec'):10s} acodec={f.get('acodec')}")
            
            print("\n--- Audio-only formats ---")
            audio_formats = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') and f.get('acodec') != 'none']
            for f in sorted(audio_formats, key=lambda x: x.get("abr", 0) or 0, reverse=True)[:10]:
                print(f"  - format_id={f.get('format_id'):12s} abr={f.get('abr')} ext={f.get('ext'):4s} acodec={f.get('acodec')}")
    except Exception as e:
        print(f"Failed to list formats: {e}")


def test_format_selection():
    """Test various format selection strategies"""
    print("\n=== Testing format selections ===")
    
    # Test selectors that might work
    selectors = [
        "best[height<=1080]",
        "best",
        "bestvideo[height<=720]+bestaudio/best",
        "best[ext=mp4]",
        "worst",
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
    ]
    
    for selector in selectors:
        print(f"\n--- Testing selector: {selector} ---")
        opts = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "proxy": PROXY_URL,
            "format": selector,
        }
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
            
            if info:
                url = info.get("url") or (info.get("formats", [{}])[0].get("url") if info.get("formats") else None)
                print(f"  Success! URL: {url[:80]}..." if url else "  No URL in response")
        except Exception as e:
            print(f"  Failed: {str(e)[:150]}")


def test_client_variants():
    """Test different YouTube client variants"""
    print("\n=== Testing client variants ===")
    
    clients = ["web", "android", "tv", "tv_embedded", "ios", "mweb"]
    
    for client in clients:
        print(f"\n--- Testing client: {client} ---")
        opts = {
            "quiet": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "proxy": PROXY_URL,
            "format": "best[height<=1080]",
            "extractor_args": {"youtube": {"player_client": [client]}},
        }
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
            
            if info:
                url = info.get("url") or (info.get("formats", [{}])[0].get("url") if info.get("formats") else None)
                print(f"  Success! URL: {url[:80]}..." if url else "  No URL in response")
        except Exception as e:
            print(f"  Failed: {str(e)[:150]}")


if __name__ == "__main__":
    list_formats()
    test_format_selection()
    test_client_variants()