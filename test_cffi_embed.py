import asyncio
import json
import re
from curl_cffi.requests import AsyncSession

async def main():
    proxy = "http://zj3ssxzve5ec:h7at9b54fymd1yv@65.111.2.163:3129"
    proxies = {"http": proxy, "https": proxy}
    url = "https://www.youtube.com/embed/aqz-KE-bpKQ"
    
    try:
        async with AsyncSession(proxies=proxies, impersonate="chrome120") as s:
            resp = await s.get(url)
            html = resp.text
            print(f"Status Code: {resp.status_code}")
            
            # Embed pages store it in ytcfg.set({ "PLAYER_VARS": { "embedded_player_response": "..." } })
            match = re.search(r'\\\"embedded_player_response\\\":\\\"(.*?)\\\"', html)
            if not match:
                # Try single escape
                match = re.search(r'"embedded_player_response":"(.*?)"', html)
            
            if match:
                data_str = match.group(1).replace('\\\\', '\\').replace('\\"', '"')
                # It might still be encoded
                try:
                    data = json.loads(data_str)
                    print(f"Title: {data.get('videoDetails', {}).get('title')}")
                    print(f"Playability: {data.get('playabilityStatus', {}).get('status')}")
                except Exception as e:
                    print(f"JSON Parse Error: {e}")
                    print(f"Sample: {data_str[:100]}")
            else:
                print("Could not find embedded_player_response")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
