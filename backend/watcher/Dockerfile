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

CMD ["python", "-m", "watcher.main"]
