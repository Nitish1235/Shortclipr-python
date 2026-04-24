import asyncio
import httpx

async def main():
    proxy = "http://brd-customer-hl_71ec61d7-zone-residential_proxy1:yudidty3i648@brd.superproxy.io:33335"
    try:
        async with httpx.AsyncClient(proxy=proxy, verify=False) as client:
            resp = await client.get("https://geo.brdtest.com/welcome.txt?product=resi&method=native")
            print(resp.status_code)
            print(resp.text)
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(e.response.text)

asyncio.run(main())
