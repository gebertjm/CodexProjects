#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_image=node:20-alpine
postgres_image=postgres:16-alpine

# The backend loads these files automatically. Require a clean CI checkout.
if [[ -e "$project_dir/.env" || -L "$project_dir/.env" ||
      -e "$project_dir/backend/.env" || -L "$project_dir/backend/.env" ]]; then
  echo "Use a clean checkout without DailyTTRPG/.env or DailyTTRPG/backend/.env." >&2
  exit 1
fi

docker pull "$node_image"
docker pull "$postgres_image"
docker run --rm --user "$(id -u):$(id -g)" \
  --env npm_config_cache=/tmp/npm-cache \
  --mount "type=bind,src=$project_dir/backend,dst=/backend" \
  --workdir /backend "$node_image" npm ci --no-audit --no-fund

db_container="$(docker run --detach --network none \
  --env POSTGRES_DB=dailyttrpg_ci \
  --env POSTGRES_USER=dailyttrpg_ci \
  --env POSTGRES_PASSWORD=disposable-ci \
  --mount "type=bind,src=$project_dir/db/init,dst=/docker-entrypoint-initdb.d,readonly" \
  "$postgres_image")"
trap 'docker rm --force --volumes "$db_container" >/dev/null' EXIT

wait_for_database() {
  # TCP becomes available only after the entrypoint has applied the init SQL.
  for ((attempt = 1; attempt <= 60; attempt++)); do
    if docker exec "$db_container" pg_isready --quiet --host 127.0.0.1 \
      --username dailyttrpg_ci --dbname dailyttrpg_ci; then
      return
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "$db_container")" != true ]]; then
      break
    fi
    sleep 1
  done
  echo "Disposable PostgreSQL failed to initialize." >&2
  docker logs "$db_container" >&2
  return 1
}

wait_for_database

# This namespace has loopback only. The test HTTP server and PostgreSQL can
# reach one another without access to the runner or any external service.
docker run --rm --network "container:$db_container" \
  --user "$(id -u):$(id -g)" \
  --env npm_config_cache=/tmp/npm-cache \
  --env NODE_ENV=test \
  --env DATABASE_URL=postgresql://dailyttrpg_ci:disposable-ci@127.0.0.1:5432/dailyttrpg_ci \
  --env DB_SSL=false \
  --env ALLOW_TEST_FIREBASE_AUTH=true \
  --env ENABLE_SMS_SIMULATOR=true \
  --mount "type=bind,src=$project_dir,dst=/project,readonly" \
  --workdir /project/backend "$node_image" \
  sh -ec 'npm run --silent cli -- validate-content --path ../content/worlds/greyvale && npm test'
