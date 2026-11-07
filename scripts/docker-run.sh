#!/usr/bin/env bash
# Run Cabana inside a local Docker container for non-invasive testing.
# The container uses the host Docker socket so installed apps run on the host
# Docker engine, while Cabana itself and its state stay inside the container /
# a local .cabana-docker directory. No host packages are installed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd -P)"
PORT="${CABANA_DOCKER_PORT:-8080}"
DATA_BASE="${CABANA_DOCKER_DIR:-$ROOT/.cabana-docker}"
IMAGE="${CABANA_DOCKER_IMAGE:-cabana-local:$(node -p "require('./package.json').version")}"
VERSION="$(node -p "require('./package.json').version")"

command -v docker >/dev/null 2>&1 || { echo "Docker is required to run the local Cabana container." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "The Docker daemon is not available." >&2; exit 1; }

mkdir -p "$DATA_BASE/state" "$DATA_BASE/data"
chmod 700 "$DATA_BASE/state" 2>/dev/null || true
DATA_BASE="$(cd "$DATA_BASE" && pwd -P)"

echo "Building ${IMAGE}..."
docker build \
  --build-arg "CABANA_VERSION=${VERSION}" \
  -f Dockerfile \
  -t "$IMAGE" \
  "$ROOT"

echo "Starting Cabana on http://127.0.0.1:${PORT} ..."
docker rm -f cabana-local >/dev/null 2>&1 || true
docker run -d --name cabana-local --init \
  -p "${PORT}:8080" \
  -e CABANA_PORT=8080 \
  -e CABANA_STATE_DIR="${DATA_BASE}/state" \
  -e CABANA_DATA_DIR="${DATA_BASE}/data" \
  -e CABANA_WEB_DIR=/app/web/dist \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${DATA_BASE}:${DATA_BASE}" \
  "$IMAGE" >/dev/null

ready=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Cabana did not become healthy. Container logs:" >&2
  docker logs cabana-local >&2 || true
  exit 1
fi

cat <<DONE

  Cabana is running at http://127.0.0.1:${PORT}
  First run: create the administrator account in the browser.

  Local state: ${DATA_BASE}/state
  Local app data: ${DATA_BASE}/data

  This container has access to the host Docker socket so store apps can be
  installed for testing. It is a local development tool, not a hardened
  multi-tenant deployment. No host packages were installed.

  Stop it with: npm run docker:stop
  Start it again (data preserved): npm run docker

DONE
