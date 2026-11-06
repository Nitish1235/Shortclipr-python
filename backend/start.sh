#!/bin/sh
set -eu
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --workers 1 \
  --timeout-keep-alive 75 \
  --log-level "${LOG_LEVEL:-info}"
