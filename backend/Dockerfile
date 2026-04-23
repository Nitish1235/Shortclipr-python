# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM python:3.11-slim

# Install FFmpeg (required for clip extraction + caption burning)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy source code
COPY app/ app/
COPY migrations/ migrations/

# Non-root user for security
RUN addgroup --system shortclipr && adduser --system --ingroup shortclipr shortclipr
USER shortclipr

# ── API mode (default): uvicorn FastAPI server ──────────────────────────────
# Override CMD in worker service deployment via cloudbuild-worker.yaml
ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
