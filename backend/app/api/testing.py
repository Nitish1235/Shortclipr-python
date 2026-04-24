"""
testing.py — Stealth InnerTube Lab
Dashboard for testing different YouTube client identities.
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
import myjdapi

from app.pipeline.stream import call_player_api, CLIENTS, extract_video_id, _pick_best_stream, _pick_best_audio_stream
from app.pipeline.transcript import _fetch_innertube_captions

router = APIRouter(tags=["testing"])
logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=5)

# Hardcoded Credentials for testing2
MYJD_EMAIL = "jnit432@gmail.com"
MYJD_PASSWORD = "Jnit432@00"
MYJD_DEVICE_NAME = "JDownloader@nitish"

class TestRequest(BaseModel):
    url_or_id: str
    client: str = "ANDROID_VR"
    use_proxy: bool = False

BRIGHTDATA_PROXY = "http://brd-customer-hl_71ec61d7-zone-residential_proxy1:yudidty3i648@brd.superproxy.io:33335"

@router.get("/testing", response_class=HTMLResponse)
async def testing_ui():
    """Serves a simple, high-tech HTML/JS tester UI."""
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ShortClipr | InnerTube Lab</title>
        <style>
            :root { --bg: #0a0a0a; --accent: #00ffcc; --text: #e0e0e0; }
            body { background: var(--bg); color: var(--text); font-family: 'Courier New', monospace; padding: 40px; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: var(--accent); border-bottom: 1px solid var(--accent); padding-bottom: 10px; }
            .input-group { margin-bottom: 20px; }
            input, select, button { 
                background: #1a1a1a; color: white; border: 1px solid #333; 
                padding: 10px; font-size: 16px; border-radius: 4px;
            }
            button { background: var(--accent); color: black; font-weight: bold; cursor: pointer; border: none; }
            button:hover { opacity: 0.8; }
            .results { background: #111; padding: 20px; border: 1px solid #222; min-height: 200px; white-space: pre-wrap; font-size: 13px; }
            .status { margin-bottom: 10px; font-weight: bold; }
            .status.ok { color: #00ff00; }
            .status.fail { color: #ff0055; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>InnerTube Stabilization Lab</h1>
            <p>Test various "Golden Identities" against blocked YouTube videos.</p>
            
            <div class="input-group">
                <input type="text" id="url" placeholder="YouTube URL or Video ID" style="width: 300px;">
                <select id="client">
                    <option value="ANDROID_VR">ANDROID_VR (Golden)</option>
                    <option value="IOS">IOS (Stealth)</option>
                    <option value="MWEB">MWEB (Fallback)</option>
                </select>
                <button onclick="runTest()">RUN AUDIT</button>
            </div>

            <div id="status" class="status">Ready.</div>
            <div id="results" class="results">Results will appear here...</div>
        </div>

        <script>
            async function runTest() {
                const url = document.getElementById('url').value;
                const client = document.getElementById('client').value;
                const status = document.getElementById('status');
                const results = document.getElementById('results');

                if (!url) return alert('Enter a URL');
                
                status.innerText = "Running audit...";
                status.className = "status";
                results.innerText = "Analyzing handshake...";

                try {
                    const res = await fetch('/testing/debug', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url_or_id: url, client: client })
                    });
                    const data = await res.json();
                    
                    status.innerText = res.ok ? "AUDIT SUCCESSFUL" : "AUDIT FAILED";
                    status.className = "status " + (res.ok ? "ok" : "fail");
                    results.innerText = JSON.stringify(data, null, 2);
                } catch (e) {
                    status.innerText = "NETWORK ERROR";
                    status.className = "status fail";
                    results.innerText = e.message;
                }
            }
        </script>
    </body>
    </html>
    """

