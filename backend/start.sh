#!/bin/sh
set -eu
# Cloud Run service configuration historically used LOG_LEVEL=INFO. Uvicorn's
# CLI only accepts lower-case levels, while Python logging accepts either form.
UVICORN_LOG_LEVEL="$(printf '%s' "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')"
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --workers 1 \
  --timeout-keep-alive 75 \
  --log-level "${UVICORN_LOG_LEVEL}"
