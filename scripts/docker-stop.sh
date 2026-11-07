#!/usr/bin/env bash
# Stop the local Cabana test container without deleting .cabana-docker data.
set -Eeuo pipefail
if docker rm -f cabana-local >/dev/null 2>&1; then
  echo "Stopped the local Cabana container. Data in .cabana-docker was kept."
else
  echo "No local Cabana container is running."
fi
