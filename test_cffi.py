import asyncio
import json
import re
from curl_cffi.requests import AsyncSession

async def main():
    proxy = "http://zj3ssxzve5ec:h7at9b54fymd1yv@65.111.2.163:3129"
    proxies = {"http": proxy, "https": proxy}
    url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
    
    try:
        # We spoof Chrome 120
        async with AsyncSession(proxies=proxies, impersonate="chrome120") as s:
            resp = await s.get(url)
            html = resp.text
            print(f"Status Code: {resp.status_code}")
            
            # Find ytInitialPlayerResponse
            match = re.search(r"var ytInitialPlayerResponse\s*=\s*({.+?});var", html)
            if match:
                data = json.loads(match.group(1))
                print(f"Title: {data.get('videoDetails', {}).get('title')}")
                print(f"Playability: {data.get('playabilityStatus', {}).get('status')}")
            else:
                print("Could not find ytInitialPlayerResponse")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
