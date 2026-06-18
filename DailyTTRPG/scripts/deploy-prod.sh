#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE=${1:-.env.production}

cd "$ROOT_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.production.example to $ENV_FILE and fill in the real values." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml config >/dev/null
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build
docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps
