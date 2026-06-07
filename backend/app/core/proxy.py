"""
proxy.py — Proxy URL helper for proxy-cheap residential proxies.

PROXY_HOST, PROXY_USER, PROXY_PASS, PROXY_PORTS are read from config/env.
Returns a fresh random-port URL on every call so each request hits a
different exit node.  Returns None when no proxy is configured (dev mode).

Note: test files (test_*.py) hard-code Decodo credentials for research;
production always uses proxy-cheap via these env vars.
"""

import random
from app.core.config import get_settings


def get_proxy_url() -> str | None:
    """Return a random-port proxy URL, or None if proxy is not configured."""
    s = get_settings()
    if not s.PROXY_HOST or not s.PROXY_USER:
        return None
    ports = _parse_ports(s.PROXY_PORTS)
    port = random.choice(ports)
    return f"http://{s.PROXY_USER}:{s.PROXY_PASS}@{s.PROXY_HOST}:{port}"


def _parse_ports(spec: str) -> list[int]:
    """Parse '10001-10007' or '10001,10002,10003' → list of ints."""
    spec = spec.strip()
    if "-" in spec and "," not in spec:
        a, b = spec.split("-", 1)
        return list(range(int(a.strip()), int(b.strip()) + 1))
    return [int(p.strip()) for p in spec.split(",") if p.strip().isdigit()]
