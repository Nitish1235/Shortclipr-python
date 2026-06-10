"""
Full proxy-cheap test harness — exercises all proxy-backed API paths
the ShortClipr pipeline uses, against a given proxy host/port/creds.

Usage:
    python scratch/proxy_full_test.py <host> <port> <user> <pass> [video_id]
"""
import asyncio
import sys
import time

import httpx

USER = sys.argv[3] if len(sys.argv) > 3 else "OyQOEnhVOxIz1Cr"
PASS = sys.argv[4] if len(sys.argv) > 4 else "4ypLJeR3QRqSiJD"
HOST = sys.argv[1] if len(sys.argv) > 1 else "thehub.proxy-cheap.com"
PORT = sys.argv[2] if len(sys.argv) > 2 else "8080"
VIDEO_ID = sys.argv[5] if len(sys.argv) > 5 else "6FNRVY2vYXw"

PROXY = f"http://{USER}:{PASS}@{HOST}:{PORT}"
WATCH = f"https://www.youtube.com/watch?v={VIDEO_ID}"

print("=" * 70)
print(f"Proxy : http://{USER}:***@{HOST}:{PORT}")
print(f"Video : {VIDEO_ID}")
print("=" * 70)


def ok(label, msg=""):
    print(f"  \033[92mPASS\033[0m  {label}  {msg}")

def fail(label, msg=""):
    print(f"  \033[91mFAIL\033[0m  {label}  {msg}")


# ── 0. Raw proxy connectivity + exit IP ───────────────────────────
def test_connectivity():
    print("\n[0] Proxy connectivity / exit IP")
    try:
        t = time.time()
        with httpx.Client(proxy=PROXY, timeout=20) as c:
            r = c.get("https://api.ipify.org?format=json")
            r.raise_for_status()
            ip = r.json().get("ip")
        ok("connect", f"exit IP={ip}  ({time.time()-t:.1f}s)")
        return True
    except Exception as e:
        fail("connect", f"{type(e).__name__}: {str(e)[:140]}")
        return False


# ── 1. InnerTube ANDROID /player (stream + transcript path) ───────
def test_innertube():
    print("\n[1] InnerTube ANDROID /player (stream URLs + caption tracks)")
    payload = {
        "context": {"client": {
            "clientName": "ANDROID", "clientVersion": "19.44.41",
            "androidSdkVersion": 34, "hl": "en", "gl": "US",
            "osName": "Android", "osVersion": "14", "platform": "MOBILE",
        }},
        "videoId": VIDEO_ID,
        "contentCheckOk": True, "racyCheckOk": True,
    }
    headers = {
        "User-Agent": "com.google.android.youtube/19.44.41 (Linux; U; Android 14; en_US; Pixel 8 Build/AP2A.240905.003) gzip",
        "X-Youtube-Client-Name": "3", "X-Youtube-Client-Version": "19.44.41",
        "Content-Type": "application/json", "X-Goog-Api-Format-Version": "2",
        "Origin": "https://www.youtube.com",
    }
    try:
        with httpx.Client(proxy=PROXY, timeout=25, follow_redirects=True) as c:
            r = c.post(
                "https://www.youtube.com/youtubei/v1/player",
                params={"key": "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"},
                json=payload, headers=headers,
            )
        if r.status_code != 200:
            fail("innertube", f"HTTP {r.status_code}")
            return
        d = r.json()
        status = d.get("playabilityStatus", {}).get("status")
        sd = d.get("streamingData", {})
        n = len(sd.get("formats", []) + sd.get("adaptiveFormats", []))
        caps = (d.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
                .get("captionTracks", []))
        if status == "OK" and n:
            ok("innertube", f"status=OK, {n} formats, {len(caps)} caption tracks")
        else:
            fail("innertube", f"status={status}, formats={n} (soft block likely)")
    except Exception as e:
        fail("innertube", f"{type(e).__name__}: {str(e)[:140]}")


