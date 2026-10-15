# Ordix as a self-hosted LAN server. Runs the built Worker in workerd via
# `wrangler dev` with a LOCAL D1 (SQLite) persisted in the /data volume —
# the same runtime that works in local development, no Cloudflare account needed.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    WRANGLER_SEND_METRICS=false \
    PERSIST_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx opennextjs-cloudflare build

VOLUME /data
EXPOSE 3000
ENTRYPOINT ["bash", "scripts/docker-entrypoint.sh"]