@router.post("/testing/debug")
async def debug_innertube(req: TestRequest):
    """Performs a full InnerTube audit for a specific client."""
    video_id = extract_video_id(req.url_or_id) or req.url_or_id
    if len(video_id) != 11:
        raise HTTPException(status_code=400, detail="Invalid Video ID")

    report = {
        "video_id": video_id,
        "client": req.client,
        "logs": [],
        "results": {}
    }

    def add_log(msg):
        report["logs"].append(f"[{req.client}] {msg}")

    # 1. Test Player API
    try:
        add_log("Initiating player handshake...")
        if req.use_proxy:
            add_log(f"USING BRIGHTDATA PROXY: brd.superproxy.io")
            logger.info(f"LAB_AUDIT_START: video_id={video_id} client={req.client} proxied=True")
        else:
            logger.info(f"LAB_AUDIT_START: video_id={video_id} client={req.client} proxied=False")

        if req.client == "HEADLESS":
            add_log("Launching Playwright stealth session...")
            # Note: Playwright proxy support can be added here if needed
            data = await get_player_data_headless(video_id)
        else:
            add_log(f"Calling InnerTube API with Golden Identity: {req.client}")
            if req.use_proxy:
                # Custom proxied call for lab testing
                from app.pipeline.stream import CLIENTS, PLAYER_ENDPOINT
                config = CLIENTS.get(req.client)
                payload = {
                    "context": config["context"].copy(),
                    "videoId": video_id,
                    "playbackContext": {"contentPlaybackContext": {"signatureTimestamp": 20000}},
                    "contentCheckOk": True, "racyCheckOk": True
                }
                headers = config["headers"].copy()
                headers["Content-Type"] = "application/json"
                params = {"key": config["api_key"]}
                
                async with httpx.AsyncClient(proxy=BRIGHTDATA_PROXY, timeout=20) as client:
                    add_log("Dispatching proxied request via httpx...")
                    resp = await client.post(PLAYER_ENDPOINT, json=payload, params=params, headers=headers)
                    add_log(f"Proxy Response: {resp.status_code}")
                    resp.raise_for_status()
                    data = resp.json()
            else:
                data = await call_player_api(video_id, req.client, send_params=True)
            
        report["results"]["player_api"] = "SUCCESS"
        add_log("API Response received (200 OK)")
        logger.info(f"LAB_AUDIT_SUCCESS: video_id={video_id} client={req.client}")

        # Check Playability Status
        playability = data.get("playabilityStatus", {})
        p_status = playability.get("status")
        report["results"]["playability"] = p_status
        add_log(f"Playability Status: {p_status}")
        
        if p_status != "OK":
            reason = playability.get("reason", "Unknown block reason")
            add_log(f"BLOCK DETECTED: {reason}")
            if "errorScreen" in playability:
                add_log("Error screen present in response.")

        # Check Metadata
        details = data.get("videoDetails", {})
        if details:
            add_log(f"Metadata extracted: {details.get('title')[:30]}...")
        else:
            add_log("WARNING: videoDetails missing from response.")

        report["results"]["metadata"] = {
            "title": details.get("title"),
            "author": details.get("author"),
            "length": details.get("lengthSeconds")
        }

        # Check Captions
        captions = data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
        report["results"]["captions_found"] = len(captions)
        report["results"]["caption_languages"] = [c.get("languageCode") for c in captions]
        add_log(f"Found {len(captions)} caption tracks.")

        # Check Streams
        add_log("Analyzing streaming formats...")
        video_url = _pick_best_stream(data, 720)
        audio_url = _pick_best_audio_stream(data)
        
        if not video_url:
            add_log("CRITICAL: No video stream URLs found in streamingData.")
        if not audio_url:
            add_log("CRITICAL: No audio stream URLs found in streamingData.")

        report["results"]["streams"] = {
            "has_video_url": bool(video_url),
            "has_audio_url": bool(audio_url),
            "video_url_preview": video_url[:100] + "..." if video_url else None
        }

    except Exception as e:
        report["results"]["player_api"] = "FAILED"
        report["results"]["error"] = str(e)
        add_log(f"FATAL ERROR: {str(e)}")
        # Log full trace for developer
        logger.error(f"Debug test failed: {e}", exc_info=True)

    return report

