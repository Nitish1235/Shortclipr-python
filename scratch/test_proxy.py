"""Test proxy with aiohttp/httpx"""
import asyncio
import httpx

PROXY_CREDENTIALS = {
    "host": "thehub.proxy-cheap.com",
    "port": 8080,
    "user": "OyQOEnhVOxIz1Cr",
    "password": "4ypLJeR3QRqSiJD",
}

proxy_url = f"http://{PROXY_CREDENTIALS['user']}:{PROXY_CREDENTIALS['password']}@{PROXY_CREDENTIALS['host']}:{PROXY_CREDENTIALS['port']}"
print(f"Proxy URL: {proxy_url}")

async def test():
    client_kwargs = {"timeout": 20, "follow_redirects": True, "proxy": proxy_url}
    try:
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.get("https://ipv4.icanhazip.com")
            print(f"Status: {resp.status_code}")
            print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())