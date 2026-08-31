"""
proxy.py — Proxy URL helpers.

Three providers, split strictly by BANDWIDTH and USE CASE:

  • Proxy-Seller ISP  — 10 static ISP IPs, UNLIMITED bandwidth. Used for
                        EVERY actual video-byte download: DASH segment
                        downloads and the full-source fallback (ffmpeg_stage.py,
                        extractor.py). Chosen deterministically via
                        MD5(session_id [+ attempt]) % pool so all byte-range
                        requests within one job share an IP (CDN URLs are
                        often IP-bound — resolve and download must use the
                        SAME proxy or the CDN 403s on real segment data).

  • DataImpulse       — rotating residential. Used ONLY for lightweight JSON/API
                        calls: metadata, transcript, and stream-URL *resolution*
                        (never the resulting video bytes) in stream.py /
                        transcript.py.

  • proxy-cheap       — (LEGACY — commented out, kept for fallback/reference).
                        Was rotating residential with CAPPED bandwidth. Caused
                        cascading failures when quota exhausted on 2026-08-29.

  Never route byte downloads through rotating residential proxies. On 2026-08-29,
  ffmpeg_stage.py's DASH downloader used proxy-cheap for actual clip bytes —
  this burned its 2GB quota within hours, and once exhausted the gateway refused
  ALL connections (not just downloads), cascading into metadata/transcript/
  stream-resolution failures across every job. Fixed by moving all DASH/
  full-source byte downloads to Proxy-Seller exclusively — see
  ffmpeg_stage.py's _dash_download_with_refresh docstring.

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
    Validate proxy environment variables (DataImpulse rotating residential).
    Optional — dev mode can run without proxy. Logs warning if not configured.
    """
    s = get_settings()
    if not s.DATAIMPULSE_HOST or not s.DATAIMPULSE_HOST.strip():
        _logger.warning("[proxy.py] DATAIMPULSE_HOST not configured — pipeline will run without proxy")
        return
    if not s.DATAIMPULSE_USER or not s.DATAIMPULSE_USER.strip():
        _logger.warning("[proxy.py] DATAIMPULSE_USER not configured — pipeline will run without proxy")
        return
    if not s.DATAIMPULSE_PASS or not s.DATAIMPULSE_PASS.strip():
        _logger.warning("[proxy.py] DATAIMPULSE_PASS not configured — pipeline will run without proxy")
        return
    _logger.info(f"[proxy.py] DataImpulse proxy configured: {s.DATAIMPULSE_HOST}:{s.DATAIMPULSE_PORT}")



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


def get_youtube_proxy(session_id: str | None = None, purpose: str = "req") -> str | None:
    """
    Return the best available proxy for YouTube requests (transcript + stream).

    Priority: Proxy-Seller ISP (static, stable, less likely to be blocked)
    → DataImpulse rotating residential (fallback if Proxy-Seller not configured).

    When session_id is provided and Proxy-Seller is available, the proxy is
    chosen deterministically via MD5(session_id) % pool_size — same IP for
    the entire job across API stage (transcript/stream) and FFmpeg stage
    (DASH downloads). This avoids IP-bound URL mismatches.

    When falling back to DataImpulse, each call gets a fresh IP from the
    rotating residential pool.
    """
    s = get_settings()
    proxies = _parse_proxyseller_list(s.PROXYSELLER_PROXIES)
    if s.PROXYSELLER_USER and s.PROXYSELLER_PASS and proxies:
        return get_proxyseller_proxy(session_id)
    return get_dataimpulse_proxy(purpose=purpose)


def get_dataimpulse_proxy(purpose: str = "req") -> str | None:
    """
    DataImpulse rotating residential — transcript + stream URL resolution.
    Each call gets a fresh IP from DataImpulse's rotating residential pool.

    Returns None if DATAIMPULSE_HOST/USER/PASS are not configured.
    """
    s = get_settings()
    host = s.DATAIMPULSE_HOST.strip() if s.DATAIMPULSE_HOST else ""
    user = s.DATAIMPULSE_USER.strip() if s.DATAIMPULSE_USER else ""
    password = s.DATAIMPULSE_PASS.strip() if s.DATAIMPULSE_PASS else ""
    port = s.DATAIMPULSE_PORT if s.DATAIMPULSE_PORT else 823

    if not host or not user or not password:
        _logger.warning(f"[proxy.py] DataImpulse not configured — {purpose} running without proxy")
        return None

    user_encoded = quote_plus(user)
    password_encoded = quote_plus(password)

    url = f"http://{user_encoded}:{password_encoded}@{host}:{port}"
    safe_pass = f"{password_encoded[:3]}...{password_encoded[-2:]}" if len(password_encoded) > 5 else f"len={len(password_encoded)}"
    _logger.info(f"[proxy.py] DataImpulse rotating — {user_encoded}:{safe_pass}@{host}:{port} (purpose={purpose})")
    return url


# ── Legacy proxy-cheap (commented out — use DataImpulse instead) ────
# def get_proxycheap_proxy(purpose: str = "req") -> str | None:
#     """
#     Proxy-Cheap rotating residential — transcript + stream URL resolution
#     (shortclipr-worker-ai). Each call gets a fresh IP: either the rotating
#     gateway host:port (PROXY_PORT fixed, IP rotates server-side per
#     connection) or a random port drawn from PROXY_PORTS when PROXY_PORT=0.
#
#     Returns None if PROXY_HOST/USER/PASS are not configured.
#     """
#     url = get_proxy_url()
#     if url:
#         _logger.info(f"[proxy.py] Proxy-Cheap rotating — purpose={purpose}")
#     else:
#         _logger.warning(f"[proxy.py] Proxy-Cheap not configured — {purpose} running without residential proxy")
#     return url


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

    Priority: Proxy-Seller ISP → DataImpulse rotating residential.
    Updated 2026-08-31: switched from legacy proxy-cheap to DataImpulse.
    """
    if _proxy_provider.get() == "proxyseller":
        return _get_proxyseller_proxy_url(session_id)

    # Use DataImpulse (rotating residential) — primary proxy provider
    return get_dataimpulse_proxy(purpose="get_proxy_url")


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

