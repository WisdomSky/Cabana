#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
rm -rf .e2e-state
mkdir -p .e2e-state .e2e-data
exec env \
  CABANA_STATE_DIR="$PWD/.e2e-state" \
  CABANA_DATA_DIR="$PWD/.e2e-data" \
  CABANA_WEB_DIR="$PWD/../web/dist" \
  CABANA_PORT=8088 \
  CABANA_HOST=0.0.0.0 \
  CABANA_VERSION=1.0.0-test \
  node ../server/src/start.js
