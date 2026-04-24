import asyncio
import httpx
import re

async def get_signature_timestamp():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    async with httpx.AsyncClient() as client:
        # Get a video page to find base.js
        resp = await client.get("https://www.youtube.com/watch?v=aqz-KE-bpKQ", headers=headers)
        html = resp.text
        
        # Find base.js url
        match = re.search(r'src="(/s/player/[^"]+/base\.js)"', html)
        if not match:
            print("Could not find base.js")
            return
            
        base_js_url = "https://www.youtube.com" + match.group(1)
        print(f"Found base.js: {base_js_url}")
        
        # Download base.js
        resp = await client.get(base_js_url, headers=headers)
        js = resp.text
        
        # Extract signatureTimestamp
        ts_match = re.search(r'signatureTimestamp:(\d+)', js)
        if ts_match:
            print(f"Current signatureTimestamp: {ts_match.group(1)}")
        else:
            print("Could not find signatureTimestamp in base.js")

asyncio.run(get_signature_timestamp())
