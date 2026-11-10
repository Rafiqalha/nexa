# Sensor NEXA (headless). Build context = root repo.
FROM node:24-bookworm-slim AS base
ENV CI=1 NODE_ENV=production
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

FROM base AS deps
# Manifest semua paket workspace agar lockfile tervalidasi; hanya sensor yang dipasang.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/sensor/package.json apps/sensor/
COPY lab/target-app/package.json lab/target-app/
COPY lab/attacker-agent/package.json lab/attacker-agent/
RUN pnpm install --frozen-lockfile --prod --filter sensor...

FROM base AS runtime
COPY --from=deps /app /app
COPY packages/shared packages/shared
COPY apps/sensor apps/sensor
RUN mkdir -p /data /rules && chown -R node:node /data /rules
USER node
WORKDIR /app/apps/sensor
EXPOSE 8080 8081
CMD ["node", "--import", "tsx", "src/index.ts"]
