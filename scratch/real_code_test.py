"""
Run the REAL ShortClipr pipeline functions against the configured proxy.
Loads backend/.env (thehub creds) and calls the actual code paths Cloud Run uses.
"""
import asyncio, os, sys, logging
from pathlib import Path

backend = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend))
for line in (backend / ".env").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ[k] = v.split("#")[0].strip()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from app.core.proxy import get_proxy_url
from app.pipeline.stream import get_stream_url, get_video_metadata, call_player_api, _innertube_is_blocked
from app.pipeline.transcript import get_transcript

VID = sys.argv[1] if len(sys.argv) > 1 else "6FNRVY2vYXw"

async def main():
    print("PROXY:", (get_proxy_url() or "NONE").replace("4ypLJeR3QRqSiJD", "***"))

    print("\n[A] call_player_api ANDROID (real payload) ...")
    try:
        d = await call_player_api(VID, client_name="ANDROID", send_params=True, proxy_url=get_proxy_url())
        blocked, reason = _innertube_is_blocked(d)
        sd = d.get("streamingData", {})
        n = len(sd.get("formats", []) + sd.get("adaptiveFormats", []))
        print(f"    status={d.get('playabilityStatus',{}).get('status')} formats={n} blocked={blocked} {reason}")
    except Exception as e:
        print(f"    FAIL {type(e).__name__}: {str(e)[:160]}")

    print("\n[B] get_video_metadata ...")
    try:
        print("    OK", await get_video_metadata(VID))
    except Exception as e:
        print(f"    FAIL {type(e).__name__}: {str(e)[:160]}")

    print("\n[C] get_stream_url (full 7-method chain) ...")
    try:
        u = await get_stream_url(VID, "1080p")
        print(f"    OK {u[:80]}...")
    except Exception as e:
        print(f"    FAIL {type(e).__name__}: {str(e)[:200]}")

    print("\n[D] get_transcript (full 3-method chain) ...")
    try:
        t = await get_transcript(VID, "en")
        print(f"    OK {len(t)} entries; first: {t[0] if t else '-'}")
    except Exception as e:
        print(f"    FAIL {type(e).__name__}: {str(e)[:200]}")

asyncio.run(main())
