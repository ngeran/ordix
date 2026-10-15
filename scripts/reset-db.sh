#!/usr/bin/env bash
# Wipe the LOCAL Ordix database and rebuild it from the drizzle/ migrations.
# Never touches the remote Cloudflare D1.
#
#   scripts/reset-db.sh                       empty DB (no users — you can't log in)
#   scripts/reset-db.sh --owner nikos 's3cret' "Nikos"   empty DB + one owner account
#   scripts/reset-db.sh --seed                demo data (admin/admin123, staff/staff123)
#   scripts/reset-db.sh -y ...                skip the confirmation prompt
#
# PERSIST_DIR (default .wrangler/state) selects the data folder; Docker uses /data.
# Stop `npm run dev` / the container first — the running server holds the SQLite file open.
set -euo pipefail
cd "$(dirname "$0")/.."

PERSIST_DIR="${PERSIST_DIR:-.wrangler/state}"
export PERSIST_DIR
SEED=0; YES=0; OWNER_USER=""; OWNER_PASS=""; OWNER_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed) SEED=1; shift ;;
    -y|--yes) YES=1; shift ;;
    --owner)
      OWNER_USER="${2:?--owner needs <username> <password> [name]}"
      OWNER_PASS="${3:?--owner needs <username> <password> [name]}"
      shift 3
      if [[ $# -gt 0 && "$1" != -* ]]; then OWNER_NAME="$1"; shift; fi
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

D1_DIR="$PERSIST_DIR/v3/d1"

if [[ $YES -ne 1 ]]; then
  read -r -p "This DELETES all local data in $D1_DIR. Type 'yes' to continue: " answer
  [[ "$answer" == "yes" ]] || { echo "Aborted."; exit 1; }
fi

if [[ -d "$D1_DIR" ]]; then
  backup="$PERSIST_DIR/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup"
  mv "$D1_DIR" "$backup/"
  echo "✔ Old database moved to $backup (delete it when you no longer need it)"
fi

echo "Applying migrations…"
npx wrangler d1 migrations apply ordix-db --local --persist-to "$PERSIST_DIR"

if [[ $SEED -eq 1 ]]; then
  npx tsx scripts/seed.ts
fi

if [[ -n "$OWNER_USER" ]]; then
  npx tsx scripts/create-user.ts "$OWNER_USER" "$OWNER_PASS" ${OWNER_NAME:+"$OWNER_NAME"} --owner
fi

echo "✔ Database reset complete."
