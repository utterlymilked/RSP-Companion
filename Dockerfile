# One image for production: the API server plus the app's web build (ADR 0001, ADR 0004).
# Build: docker build -t rsc-companion .   Run: see deploy/compose.yml and docs/OPERATIONS.md.

ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 EXPO_NO_TELEMETRY=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# The web app compares this with /api/health and reloads open tabs after a deploy.
ARG APP_VERSION=dev
ENV EXPO_PUBLIC_APP_VERSION=${APP_VERSION}
# Over-the-air updates for installed Android apps (docs/OPERATIONS.md#over-the-air-updates):
# one bundle per build variant (ADR 0020), each wired to its own server: the tester app to
# staging, the production app to prod. A stack serves only its own (OTA_VARIANT).
# A variant is skipped when its URL is unset.
ARG OTA_API_URL=
ARG OTA_PROD_API_URL=
RUN pnpm --filter @rsc/server build \
 && pnpm --filter @rsc/mobile build \
 && mkdir -p apps/mobile/dist-ota \
 && if [ -n "$OTA_API_URL" ]; then APP_VARIANT=tester EXPO_PUBLIC_APP_VARIANT=tester EXPO_PUBLIC_API_URL=$OTA_API_URL pnpm --filter @rsc/mobile build:ota; fi \
 && if [ -n "$OTA_PROD_API_URL" ]; then APP_VARIANT=production EXPO_PUBLIC_APP_VARIANT=production EXPO_PUBLIC_API_URL=$OTA_PROD_API_URL pnpm --filter @rsc/mobile build:ota; fi \
 && pnpm --filter @rsc/server deploy --legacy --prod /out

FROM ${NODE_IMAGE}
# Shown by /api/health; the image workflow passes the commit (sha-xxxxxxx).
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} NODE_ENV=production PORT=3000 WEB_DIST_DIR=/app/web OTA_DIR=/app/ota/tester
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/mobile/dist ./web
COPY --from=build /repo/apps/mobile/dist-ota ./ota
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Applies pending migrations, then starts the server.
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/index.js"]
