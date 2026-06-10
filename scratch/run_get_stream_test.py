import sys, asyncio
sys.path.append('f:/SAAS/Shortclipr-final/backend')
from app.pipeline.stream import get_stream_url

async def main():
    try:
        url = await get_stream_url('6FNRVY2vYXw', '1080p')
        print('Stream URL:', url)
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    asyncio.run(main())
