FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_DODO_MODE
ARG VITE_META_PIXEL_ID
ARG VITE_GOOGLE_ADS_ID
ARG VITE_GOOGLE_ADS_SIGNUP_LABEL
ARG VITE_GOOGLE_ADS_CHECKOUT_LABEL
ARG VITE_GOOGLE_ADS_SUBSCRIBE_LABEL
ARG VITE_REDDIT_PIXEL_ID
ARG VITE_TIKTOK_PIXEL_ID

ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_DODO_MODE=$VITE_DODO_MODE \
    VITE_META_PIXEL_ID=$VITE_META_PIXEL_ID \
    VITE_GOOGLE_ADS_ID=$VITE_GOOGLE_ADS_ID \
    VITE_GOOGLE_ADS_SIGNUP_LABEL=$VITE_GOOGLE_ADS_SIGNUP_LABEL \
    VITE_GOOGLE_ADS_CHECKOUT_LABEL=$VITE_GOOGLE_ADS_CHECKOUT_LABEL \
    VITE_GOOGLE_ADS_SUBSCRIBE_LABEL=$VITE_GOOGLE_ADS_SUBSCRIBE_LABEL \
    VITE_REDDIT_PIXEL_ID=$VITE_REDDIT_PIXEL_ID \
    VITE_TIKTOK_PIXEL_ID=$VITE_TIKTOK_PIXEL_ID \
    VITE_DEMO_MODE=false

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig*.json vite.config.ts ./
COPY public/ public/
COPY src/ src/
COPY story-machine/studio-app.css story-machine/studio-app.css
RUN npm run build

FROM nginx:1.27-alpine
ARG VITE_API_URL
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY story-machine/index.html story-machine/style.css story-machine/product.css story-machine/live-reel.css story-machine/hero-background.css story-machine/machine.js story-machine/studio.js /usr/share/nginx/html/story-machine/
COPY story-machine/reference.css story-machine/reference.js /usr/share/nginx/html/story-machine/
RUN sed -i "s|__SHORTCLIPR_API_URL__|${VITE_API_URL}|g" /usr/share/nginx/html/story-machine/index.html
COPY story-machine/assets/ /usr/share/nginx/html/story-machine/assets/
COPY public/logo.svg public/favicon.svg /usr/share/nginx/html/public/
COPY nginx.conf /etc/nginx/conf.d/default.conf
ENV PORT=8080
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
