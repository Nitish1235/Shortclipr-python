"""
proxy.py — Proxy URL helpers.

Two providers:
  • Proxy-Seller ISP  — 10 static ISP IPs, used for DASH segment downloads.
                        Chosen deterministically via MD5(session_id) % pool
                        so all byte-range requests within one job share an IP.
  • proxy-cheap       — rotating residential (get_proxycheap_proxy /
                        get_proxy_url). Used for transcript + stream URL
                        resolution (shortclipr-worker-ai) and as the FFmpeg
                        worker's fallback when Proxy-Seller is bot-blocked
                        (full-source download retry, DASH re-resolve).

DataImpulse was retired (its account ran out of traffic quota — 407
TRAFFIC_EXHAUSTED — and proxy-cheap covers every role it used to fill).

Returns None when the relevant provider is not configured (dev mode).
"""

import contextvars
import hashlib
import logging
import random
from urllib.parse import parse_qs, quote_plus, urlparse

from app.core.config import get_settings

_logger = logging.getLogger(__name__)

# Selects which proxy provider get_proxy_url() returns for the current
# async task (and any tasks it spawns). Defaults to proxy-cheap (legacy /
# admin test lab). The admin/test pipeline switches this to "proxyseller"
# for the duration of a test run via use_proxyseller_proxy().
_proxy_provider: contextvars.ContextVar[str] = contextvars.ContextVar(
    "proxy_provider", default="proxycheap"
)


def use_proxyseller_proxy() -> None:
    """Switch the current task (and children) to the Proxy-Seller ISP pool."""
    _proxy_provider.set("proxyseller")

def validate_proxy_env() -> None:
    """
    Validate proxy environment variables.
    PROXY_PORT=0 is valid — it means 'use PROXY_PORTS range for rotation'.
    Raises ValueError only if host/user/pass are missing.
    """
    s = get_settings()
    if not s.PROXY_HOST or not s.PROXY_HOST.strip():
        raise ValueError("PROXY_HOST must be set.")
    if not s.PROXY_USER or not s.PROXY_USER.strip():
        raise ValueError("PROXY_USER must be set.")
    if not s.PROXY_PASS or not s.PROXY_PASS.strip():
        raise ValueError("PROXY_PASS must be set.")
    if s.PROXY_PORT < 0:
        raise ValueError(f"PROXY_PORT must be >= 0 (0 = use PROXY_PORTS rotation). Got '{s.PROXY_PORT}'.")



def _parse_proxyseller_list(spec: str) -> list[tuple[str, int]]:
    """Parse 'host:port,host:port,...' → [(host, port), ...]."""
    result: list[tuple[str, int]] = []
    for entry in spec.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.rsplit(":", 1)
        if len(parts) == 2 and parts[1].isdigit():
            result.append((parts[0].strip(), int(parts[1])))
    return result


def _get_proxyseller_proxy_url(session_id: str | None = None) -> str:
    """
    Return a Proxy-Seller ISP proxy URL chosen from the 10-proxy pool.

    Each entry in PROXYSELLER_PROXIES is a distinct static ISP IP (host:port).
    When session_id is provided the proxy is chosen deterministically via
    MD5(session_id) % pool_size so all DASH byte-range requests within one
    job route through the same IP.
    """
    s = get_settings()
    proxies = _parse_proxyseller_list(s.PROXYSELLER_PROXIES)
    if not proxies:
        raise ValueError("[proxy.py] PROXYSELLER_PROXIES is empty — cannot build Proxy-Seller URL")

    if session_id:
        idx = int(hashlib.md5(session_id.encode()).hexdigest(), 16) % len(proxies)
    else:
        idx = random.randrange(len(proxies))

    host, port = proxies[idx]
    user = quote_plus(s.PROXYSELLER_USER.strip())
    password = quote_plus(s.PROXYSELLER_PASS.strip())

    _logger.info(f"[proxy.py] Proxy-Seller ISP — {host}:{port} (pool idx {idx}/{len(proxies)})")
    return f"http://{user}:{password}@{host}:{port}"