# ── 2. yt-dlp stream extraction (multi-client) ────────────────────
def test_ytdlp_stream():
    print("\n[2] yt-dlp stream extraction (clients: android, ios, web, mweb)")
    import yt_dlp
    for client in ["android", "ios", "web", "mweb"]:
        opts = {
            "quiet": True, "no_warnings": True, "skip_download": True,
            "noplaylist": True, "socket_timeout": 30, "proxy": PROXY,
            "format": "best",
            "extractor_args": {"youtube": {"player_client": [client]}},
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(WATCH, download=False)
            url = (info or {}).get("url") or next(
                (f["url"] for f in reversed((info or {}).get("formats", []))
                 if "googlevideo.com" in f.get("url", "")), None)
            if url:
                ok(f"yt-dlp[{client}]", f"{url[:55]}...")
            else:
                fail(f"yt-dlp[{client}]", "no CDN url")
        except Exception as e:
            fail(f"yt-dlp[{client}]", str(e)[:120])


# ── 3. youtube-transcript-api ─────────────────────────────────────
def test_ytta():
    print("\n[3] youtube-transcript-api (transcript method 1)")
    from youtube_transcript_api import YouTubeTranscriptApi
    try:
        api = YouTubeTranscriptApi(proxies={"http": PROXY, "https": PROXY})
        fetched = api.fetch(VIDEO_ID, languages=["en", "en-US", "a.en"])
        n = sum(1 for s in fetched if s.text.strip())
        ok("ytta", f"{n} transcript entries")
    except Exception as e:
        fail("ytta", f"{type(e).__name__}: {str(e)[:140]}")


# ── 4. timedtext caption download (transcript method 2 tail) ──────
def test_timedtext():
    print("\n[4] InnerTube caption track + timedtext download")
    payload = {
        "context": {"client": {
            "clientName": "ANDROID", "clientVersion": "19.44.41",
            "androidSdkVersion": 34, "hl": "en", "gl": "US",
        }},
        "videoId": VIDEO_ID, "contentCheckOk": True, "racyCheckOk": True,
    }
    headers = {
        "User-Agent": "com.google.android.youtube/19.44.41 (Linux; U; Android 14; en_US; Pixel 8 Build/AP2A.240905.003) gzip",
        "X-Youtube-Client-Name": "3", "X-Youtube-Client-Version": "19.44.41",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(proxy=PROXY, timeout=25, follow_redirects=True) as c:
            r = c.post("https://www.youtube.com/youtubei/v1/player",
                       params={"key": "AIzaSyA8eiZmM1FaSbwzBlGmbW3ILtKBNJI41zQ"},
                       json=payload, headers=headers)
            tracks = (r.json().get("captions", {})
                      .get("playerCaptionsTracklistRenderer", {})
                      .get("captionTracks", []))
            if not tracks:
                fail("timedtext", "no caption tracks in player response")
                return
            base = tracks[0]["baseUrl"]
            sep = "&" if "?" in base else "?"
            r2 = c.get(f"{base}{sep}fmt=json3")
            events = r2.json().get("events", []) if r2.status_code == 200 else []
            n = sum(1 for ev in events if ev.get("segs"))
            if n:
                ok("timedtext", f"{n} caption events (IP-bound URL via proxy)")
            else:
                fail("timedtext", f"HTTP {r2.status_code}, no events")
    except Exception as e:
        fail("timedtext", f"{type(e).__name__}: {str(e)[:140]}")


# ── 5. yt-dlp subtitle extraction (transcript method 3) ───────────
def test_ytdlp_subs():
    print("\n[5] yt-dlp subtitle extraction")
    import yt_dlp
    opts = {
        "quiet": True, "no_warnings": True, "skip_download": True,
        "noplaylist": True, "socket_timeout": 25, "proxy": PROXY,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(WATCH, download=False)
        subs = (info or {}).get("subtitles", {})
        auto = (info or {}).get("automatic_captions", {})
        if subs or auto:
            ok("yt-dlp subs", f"manual={list(subs)[:4]} auto={list(auto)[:4]}")
        else:
            fail("yt-dlp subs", "no subtitle tracks")
    except Exception as e:
        fail("yt-dlp subs", str(e)[:140])


if __name__ == "__main__":
    reachable = test_connectivity()
    if not reachable:
        print("\nProxy unreachable — skipping API tests.")
        sys.exit(1)
    test_innertube()
    test_ytdlp_stream()
    test_ytta()
    test_timedtext()
    test_ytdlp_subs()
    print("\n" + "=" * 70)
    print("Done.")
