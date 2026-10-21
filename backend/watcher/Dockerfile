# Watcher-only image — intentionally MUCH smaller than the main worker
# image (no FastAPI, no ffmpeg, no opencv, no yt-dlp). Just asyncpg + httpx
# for LISTEN/NOTIFY + HTTP dispatch to worker services.
#
# Build context: ./backend  (NOT ./backend/watcher — we need the watcher/
# package to land at /app/watcher/ so `python -m watcher.main` resolves).

FROM python:3.12-slim

WORKDIR /app

# Copy watcher-only requirements first for layer caching
COPY watcher/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The dispatcher shares the canonical plan-limit definitions with the API.
# Copy that tiny module too so the watcher can start without duplicating limits.
COPY watcher/ ./watcher/
COPY app/__init__.py ./app/__init__.py
COPY app/core/__init__.py ./app/core/__init__.py
COPY app/core/plan_limits.py ./app/core/plan_limits.py

# Fail the image build if the watcher gains an import that is not packaged in
# this deliberately-small image.  The placeholder configuration is only used
# while importing the module; no database or worker connection is attempted.
RUN SUPABASE_DB_URL=postgresql://build-check.invalid/shortclipr \
    WORKER_SERVICE_URLS=http://worker.invalid \
    INTERNAL_TASK_SECRET=build-import-check \
    python -c "import watcher.main"

CMD ["python", "-m", "watcher.main"]
