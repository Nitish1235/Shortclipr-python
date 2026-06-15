"""
proxy.py — Proxy URL helper for proxy-cheap residential proxies.

PROXY_HOST, PROXY_USER, PROXY_PASS, PROXY_PORT, PROXY_PORTS are read from config/env.
PROXY_PASS may include a `_country-XX` suffix (e.g. `..._country-GB`) for
proxy-cheap's documented geo-targeting. proxy-cheap's rotating residential
endpoint does NOT support `_session-<id>` stickiness — confirmed via testing
(returns HTTP 500). True sticky sessions require separate dashboard-issued
credentials, not a user-composable password suffix.

When session_id is provided and PROXY_PORT is unset, it is used only to pick
a port deterministically from PROXY_PORTS (stable routing within a job).

Returns None when no proxy is configured (dev mode).
"""

import contextvars
import hashlib
import logging
import random
from urllib.parse import parse_qs, quote_plus, urlparse

from app.core.config import get_settings

_logger = logging.getLogger(__name__)

# Selects which proxy provider get_proxy_url() returns for the current
# async task (and any tasks it spawns). Defaults to proxy-cheap (production
# user pipeline). The admin/test pipeline switches this to "decodo" for the
# duration of a test run via use_decodo_proxy().
_proxy_provider: contextvars.ContextVar[str] = contextvars.ContextVar(
    "proxy_provider", default="proxycheap"
)


def use_decodo_proxy() -> None:
    """Switch the current task (and children) to the Decodo proxy pool."""
    _proxy_provider.set("decodo")

def validate_proxy_env() -> None:
    """Validate proxy environment variables.
    Ensures PROXY_HOST, PROXY_USER, PROXY_PASS are non‑empty strings and
    PROXY_PORT is a positive integer. Raises ValueError on any problem.
    """
    s = get_settings()
    if not s.PROXY_HOST or not s.PROXY_HOST.strip():
        raise ValueError("PROXY_HOST must be set for proxy-only operation.")
    if not s.PROXY_USER or not s.PROXY_USER.strip():
        raise ValueError("PROXY_USER must be set for proxy-only operation.")
    if not s.PROXY_PASS or not s.PROXY_PASS.strip():
        raise ValueError("PROXY_PASS must be set for proxy-only operation.")
    if s.PROXY_PORT is None:
        raise ValueError("PROXY_PORT must be set for proxy-only operation.")
    if not isinstance(s.PROXY_PORT, int) or s.PROXY_PORT <= 0:
        raise ValueError(f"PROXY_PORT must be a positive integer. Got '{s.PROXY_PORT}'.")



def _parse_port_countries(spec: str) -> dict[int, str]:
    """Parse 'port:country,port:country,...' → {port: country}."""
    result: dict[int, str] = {}
    for pair in spec.split(","):
        pair = pair.strip()
        if not pair or ":" not in pair:
            continue
        port_str, country = pair.split(":", 1)
        port_str, country = port_str.strip(), country.strip()
        if port_str.isdigit() and country:
            result[int(port_str)] = country
    return result


def _get_decodo_proxy_url(session_id: str | None = None) -> str:
    """
    Return a Decodo proxy URL, picking a port from DECODO_PORTS.

    Each dedicated ISP port has a fixed IP tied to a specific country —
    DECODO_PORT_COUNTRIES maps port -> country, and the username becomes
    "{DECODO_USER}-country-{country}" for that port.

    If session_id is provided, the port is chosen deterministically from the
    MD5 hash of session_id, ensuring stable routing within the same job.
    """
    s = get_settings()
    host = s.DECODO_HOST.strip()
    base_user = s.DECODO_USER.strip()
    password = quote_plus(s.DECODO_PASS.strip())

    ports = _parse_ports(s.DECODO_PORTS) or [10001]
    if session_id:
        hash_val = int(hashlib.md5(session_id.encode()).hexdigest(), 16)
        port = ports[hash_val % len(ports)]
    else:
        port = random.choice(ports)

    port_countries = _parse_port_countries(s.DECODO_PORT_COUNTRIES)
    country = port_countries.get(port)
    user = f"{base_user}-country-{country}" if country else base_user
    user = quote_plus(user)

    _logger.info(f"[proxy.py] Loaded Decodo proxy settings — host: {host}, user: {user}, port: {port}")
    return f"http://{user}:{password}@{host}:{port}"


def get_proxy_url(session_id: str | None = None) -> str | None:
    """
    Return a proxy URL, or None if proxy is not configured.

    PROXY_PASS is used as-is (including any `_country-XX` geo-targeting suffix).
    If session_id is provided and PROXY_PORT is unset, it selects a port
    deterministically based on the MD5 hash of the session_id from PROXY_PORTS,
    ensuring stable routing within the same job.
    """
    if _proxy_provider.get() == "decodo":
        return _get_decodo_proxy_url(session_id)

    s = get_settings()

    # Clean leading/trailing whitespaces or newlines (common in Secret Manager)
    host = s.PROXY_HOST.strip() if s.PROXY_HOST else ""
    user = quote_plus(s.PROXY_USER.strip()) if s.PROXY_USER else ""
    password = quote_plus(s.PROXY_PASS.strip()) if s.PROXY_PASS else ""

    if not host or not user:
        return None

    # Handle port selection
    port = 8080  # default fallback for proxy-cheap
    # PROXY_PORT may be an int or str; handle both
    if s.PROXY_PORT:
        if isinstance(s.PROXY_PORT, int):
            port = s.PROXY_PORT
        else:
            # Assume string representation
            proxy_port_str = s.PROXY_PORT.strip()
            if proxy_port_str:
                try:
                    port = int(proxy_port_str)
                except ValueError as e:
                    _logger.warning(
                        f"[proxy.py] Failed to parse PROXY_PORT={repr(s.PROXY_PORT)}: {e}. Falling back to 8080."
                    )
                    port = 8080
    else:
        ports = _parse_ports(s.PROXY_PORTS)
        if ports:
            if session_id:
                # Deterministic choice from the port pool based on session ID
                hash_val = int(hashlib.md5(session_id.encode()).hexdigest(), 16)
                port = ports[hash_val % len(ports)]
            else:
                port = random.choice(ports)

    # Log safe metadata to help diagnose configuration issues in production
    safe_pass = f"{password[:2]}...{password[-2:]} (len={len(password)})" if len(password) > 4 else f"len={len(password)}"
    _logger.info(f"[proxy.py] Loaded proxy settings — host: {host}, user: {user}, port: {port}, password: {safe_pass}")

    return f"http://{user}:{password}@{host}:{port}"


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

