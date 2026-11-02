# ── Stage 1: Build — install Python deps ───────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Build — bgutil PO Token provider server ────────────────────────────
# Mirrors the project's own server/Dockerfile (node_node target): full `npm ci`
# to get the TypeScript devDependency for the tsc build, then a separate
# prod-only `npm ci --omit=dev` copy of node_modules for the runtime image.
# Pinned to the SAME release tag as the yt-dlp plugin in requirements.txt —
# bump both together.
FROM node:22-bookworm-slim AS bgutil_builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN git config --global http.sslVerify false
RUN git clone --depth 1 --branch 1.3.2 \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider /src

WORKDIR /src/server
RUN npm ci --no-audit --no-fund \
    && npx tsc
# Re-install prod-only deps over the dev install — canvas/jsdom/express/etc
# native modules stay, tsc/eslint/prettier and friends are dropped before
# the runtime stage copies node_modules out.
RUN rm -rf node_modules \
    && npm ci --omit=dev --no-audit --no-fund


# ── Stage 3: Runtime ────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System dependencies for FFmpeg + fonts for libass subtitle rendering
# fonts-liberation  → Liberation Sans/Serif/Mono (metric-compatible with Arial)
# fonts-noto-core   → broad Unicode coverage, prevents □ tofu on any character
# fontconfig        → fc-cache rebuilds font index so libass can locate them
# nodejs            → runs the bgutil-ytdlp-pot-provider HTTP server sidecar
#                     (generates BotGuard PO tokens for the yt-dlp web/mweb
#                     clients — see requirements.txt + app/pipeline/stream.py)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        fonts-liberation \
        fonts-noto-core \
        fonts-noto-extra \
        fontconfig \
        curl \
        gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed Python packages from builder stage
COPY --from=builder /install /usr/local

# bgutil PO Token provider server — compiled JS + prod node_modules only.
COPY --from=bgutil_builder /src/server/build        /opt/bgutil-provider/build
COPY --from=bgutil_builder /src/server/node_modules  /opt/bgutil-provider/node_modules

# Copy only what the app needs at runtime
COPY app/        app/
COPY migrations/ migrations/
COPY start.sh    start.sh
RUN chmod +x start.sh

# Fetch additional trending caption fonts (Bangers, Luckiest Guy, Permanent
# Marker, Caveat — a script/cursive face) straight from the google/fonts repo
# into app/assets/fonts/ so both consumers below pick them up: PIL's title_box.py
# (needs a literal file path, see FONT_FILES there) and the fontconfig registration
# step right after (glob-copies everything in this directory). -fsSL: fail loudly
# on a bad response instead of silently baking in a missing font.
RUN curl -fsSL -o app/assets/fonts/Bangers-Regular.ttf \
        https://raw.githubusercontent.com/google/fonts/main/ofl/bangers/Bangers-Regular.ttf \
    && curl -fsSL -o app/assets/fonts/LuckiestGuy-Regular.ttf \
        https://raw.githubusercontent.com/google/fonts/main/apache/luckiestguy/LuckiestGuy-Regular.ttf \
    && curl -fsSL -o app/assets/fonts/PermanentMarker-Regular.ttf \
        https://raw.githubusercontent.com/google/fonts/main/apache/permanentmarker/PermanentMarker-Regular.ttf \
    && curl -fsSL -o app/assets/fonts/Caveat-VariableFont_wght.ttf \
        "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf"

# Register bundled caption fonts (Montserrat ExtraBold, Archivo Black, Anton,
# Bebas Neue, Poppins ExtraBold, Plus Jakarta Sans ExtraBold, Bangers,
# Luckiest Guy, Permanent Marker, Caveat) + Twemoji Mozilla (COLR colour-emoji
# font — provides emoji glyphs as a fontconfig fallback so libass renders
# 🔥💯✅ etc. inline with caption/title text, no overlay needed) with
# fontconfig so libass can find them by family name in the .ass file.
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
# start.sh backgrounds the bgutil PO-token sidecar (127.0.0.1:4416) before
# exec-ing uvicorn — see start.sh for the fallback behavior if it fails.
CMD ["./start.sh"]
