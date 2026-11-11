# Agen penyerang uji (lab saja). Hanya menyasar host di LAB_TARGET_ALLOWLIST.
FROM node:24-bookworm-slim AS base
ENV CI=1 NODE_ENV=production
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/sensor/package.json apps/sensor/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/desktop/package.json apps/desktop/
COPY apps/landing/package.json apps/landing/
COPY lab/target-app/package.json lab/target-app/
COPY lab/attacker-agent/package.json lab/attacker-agent/
RUN pnpm install --frozen-lockfile --prod --filter attacker-agent...

FROM base AS runtime
COPY --from=deps /app /app
COPY lab/attacker-agent lab/attacker-agent
RUN mkdir -p /app/lab/output && chown -R node:node /app/lab/output
USER node
WORKDIR /app/lab/attacker-agent
ENTRYPOINT ["node", "--import", "tsx", "src/main.ts"]
