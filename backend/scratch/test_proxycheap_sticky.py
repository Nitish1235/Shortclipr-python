"""
test_proxycheap_sticky.py — Determine whether proxy-cheap (port 8080) honors
`_session-<id>` suffixes for IP stickiness, and what suffix ordering works
with `_country-XX`.

Run from backend/:
    PYTHONPATH=. python scratch/test_proxycheap_sticky.py
"""

import asyncio
import sys
import time
from urllib.parse import quote_plus

import httpx

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PC_HOST = "thehub.proxy-cheap.com"
PC_USER = "OyQOEnhVOxIz1Cr"
PC_PASS_BASE = "4ypLJeR3QRqSiJD"
PC_PORT = 8080

GEO_URL = "https://ipv4.icanhazip.com"


def proxy_url(password: str) -> str:
    user = quote_plus(PC_USER)
    pw = quote_plus(password)
    return f"http://{user}:{pw}@{PC_HOST}:{PC_PORT}"


async def get_ip(password: str, label: str) -> str:
    proxy = proxy_url(password)
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(proxy=proxy, timeout=20) as client:
            resp = await client.get(GEO_URL)
            ip = resp.text.strip()
            elapsed = time.monotonic() - t0
            print(f"  {label:<45} pass=...{password[-30:]:<32} -> {ip:<16} ({elapsed:.2f}s)")
            return ip
    except Exception as e:
        elapsed = time.monotonic() - t0
        print(f"  {label:<45} pass=...{password[-30:]:<32} -> ERROR {type(e).__name__}: {e} ({elapsed:.2f}s)")
        return f"ERROR:{e}"


async def main():
    print("=" * 100)
    print("TEST 1: No session suffix (just _country-GB) — repeated requests")
    print("        Expect: different IP each time if rotating-on-every-request")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}_country-GB"
    for i in range(4):
        await get_ip(pw, f"no-session, req#{i+1}")

    print()
    print("=" * 100)
    print("TEST 2: _country-GB_session-AAA1 — repeated requests")
    print("        Expect (if session syntax honored): SAME ip each time")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}_country-GB_session-AAA1"
    for i in range(4):
        await get_ip(pw, f"country-GB_session-AAA1, req#{i+1}")

    print()
    print("=" * 100)
    print("TEST 3: _country-GB_session-BBB2 (different session id)")
    print("        Expect (if session syntax honored): DIFFERENT ip from test 2, but stable across requests")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}_country-GB_session-BBB2"
    for i in range(4):
        await get_ip(pw, f"country-GB_session-BBB2, req#{i+1}")

    print()
    print("=" * 100)
    print("TEST 4: Reversed order — _session-AAA1_country-GB")
    print("        Expect: check if param order matters")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}_session-AAA1_country-GB"
    for i in range(4):
        await get_ip(pw, f"session-AAA1_country-GB, req#{i+1}")

    print()
    print("=" * 100)
    print("TEST 5: Just _session-AAA1 (no country)")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}_session-AAA1"
    for i in range(4):
        await get_ip(pw, f"session-AAA1 only, req#{i+1}")

    print()
    print("=" * 100)
    print("TEST 6: Plain password, no suffixes at all — repeated requests")
    print("=" * 100)
    pw = f"{PC_PASS_BASE}"
    for i in range(4):
        await get_ip(pw, f"plain, req#{i+1}")


if __name__ == "__main__":
    asyncio.run(main())
