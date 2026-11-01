# syntax=docker/dockerfile:1
# Build context: repository root (see .github/workflows/ci.yml).
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @rowlens/web...
COPY apps/web apps/web
# The SPA is built for one base path; the server refuses to start with a different one (ADR-0003).
ARG BASE_PATH=/projects/rowlens
ENV BASE_PATH=${BASE_PATH}
RUN pnpm --filter @rowlens/web build \
 && pnpm --filter @rowlens/web deploy --prod --legacy /out

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/ewoutbarendregt/rowlens" \
      org.opencontainers.image.title="rowlens-web"
ARG BASE_PATH=/projects/rowlens
# Image tag (sha-<7> or v<semver>), reported by /health/live; the deploy workflow checks it.
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=3000 BASE_PATH=${BASE_PATH} APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/web/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}${BASE_PATH}/health/live" || exit 1
CMD ["node", "dist/server/main.js"]