# YouTube shorts service is disabled so not useful
# def get_youtube_proxy(session_id: str | None = None, purpose: str = "req") -> str | None:
#     """
#     Return the best available proxy for YouTube requests (transcript + stream).
#
#     Priority: Proxy-Seller ISP (static, stable, less likely to be blocked)
#     → proxy-cheap rotating residential (fallback if Proxy-Seller not configured).
#
#     When session_id is provided and Proxy-Seller is available, the proxy is
#     chosen deterministically via MD5(session_id) % pool_size — same IP for
#     the entire job across API stage (transcript/stream) and FFmpeg stage
#     (DASH downloads). This avoids IP-bound URL mismatches.
#
#     When falling back to proxy-cheap, each call gets a fresh IP (rotating
#     gateway port, or a random pick from PROXY_PORTS — see get_proxy_url).
#     """
#     s = get_settings()
#     proxies = _parse_proxyseller_list(s.PROXYSELLER_PROXIES)
#     if s.PROXYSELLER_USER and s.PROXYSELLER_PASS and proxies:
#         return get_proxyseller_proxy(session_id)
#     return get_proxycheap_proxy(purpose=purpose)


def get_proxycheap_proxy(purpose: str = "req") -> str | None:
    """
    Proxy-Cheap rotating residential — transcript + stream URL resolution
    (shortclipr-worker-ai). Each call gets a fresh IP: either the rotating
    gateway host:port (PROXY_PORT fixed, IP rotates server-side per
    connection) or a random port drawn from PROXY_PORTS when PROXY_PORT=0.

    Returns None if PROXY_HOST/USER/PASS are not configured.
    """
    url = get_proxy_url()
    if url:
        _logger.info(f"[proxy.py] Proxy-Cheap rotating — purpose={purpose}")
    else:
        _logger.warning(f"[proxy.py] Proxy-Cheap not configured — {purpose} running without residential proxy")
    return url


def get_proxyseller_proxy(session_id: str | None = None, attempt: int = 0) -> str | None:
    """
    Proxy-Seller ISP dedicated proxy — use ONLY for DASH segment downloads.

    Each pool entry is a distinct static IP. The entry is chosen
    deterministically via MD5(session_id [+ attempt]) so all DASH byte-range
    requests WITHIN one attempt use the same IP (required for IP-bound CDN
    URLs), but a retry with a higher `attempt` lands on a DIFFERENT pool IP —
    in case the first one is degraded/blocklisted specifically (rather than
    the whole failure being an IP-mismatch issue between resolution and
    download, which rotating proxies alone can't fix — see
    ffmpeg_stage.py's _dash_download_with_refresh for the full picture).

    attempt=0 keeps the original deterministic single-IP behavior (matches
    pre-existing callers that don't pass attempt).

    Returns None if PROXYSELLER_USER/PASS/PROXIES are not configured.
    """
    s = get_settings()
    proxies = _parse_proxyseller_list(s.PROXYSELLER_PROXIES)
    if not s.PROXYSELLER_USER or not s.PROXYSELLER_PASS or not proxies:
        _logger.warning("[proxy.py] Proxy-Seller ISP not configured — DASH downloads running without proxy")
        return None
    user = quote_plus(s.PROXYSELLER_USER.strip())
    pw   = quote_plus(s.PROXYSELLER_PASS.strip())
    if session_id:
        key = f"{session_id}:{attempt}" if attempt else session_id
        idx = int(hashlib.md5(key.encode()).hexdigest(), 16) % len(proxies)
    else:
        idx = attempt % len(proxies)
    host, port = proxies[idx]
    safe_pw = f"{pw[:3]}...{pw[-2:]} (len={len(pw)})" if len(pw) > 5 else f"len={len(pw)}"
    _logger.info(f"[proxy.py] Proxy-Seller ISP — {host}:{port} (pool idx {idx}/{len(proxies)}, attempt {attempt}) user={user} pass={safe_pw}")
    return f"http://{user}:{pw}@{host}:{port}"


def get_proxy_url(session_id: str | None = None) -> str | None:
    """
    Return a proxy URL, or None if proxy is not configured.

    PROXY_PASS is used as-is (including any `_country-XX` geo-targeting suffix).
    If session_id is provided and PROXY_PORT is unset, it selects a port
    deterministically based on the MD5 hash of the session_id from PROXY_PORTS,
    ensuring stable routing within the same job.
    """
    if _proxy_provider.get() == "proxyseller":
        return _get_proxyseller_proxy_url(session_id)

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

