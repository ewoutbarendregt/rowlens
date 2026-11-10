# syntax=docker/dockerfile:1
# Build context: repository root (see .github/workflows/ci.yml).

# Player demo clips (#51), generated here so the image never depends on files from a laptop.
# Empty unless the demo is enabled.
FROM debian:trixie-slim AS demo-media
ARG VITE_FEATURE_PLAYER_DEMO=false
COPY scripts/demo-media/generate.sh /generate.sh
RUN if [ "$VITE_FEATURE_PLAYER_DEMO" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core >/dev/null \
      && ROWLENS_MEDIA_LOCAL_FFMPEG=1 bash /generate.sh --out /out \
      && rm -rf /var/lib/apt/lists/*; \
    else mkdir -p /out; fi

FROM node:26-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rowlens/web...
COPY apps/web apps/web
COPY --from=demo-media /out apps/web/public/demo-media
# The SPA is built for one base path; the server refuses to start with a different one (ADR-0003).
ARG BASE_PATH=/projects/rowlens
# Numeric display version; APP_VERSION remains the diagnostic/deployment image identity.
ARG APP_RELEASE
# Build-time feature flag (src/client/features.ts); off by default, so the demo isn't in the bundle.
ARG VITE_FEATURE_PLAYER_DEMO=false
# The boat line found per frame (ADR-0018): on; false builds without showing it.
ARG VITE_FEATURE_VIDEO_REUSE=false
ARG VITE_FEATURE_UNIFIED_USERS=false
ARG VITE_FEATURE_AUTO_BOAT_LINE=true
ENV BASE_PATH=${BASE_PATH} APP_RELEASE=${APP_RELEASE} VITE_FEATURE_PLAYER_DEMO=${VITE_FEATURE_PLAYER_DEMO} \
    VITE_FEATURE_AUTO_BOAT_LINE=${VITE_FEATURE_AUTO_BOAT_LINE} \
    VITE_FEATURE_UNIFIED_USERS=${VITE_FEATURE_UNIFIED_USERS} \
    VITE_FEATURE_VIDEO_REUSE=${VITE_FEATURE_VIDEO_REUSE}
RUN pnpm --filter @rowlens/web build \
 && pnpm --filter @rowlens/web deploy --prod --legacy /out

FROM node:26-alpine
LABEL org.opencontainers.image.source="https://github.com/ewoutbarendregt/rowlens" \
      org.opencontainers.image.title="rowlens-web"
ARG BASE_PATH=/projects/rowlens
# Image tag (sha-<7> or v<semver>), reported by /health/live; the deploy workflow checks it.
ARG APP_VERSION=dev
ARG VITE_FEATURE_VIDEO_REUSE=false
ARG VITE_FEATURE_UNIFIED_USERS=false
ENV NODE_ENV=production PORT=3000 BASE_PATH=${BASE_PATH} APP_VERSION=${APP_VERSION} \
    UNIFIED_USERS=${VITE_FEATURE_UNIFIED_USERS}
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/web/dist ./dist
# /media pre-created (uid 1000, like the server's media dir) so a named volume starts out writable.
RUN install -d -o node -g node /media
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}${BASE_PATH}/health/live" || exit 1
CMD ["node", "dist/server/main.js"]
