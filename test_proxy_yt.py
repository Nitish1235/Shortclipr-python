import asyncio
import httpx

async def main():
    proxy = "http://brd-customer-hl_71ec61d7-zone-residential_proxy1:yudidty3i648@brd.superproxy.io:33335"
    target = "https://www.youtube.com/youtubei/v1/player"
    
    try:
        async with httpx.AsyncClient(proxy=proxy, verify=False, timeout=10) as client:
            resp = await client.get(target)
            print(f"Status Code: {resp.status_code}")
    except Exception as e:
        print(f"Error: {type(e).__name__} - {e}")

asyncio.run(main())
