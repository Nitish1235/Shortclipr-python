"""
testing.py — InnerTube Stabilization Lab  (DEV ONLY)

Mounted only when APP_ENV == "development" (see main.py).
Never exposed in production.

Two endpoints:
  GET  /testing        — HTML UI
  POST /testing/debug  — single client audit
  POST /testing/decodo — all-clients sweep via proxy
"""

import asyncio
import logging

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.core.proxy import get_proxy_url
from app.pipeline.stream import (
    CLIENTS,
    PLAYER_ENDPOINT,
    _pick_best_audio_stream,
    _pick_best_stream,
    call_player_api,
    extract_video_id,
)

router = APIRouter(tags=["testing"])
logger = logging.getLogger(__name__)


# ── Request models ────────────────────────────────────────────

class TestRequest(BaseModel):
    url_or_id: str
    client:    str  = "ANDROID_VR"
    use_proxy: bool = False


class SweepRequest(BaseModel):
    url_or_id: str


# ── HTML UI ───────────────────────────────────────────────────

@router.get("/testing", response_class=HTMLResponse)
async def testing_ui():
    """Serves the InnerTube Lab UI (dev only)."""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ShortClipr | InnerTube Lab</title>
  <style>
    :root { --bg:#0a0a0a; --accent:#00ffcc; --orange:#ff9900; --text:#e0e0e0; }
    body  { background:var(--bg); color:var(--text); font-family:'Courier New',monospace; padding:40px; }
    .wrap { max-width:900px; margin:0 auto; }
    h1    { color:var(--accent); border-bottom:1px solid var(--accent); padding-bottom:10px; }
    h2    { color:var(--orange); border-bottom:1px solid var(--orange); padding-bottom:8px; margin-top:40px; }
    .row  { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:20px; }
    input, select, button {
      background:#1a1a1a; color:white; border:1px solid #333;
      padding:10px; font-size:15px; border-radius:4px;
    }
    button { font-weight:bold; cursor:pointer; border:none; }
    .btn-g { background:var(--accent);  color:black; }
    .btn-o { background:var(--orange); color:black; }
    .out   { background:#111; padding:20px; border:1px solid #222; min-height:160px;
             white-space:pre-wrap; font-size:13px; border-radius:4px; }
    .st    { margin-bottom:8px; font-weight:bold; font-size:14px; }
    .ok    { color:#00ff00; } .fail { color:#ff0055; }
    hr     { border-color:#222; margin:30px 0; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>⚡ InnerTube Stabilization Lab</h1>
  <p>Test InnerTube client identities against YouTube — with or without proxy.</p>

  <!-- Single client audit -->
  <div class="row">
    <input type="text" id="url1" placeholder="YouTube URL or Video ID" style="width:280px">
    <select id="client">
      <option value="ANDROID_VR">ANDROID_VR</option>
      <option value="TV">TV (TVHTML5)</option>
      <option value="IOS">IOS</option>
      <option value="MWEB">MWEB</option>
    </select>
    <label style="color:#aaa;font-size:13px">
      <input type="checkbox" id="use_proxy"> Use Proxy
    </label>
    <button class="btn-g" onclick="runAudit()">RUN AUDIT</button>
  </div>
  <div id="st1" class="st">Ready.</div>
  <div id="out1" class="out">Results appear here...</div>

  <hr>

  <!-- All-clients sweep -->
  <h2>🟠 All-Clients Proxy Sweep</h2>
  <p>Tests all 4 clients simultaneously via proxy and returns a comparison report.</p>
  <div class="row">
    <input type="text" id="url2" placeholder="YouTube URL or Video ID" style="width:280px">
    <button class="btn-o" onclick="runSweep()">🔥 RUN SWEEP</button>
  </div>
  <div id="st2" class="st">Ready.</div>
  <div id="out2" class="out">Sweep results appear here...</div>
</div>

<script>
async function runAudit() {
  const url    = document.getElementById('url1').value;
  const client = document.getElementById('client').value;
  const proxy  = document.getElementById('use_proxy').checked;
  const st = document.getElementById('st1'), out = document.getElementById('out1');
  if (!url) return alert('Enter a URL');
  st.textContent = `Running ${client}${proxy?' via proxy':''}...`; st.className='st';
  out.textContent = 'Requesting...';
  try {
    const r = await fetch('/testing/debug', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({url_or_id:url, client, use_proxy:proxy})
    });
    const d = await r.json();
    st.textContent = r.ok ? '✅ SUCCESS' : '❌ FAILED';
    st.className = 'st ' + (r.ok ? 'ok' : 'fail');
    out.textContent = JSON.stringify(d, null, 2);
  } catch(e) { st.textContent='❌ NETWORK ERROR'; st.className='st fail'; out.textContent=e.message; }
}

async function runSweep() {
  const url = document.getElementById('url2').value;
  const st = document.getElementById('st2'), out = document.getElementById('out2');
  if (!url) return alert('Enter a URL');
  st.textContent = 'Sweeping all clients...'; st.className='st';
  out.textContent = 'Running...';
  try {
    const r = await fetch('/testing/sweep', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({url_or_id:url})
    });
    const d = await r.json();
    const anyOk = Object.values(d.clients||{}).some(c=>c.playability==='OK');
    st.textContent = anyOk ? '✅ AT LEAST ONE PASSED' : '❌ ALL BLOCKED';
    st.className = 'st ' + (anyOk ? 'ok' : 'fail');
    out.textContent = JSON.stringify(d, null, 2);
  } catch(e) { st.textContent='❌ NETWORK ERROR'; st.className='st fail'; out.textContent=e.message; }
}
</script>
</body>
</html>
"""


# ── Single client audit ───────────────────────────────────────

@router.post("/testing/debug")
async def debug_innertube(req: TestRequest):
    """Single InnerTube client audit — proxy loaded from settings."""
    video_id = extract_video_id(req.url_or_id) or req.url_or_id
    if len(video_id) != 11:
        raise HTTPException(status_code=400, detail="Invalid Video ID or URL")

    proxy_url = get_proxy_url() if req.use_proxy else None
    report: dict = {"video_id": video_id, "client": req.client, "logs": [], "results": {}}

    def log(msg: str) -> None:
        report["logs"].append(f"[{req.client}] {msg}")

    try:
        log(f"Calling InnerTube with client={req.client} proxy={bool(proxy_url)}")
        data = await call_player_api(video_id, req.client, send_params=True, proxy_url=proxy_url)

        playability = data.get("playabilityStatus", {})
        p_status    = playability.get("status", "UNKNOWN")
        details     = data.get("videoDetails", {})
        captions    = (
            data.get("captions", {})
                .get("playerCaptionsTracklistRenderer", {})
                .get("captionTracks", [])
        )
        video_url = _pick_best_stream(data, 720)
        audio_url = _pick_best_audio_stream(data)

        log(f"Playability: {p_status}")
        if p_status != "OK":
            log(f"Block reason: {playability.get('reason', 'unknown')}")
        log(f"Caption tracks found: {len(captions)}")
        log(f"Video stream: {'✅' if video_url else '❌'}")
        log(f"Audio stream: {'✅' if audio_url else '❌'}")

        report["results"] = {
            "playability":        p_status,
            "title":              details.get("title"),
            "duration_sec":       details.get("lengthSeconds"),
            "captions_count":     len(captions),
            "caption_languages":  [c.get("languageCode") for c in captions],
            "has_video_stream":   bool(video_url),
            "has_audio_stream":   bool(audio_url),
            "video_url_preview":  (video_url[:120] + "...") if video_url else None,
        }

    except Exception as exc:
        log(f"FATAL: {exc}")
        report["results"]["error"] = str(exc)
        logger.error(f"InnerTube lab audit failed: {exc}", exc_info=True)

    return report


# ── All-clients proxy sweep ───────────────────────────────────

@router.post("/testing/sweep")
async def sweep_all_clients(req: SweepRequest):
    """
    Test all registered InnerTube clients through proxy simultaneously.
    Proxy loaded from settings (PROXY_HOST / PROXY_USER / PROXY_PASS).
    """
    video_id = extract_video_id(req.url_or_id) or req.url_or_id
    if len(video_id) != 11:
        raise HTTPException(status_code=400, detail="Invalid Video ID or URL")

    proxy_url = get_proxy_url()

    async def _test(client_name: str) -> dict:
        config = CLIENTS.get(client_name)
        if not config:
            return {"status": "SKIPPED", "error": "Unknown client"}
        payload = {
            "context": config["context"].copy(),
            "videoId": video_id,
            "playbackContext": {"contentPlaybackContext": {"signatureTimestamp": 20000}},
            "contentCheckOk": True,
            "racyCheckOk": True,
            "params": "2AMBCgIQBg==",
        }
        headers = {**config["headers"], "Content-Type": "application/json"}
        try:
            client_kwargs: dict = {"timeout": 25, "follow_redirects": True}
            if proxy_url:
                client_kwargs["proxy"] = proxy_url
            async with httpx.AsyncClient(**client_kwargs) as client:
                resp = await client.post(
                    PLAYER_ENDPOINT,
                    json=payload,
                    params={"key": config["api_key"]},
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
            p      = data.get("playabilityStatus", {})
            status = p.get("status", "UNKNOWN")
            v_url  = _pick_best_stream(data, 720)
            a_url  = _pick_best_audio_stream(data)
            return {
                "playability":      status,
                "block_reason":     p.get("reason") if status != "OK" else None,
                "title":            data.get("videoDetails", {}).get("title"),
                "has_video_stream": bool(v_url),
                "has_audio_stream": bool(a_url),
                "video_preview":    (v_url[:120] + "...") if v_url else None,
            }
        except httpx.HTTPStatusError as exc:
            return {"status": "HTTP_ERROR", "code": exc.response.status_code, "error": exc.response.text[:300]}
        except Exception as exc:
            return {"status": "ERROR", "error": str(exc)}

    client_names = list(CLIENTS.keys())
    results = await asyncio.gather(*[_test(n) for n in client_names])
    client_results = dict(zip(client_names, results))

    passed = [k for k, v in client_results.items() if v.get("playability") == "OK" and v.get("has_video_stream")]

    return {
        "summary": {
            "video_id":       video_id,
            "proxy_used":     bool(proxy_url),
            "passed_clients": passed,
            "failed_clients": [k for k in client_names if k not in passed],
            "best_client":    passed[0] if passed else None,
            "verdict":        "✅ WORKING" if passed else "❌ ALL BLOCKED",
        },
        "clients": client_results,
    }
