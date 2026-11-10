# Target lab fiktif ("portal satuan"). Hanya untuk lab; tidak ikut build produksi.
FROM node:24-bookworm-slim AS base
ENV CI=1 NODE_ENV=production
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/sensor/package.json apps/sensor/
COPY lab/target-app/package.json lab/target-app/
RUN pnpm install --frozen-lockfile --prod --filter target-app...

FROM base AS runtime
COPY --from=deps /app /app
COPY lab/target-app lab/target-app
USER node
WORKDIR /app/lab/target-app
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/server.ts"]
