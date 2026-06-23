# ── Stage 1: Build — install Python deps ───────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Runtime ────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System dependencies for FFmpeg + fonts for libass subtitle rendering
# fonts-liberation  → Liberation Sans/Serif/Mono (metric-compatible with Arial)
# fonts-noto-core   → broad Unicode coverage, prevents □ tofu on any character
# fontconfig        → fc-cache rebuilds font index so libass can locate them
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-liberation \
        fonts-noto-core \
        fonts-noto-extra \
        fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# Copy only what the app needs at runtime
COPY app/        app/
COPY migrations/ migrations/

# Register bundled caption fonts (Montserrat ExtraBold, Archivo Black, Anton,
# Bebas Neue, Poppins ExtraBold, Plus Jakarta Sans ExtraBold) + Twemoji Mozilla
# (COLR colour-emoji font — provides emoji glyphs as a fontconfig fallback so
# libass renders 🔥💯✅ etc. inline with caption/title text, no overlay needed)
# with fontconfig so libass can find them by family name in the .ass file.
RUN mkdir -p /usr/share/fonts/truetype/shortclipr \
    && cp app/assets/fonts/*.ttf /usr/share/fonts/truetype/shortclipr/ \
    && fc-cache -fv

# ── Cloud Run settings ──────────────────────────────────────────────────────────
ENV PORT=8080
EXPOSE 8080

# Single worker — Cloud Run scales horizontally, not vertically.
# --timeout-keep-alive 75: slightly above Cloud Run's 60s idle timeout so
#   Cloud Run can drain connections cleanly before killing the container.
# --log-level info: structured logs picked up by Cloud Logging.
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "1", \
     "--timeout-keep-alive", "75", \
     "--log-level", "info"]
