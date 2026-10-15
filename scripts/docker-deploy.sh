#!/usr/bin/env bash
# Build and run Ordix in Docker on this machine.
#
#   scripts/docker-deploy.sh up        build image + start (default)
#   scripts/docker-deploy.sh down      stop (data is kept)
#   scripts/docker-deploy.sh logs      follow server logs
#   scripts/docker-deploy.sh reset [--seed | --owner <user> <pass> [name]]
#                                       wipe the container DB and start fresh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker is not installed: https://docs.docker.com/get-docker/" >&2; exit 1; }

if [[ ! -f .env ]] || ! grep -q '^AUTH_SECRET=.\{20,\}' .env; then
  echo "AUTH_SECRET missing in .env — generating one."
  echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
fi

cmd="${1:-up}"; shift || true
case "$cmd" in
  up)
    docker compose up -d --build
    ip=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)
    echo "✔ Ordix running: http://localhost:3000  (tablets: http://${ip}:3000)"
    ;;
  down) docker compose down ;;
  logs) docker compose logs -f ordix ;;
  reset)
    docker compose stop ordix
    docker compose run --rm --entrypoint bash ordix scripts/reset-db.sh -y "$@"
    docker compose up -d
    ;;
  *) echo "Unknown command: $cmd (up | down | logs | reset)" >&2; exit 1 ;;
esac
