"""
proxy.py — Proxy URL helper for proxy-cheap residential proxies.

PROXY_HOST, PROXY_USER, PROXY_PASS, PROXY_PORT, PROXY_PORTS are read from config/env.
Supports both single-port configurations and random rotation over a pool of ports.
When a session_id is provided, routes requests deterministically to a specific port
and appends a sticky session suffix to the password to maintain the same exit IP.

Returns None when no proxy is configured (dev mode).
"""

import hashlib
import random
from urllib.parse import parse_qs, urlparse
from app.core.config import get_settings


def get_proxy_url(session_id: str | None = None) -> str | None:
    """
    Return a proxy URL, or None if proxy is not configured.

    If session_id is provided:
      - For Proxy-Cheap residential stickiness, appends `_session-[session_id]` to the password.
      - Selects the port deterministically based on the MD5 hash of the session_id
        if multiple ports are defined, ensuring stable routing within the same job.
    """
    s = get_settings()
    if not s.PROXY_HOST or not s.PROXY_USER:
        return None

    # Handle port selection
    if s.PROXY_PORT:
        try:
            port = int(s.PROXY_PORT.strip())
        except ValueError:
            port = 80  # fallback safety
    else:
        ports = _parse_ports(s.PROXY_PORTS)
        if not ports:
            return None
        if session_id:
            # Deterministic choice from the port pool based on session ID
            hash_val = int(hashlib.md5(session_id.encode()).hexdigest(), 16)
            port = ports[hash_val % len(ports)]
        else:
            port = random.choice(ports)

    # Use proxy password as-is.
    # NOTE: proxy-cheap "Sticky" session suffix (_session-{id}) is NOT used here
    # because the proxy plan is configured as "Random IP" (not Sticky).
    # Appending a session suffix with a non-sticky plan causes proxy-cheap to return
    # 308 Permanent Redirect (billing redirect) instead of authenticating.
    password = s.PROXY_PASS

    return f"http://{s.PROXY_USER}:{password}@{s.PROXY_HOST}:{port}"


def _parse_ports(spec: str) -> list[int]:
    """Parse '10001-10007' or '10001,10002,10003' → list of ints."""
    spec = spec.strip()
    if not spec:
        return []
    if "-" in spec and "," not in spec:
        try:
            a, b = spec.split("-", 1)
            return list(range(int(a.strip()), int(b.strip()) + 1))
        except ValueError:
            return []
    return [int(p.strip()) for p in spec.split(",") if p.strip().isdigit()]


def url_is_ip_bound(url: str) -> bool:
    """
    Determine whether a YouTube CDN URL is cryptographically bound to a
    specific IP address.

    YouTube includes 'ip' in the `sparams` field when the HMAC signature
    covers the requesting IP. Example URL fragment:
        ...&ip=1.2.3.4&...&sparams=expire,ei,ip,id,itag,...&sig=SIG...

    When 'ip' is in sparams:
      - The sig is computed over ip=<proxy_ip>
      - Any request from a DIFFERENT IP will receive HTTP 403
      - FFmpeg or client calls MUST route through the same proxy/IP

    When 'ip' is absent from sparams (or ip=0.0.0.0):
      - The URL is not IP-locked
      - Downloads/calls can be made directly — saving proxy bandwidth

    Returns True  → URL is IP-bound, must use same proxy/IP
    Returns False → URL is not IP-bound
    """
    try:
        qs = parse_qs(urlparse(url).query)
        sparams_str = qs.get("sparams", [""])[0]
        signed_params = {p.strip() for p in sparams_str.split(",") if p.strip()}
        if "ip" not in signed_params:
            return False  # ip not in signature → not IP-bound
        # ip IS signed — check if the value is the unbound sentinel
        ip_val = qs.get("ip", ["0.0.0.0"])[0].strip()
        return ip_val not in ("0.0.0.0", "0", "")
    except Exception:
        return False

