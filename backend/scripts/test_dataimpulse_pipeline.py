#!/usr/bin/env python3
"""
Quick test: fetch video metadata through DataImpulse proxy.
Verifies that the pipeline can work with a different proxy provider.
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.pipeline.stream import get_video_metadata

async def test_metadata():
    video_id = "6FNRVY2vYXw"  # Known good test video
    print(f"\n=== Testing get_video_metadata with DataImpulse proxy ===\n")
    print(f"Video ID: {video_id}")

    try:
        result = await get_video_metadata(video_id)
        print(f"\n✅ SUCCESS\n")
        print(f"Title: {result.get('title')}")
        print(f"Channel: {result.get('channel')}")
        print(f"Duration (seconds): {result.get('duration')}")
        print(f"Thumbnail: {result.get('thumbnail', '')[:80]}...")
        return True
    except Exception as e:
        print(f"\n❌ FAILED\n")
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_metadata())
    sys.exit(0 if success else 1)
