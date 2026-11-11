# Sensor NEXA (headless) + dashboard terbangun. Build context = root repo.
FROM node:24-bookworm-slim AS base
ENV CI=1
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

# Manifest SEMUA paket workspace agar lockfile tervalidasi (--frozen-lockfile).
# Paket lab hanya manifest-nya; kodenya tidak pernah masuk image ini.
FROM base AS manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/sensor/package.json apps/sensor/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/desktop/package.json apps/desktop/
COPY apps/landing/package.json apps/landing/
COPY lab/target-app/package.json lab/target-app/
COPY lab/attacker-agent/package.json lab/attacker-agent/

FROM manifests AS deps
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter sensor...

# Dashboard dibangun di stage terpisah; dev dependency Vite tidak ikut image akhir.
FROM manifests AS dashboard
RUN pnpm install --frozen-lockfile --filter dashboard...
# Vite 8 (rolldown) membaca tsconfig dashboard, yang meng-extend tsconfig.base.json di root.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard
RUN pnpm --filter dashboard build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY packages/shared packages/shared
COPY apps/sensor apps/sensor
COPY --from=dashboard /app/apps/dashboard/dist apps/dashboard/dist
RUN mkdir -p /data /rules && chown -R node:node /data /rules
USER node
WORKDIR /app/apps/sensor
EXPOSE 8080 8081
CMD ["node", "--import", "tsx", "src/index.ts"]
