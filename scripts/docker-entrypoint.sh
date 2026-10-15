#!/usr/bin/env bash
# Container start: write runtime secrets, sync the schema, create the first owner, serve.
set -euo pipefail
cd /app

: "${AUTH_SECRET:?AUTH_SECRET is required (openssl rand -base64 32)}"
printf 'AUTH_SECRET=%s\nAPP_TIMEZONE=%s\n' "$AUTH_SECRET" "${APP_TIMEZONE:-Europe/Athens}" > .dev.vars

# Applies only migrations not yet recorded — safe on every start.
npx wrangler d1 migrations apply ordix-db --local --persist-to "$PERSIST_DIR"

if [[ -n "${OWNER_USERNAME:-}" && -n "${OWNER_PASSWORD:-}" ]]; then
  user_count=$(npx wrangler d1 execute ordix-db --local --persist-to "$PERSIST_DIR" --json \
    --command "SELECT count(*) AS n FROM users" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0].results[0].n))')
  if [[ "$user_count" == "0" ]]; then
    npx tsx scripts/create-user.ts "$OWNER_USERNAME" "$OWNER_PASSWORD" "${OWNER_NAME:-Owner}" --owner
  fi
fi

exec npx wrangler dev --ip 0.0.0.0 --port 3000 --persist-to "$PERSIST_DIR" \
  --show-interactive-dev-session=false
