#!/bin/sh
# start.sh — launches the bgutil PO-token provider sidecar, then uvicorn.
#
# The sidecar generates BotGuard proof-of-origin tokens for yt-dlp's
# web/mweb player clients (see app/pipeline/stream.py, POT_PROVIDER_URL).
# It's local-only (127.0.0.1:4416, never exposed on $PORT) and best-effort:
# if it fails to start, uvicorn still starts — yt-dlp's POT plugin just
# no-ops and web/mweb tiers fail through to tv/tv_embedded as before this
# integration existed.
set -e

node /opt/bgutil-provider/build/main.js --port 4416 > /var/log/bgutil-provider.log 2>&1 &
BGUTIL_PID=$!
echo "bgutil PO-token provider started (pid $BGUTIL_PID, log: /var/log/bgutil-provider.log)"

exec python -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --workers 1 \
    --timeout-keep-alive 75 \
    --log-level info
