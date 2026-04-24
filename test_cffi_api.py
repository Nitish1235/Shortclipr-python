import asyncio
import json
from curl_cffi.requests import AsyncSession

async def main():
    proxy = "http://zj3ssxzve5ec:h7at9b54fymd1yv@65.111.2.163:3129"
    proxies = {"http": proxy, "https": proxy}
    url = "https://www.youtube.com/youtubei/v1/player"
    
    payload = {
        "context": {
            "client": {
                "clientName": "WEB_EMBED",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "videoId": "aqz-KE-bpKQ"
    }
    
    try:
        async with AsyncSession(proxies=proxies, impersonate="chrome120") as s:
            # We must pass the Referer for WEB_EMBED to work
            headers = {"Referer": "https://www.reddit.com/"}
            resp = await s.post(url, json=payload, headers=headers)
            print(f"Status Code: {resp.status_code}")
            data = resp.json()
            print(f"Playability: {data.get('playabilityStatus', {}).get('status')}")
            if data.get('playabilityStatus', {}).get('status') != 'OK':
                print(f"Reason: {data.get('playabilityStatus', {}).get('reason')}")
            else:
                print("SUCCESS: Stream URLs found")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
