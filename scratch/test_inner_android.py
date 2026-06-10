import sys, asyncio
sys.path.append('f:/SAAS/Shortclipr-final/backend')
from app.pipeline.stream import call_player_api

async def main():
    try:
        data = await call_player_api('6FNRVY2vYXw', client_name='ANDROID', proxy_url=None)
        print('Success, got keys:', list(data.keys()))
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    asyncio.run(main())
