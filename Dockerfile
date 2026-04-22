# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for Vite
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_DODO_MODE

# Set them as environment variables so Vite can bake them into the build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_DODO_MODE=$VITE_DODO_MODE

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────────
FROM nginx:alpine

# Remove default Nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run requirement: bind to PORT
ENV PORT=8080
EXPOSE 8080

# Replace the ${PORT} placeholder with the actual Cloud Run PORT environment variable, then start Nginx
CMD sh -c "sed -i 's/${PORT}/'$PORT'/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