@router.get("/testing2", response_class=HTMLResponse)
async def testing2_ui():
    """Serves the JDownloader Heavy-Lifter UI."""
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ShortClipr | JDownloader Lab</title>
        <style>
            :root { --bg: #0a0a0a; --accent: #ff9900; --text: #e0e0e0; }
            body { background: var(--bg); color: var(--text); font-family: 'Courier New', monospace; padding: 40px; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { color: var(--accent); border-bottom: 1px solid var(--accent); padding-bottom: 10px; }
            .input-group { margin-bottom: 20px; }
            input, button { 
                background: #1a1a1a; color: white; border: 1px solid #333; 
                padding: 10px; font-size: 16px; border-radius: 4px;
            }
            button { background: var(--accent); color: black; font-weight: bold; cursor: pointer; border: none; }
            .results { background: #111; padding: 20px; border: 1px solid #222; min-height: 200px; white-space: pre-wrap; font-size: 13px; }
            .status { margin-bottom: 10px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>JDownloader 2 Lab (/testing2)</h1>
            <p>Using <b>JDownloader@nitish</b> to resolve unblockable YouTube URLs.</p>
            
            <div class="input-group">
                <input type="text" id="url" placeholder="YouTube URL" style="width: 400px;">
                <button onclick="solveLink()">SOLVE LINK</button>
            </div>

            <div id="status" class="status">Ready.</div>
            <div id="results" class="results">JDownloader results...</div>
        </div>

        <script>
            async function solveLink() {
                const url = document.getElementById('url').value;
                const status = document.getElementById('status');
                const results = document.getElementById('results');

                if (!url) return alert('Enter a URL');
                
                status.innerText = "Sending to JDownloader...";
                results.innerText = "Requesting decryption...";

                try {
                    const res = await fetch('/testing2/solve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url_or_id: url, client: "JDOWNLOADER" })
                    });
                    const data = await res.json();
                    status.innerText = "JD SOLVER FINISHED";
                    results.innerText = JSON.stringify(data, null, 2);
                } catch (e) {
                    status.innerText = "JD ERROR";
                    results.innerText = e.message;
                }
            }
        </script>
    </body>
    </html>
    """

def _jd_solve_sync(url: str):
    """Synchronous JDownloader logic to run in executor."""
    jd = myjdapi.MyJDownloader()
    jd.set_app_key("ShortClipr_Labs")
    
    try:
        jd.connect(MYJD_EMAIL, MYJD_PASSWORD)
        device = jd.get_device(MYJD_DEVICE_NAME)
        if not device:
            return {"error": f"Device {MYJD_DEVICE_NAME} not found online."}

        # Add link to JDownloader
        # We use linkgrabber to avoid actually downloading, just resolving.
        device.linkgrabber.add_links([{"link": url, "autostart": False}])
        
        # Poll for a few seconds to see if it resolves
        import time
        max_retries = 10
        for _ in range(max_retries):
            time.sleep(2)
            packages = device.linkgrabber.query_packages()
            for pkg in packages:
                # Look for links in the grabber
                links = device.linkgrabber.query_links(package_uuids=[pkg.get("uuid")])
                for link in links:
                    if url in link.get("url", "") or video_id_in_link(url, link):
                        return {
                            "status": "RESOLVED",
                            "name": link.get("name"),
                            "url": link.get("url"), # This might be the source URL
                            "comment": link.get("comment"),
                            "bytes_total": link.get("bytesTotal"),
                            "raw_link_data": link
                        }
        
        return {"status": "TIMEOUT", "message": "JDownloader added the link but hasn't finished resolving yet. Check your JDownloader app GUI."}

    except Exception as e:
        return {"error": str(e)}

def video_id_in_link(target_url, link_data):
    # Helper to match video ID if URL changes
    from app.pipeline.stream import extract_video_id
    tid = extract_video_id(target_url)
    return tid and tid in (link_data.get("name", "") + link_data.get("url", ""))

@router.post("/testing2/solve")
async def solve_jd(req: TestRequest):
    """Endpoint to trigger JDownloader resolution."""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, _jd_solve_sync, req.url_or_id)
    return result
