# Sensor NEXA untuk produksi di Railway: sensor + dashboard terbangun + Suricata lokal.
# Suricata dipakai untuk validasi `suricata -T` dan memuat rule yang DISETUJUI operator
# (runner exec, mode unix-socket, tanpa capture trafik). Build context = root repo.
# Paket lab (agen penyerang) tidak pernah masuk image ini: hanya manifest-nya untuk lockfile.
FROM node:24-bookworm-slim AS base
ENV CI=1
RUN npm install -g pnpm@12.18.0 && npm cache clean --force
WORKDIR /app

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
# Suricata 7 dari bookworm-backports (cadangan: paket bookworm). python3 untuk suricatasc.
RUN echo "deb http://deb.debian.org/debian bookworm-backports main" > /etc/apt/sources.list.d/backports.list \
  && apt-get update \
  && (apt-get install -y --no-install-recommends -t bookworm-backports suricata \
      || apt-get install -y --no-install-recommends suricata) \
  && apt-get install -y --no-install-recommends python3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY packages/shared packages/shared
COPY apps/sensor apps/sensor
COPY --from=dashboard /app/apps/dashboard/dist apps/dashboard/dist
COPY deploy/suricata/nexa-suricata.sh /opt/nexa/nexa-suricata.sh
COPY deploy/railway/entrypoint.sh /opt/nexa/entrypoint.sh
RUN sed -i 's/\r$//' /opt/nexa/nexa-suricata.sh /opt/nexa/entrypoint.sh \
  && chmod +x /opt/nexa/nexa-suricata.sh /opt/nexa/entrypoint.sh
ENV NEXA_SURICATA_HOME=/data/suricata
WORKDIR /app/apps/sensor
EXPOSE 8080 8081
# Entrypoint menyiapkan volume /data (dipasang root oleh Railway) lalu turun ke user `node`.
ENTRYPOINT ["/opt/nexa/entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
