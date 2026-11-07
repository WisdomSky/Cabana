#!/usr/bin/env bash
# Install the Docker Compose v2 plugin as a standalone CLI plugin without
# replacing an existing Docker Engine installation.
set -Eeuo pipefail
case "$(uname -m)" in
  x86_64|amd64) COMPOSE_ARCH="x86_64" ;;
  aarch64|arm64) COMPOSE_ARCH="aarch64" ;;
  *) echo "Unsupported architecture for Docker Compose" >&2; exit 1 ;;
esac
DEST_DIR="/usr/local/lib/docker/cli-plugins"
DEST="${DEST_DIR}/docker-compose"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BASE="https://github.com/docker/compose/releases/latest/download"
curl -fsSL --retry 3 "${BASE}/docker-compose-linux-${COMPOSE_ARCH}" -o "${TMP}/docker-compose"
curl -fsSL --retry 3 "${BASE}/checksums.txt" -o "${TMP}/checksums.txt"
EXPECTED="$(grep -E "docker-compose-linux-${COMPOSE_ARCH}$" "${TMP}/checksums.txt" | awk '{print $1}' | head -1)"
[ -n "$EXPECTED" ] || { echo "Could not find a Compose checksum for linux-${COMPOSE_ARCH}" >&2; exit 1; }
ACTUAL="$(sha256sum "${TMP}/docker-compose" | awk '{print $1}')"
[ "$EXPECTED" = "$ACTUAL" ] || { echo "Docker Compose checksum verification failed" >&2; exit 1; }
install -d -m 0755 "$DEST_DIR"
install -m 0755 "${TMP}/docker-compose" "$DEST"
echo "Docker Compose plugin installed at ${DEST}"
