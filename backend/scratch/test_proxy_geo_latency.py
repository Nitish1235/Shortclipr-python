"""
test_proxy_geo_latency.py — Compare proxy-cheap vs Decodo: exit IP geolocation
and raw latency to youtube.com / googlevideo.com.

Run from backend/:
    PYTHONPATH=. python scratch/test_proxy_geo_latency.py
"""

import asyncio
import sys
import time
from urllib.parse import quote_plus

import httpx

from app.core.config import get_settings

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DECODO_HOST = "gate.decodo.com"
DECODO_USER = "spbou1dr41"
DECODO_PASS = "7Ur0gi88_hjxhRHEvn"


def proxycheap_url() -> str:
    s = get_settings()
    user = quote_plus(s.PROXY_USER.strip())
    pw = quote_plus(s.PROXY_PASS.strip())
    return f"http://{user}:{pw}@{s.PROXY_HOST.strip()}:{s.PROXY_PORT}"


def decodo_url(port=10001) -> str:
    user = quote_plus(DECODO_USER)
    pw = quote_plus(DECODO_PASS)
    return f"http://{user}:{pw}@{DECODO_HOST}:{port}"


async def geolocate(proxy: str) -> str:
    async with httpx.AsyncClient(proxy=proxy, timeout=15) as client:
        resp = await client.get("http://ip-api.com/json/")
        d = resp.json()
        return f"{d.get('query')} | {d.get('city')}, {d.get('regionName')}, {d.get('country')} | ASN: {d.get('as')}"


async def time_request(proxy: str, url: str, n: int = 3) -> str:
    times = []
    err = None
    for _ in range(n):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(proxy=proxy, timeout=30, follow_redirects=True) as client:
                resp = await client.head(url)
            times.append(time.monotonic() - t0)
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            times.append(time.monotonic() - t0)
    avg = sum(times) / len(times)
    detail = f"avg={avg:.2f}s  individual={[f'{t:.2f}' for t in times]}"
    if err:
        detail += f"  last_err={err}"
    return detail


async def main():
    proxies = {
        "proxy-cheap": proxycheap_url(),
        "decodo": decodo_url(10001),
    }

    for name, proxy in proxies.items():
        print(f"=== {name} ===")
        try:
            geo = await geolocate(proxy)
            print(f"  geo:        {geo}")
        except Exception as e:
            print(f"  geo:        ERROR {type(e).__name__}: {e}")

        for url in ["https://www.youtube.com/", "https://rr3---sn-2uja-h0me.googlevideo.com/"]:
            try:
                detail = await time_request(proxy, url)
            except Exception as e:
                detail = f"ERROR {type(e).__name__}: {e}"
            print(f"  {url:<48} {detail}")
        print()


if __name__ == "__main__":
    asyncio.run(main())
