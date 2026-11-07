#!/usr/bin/env bash
# Cabana installer for Debian 12 and Ubuntu 24.04 on amd64/arm64.
# Usage: curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
# Optional: ... | sudo CABANA_PORT=8080 bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 022

REPO="WisdomSky/Cabana"
CABANA_STATE_DIR="/var/lib/cabana"
CABANA_DATA_DIR="/DATA"
APP_DIR="/opt/cabana/app"
NODE_DIR="/opt/cabana/node"
ENV_DIR="/etc/cabana"
ENV_FILE="/etc/cabana/cabana.env"
UNIT_FILE="/etc/systemd/system/cabana.service"
DOCKER_KEYRING="/etc/apt/keyrings/docker.asc"
DOCKER_LIST="/etc/apt/sources.list.d/docker.list"
RELEASE_REF="${CABANA_VERSION:-latest}"
CABANA_NODE_MAJOR="${CABANA_NODE_MAJOR:-26}"
TMP_DIR=""

log() { printf 'Cabana: %s\n' "$*"; }
warn() { printf 'Cabana: warning: %s\n' "$*" >&2; }
die() {
  printf '\nCabana installer stopped: %s\n' "$*" >&2
  exit 1
}
cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi
}
trap cleanup EXIT

[ "$(id -u)" -eq 0 ] || die "This installer must run as root. Re-run the command through sudo:
  curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sudo bash"

[ -r /etc/os-release ] || die "Cannot read /etc/os-release. Cabana supports Debian 12 and Ubuntu 24.04 only."
. /etc/os-release
DISTRO_ID="${ID:-unknown}"
DISTRO_VERSION="${VERSION_ID:-unknown}"
DISTRO_CODENAME="${VERSION_CODENAME:-unknown}"
case "${DISTRO_ID}/${DISTRO_VERSION}" in
  debian/12|ubuntu/24.04) ;;
  *)
    die "Unsupported operating system: ${PRETTY_NAME:-$DISTRO_ID $DISTRO_VERSION}.
Supported systems are Debian 12 (bookworm) and Ubuntu 24.04 LTS (noble) on amd64 or arm64.
No changes have been made."
    ;;
esac

case "$(uname -m)" in
  x86_64|amd64) HOST_ARCH="amd64" ;;
  aarch64|arm64) HOST_ARCH="arm64" ;;
  *) die "Unsupported CPU architecture: $(uname -m). Cabana supports amd64 and arm64 only." ;;
esac

command -v systemctl >/dev/null 2>&1 || die "systemd is required but was not found."
[ -d /run/systemd/system ] || die "This host does not appear to be running systemd. Cabana requires systemd."

# ---------------------------------------------------------------------------
# Port selection and early conflict check
# ---------------------------------------------------------------------------
PORT_EXPLICIT=0
PORT="${CABANA_PORT:-}"
if [ -n "$PORT" ]; then PORT_EXPLICIT=1; fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || die "--port requires a value, for example: --port 8080"
      PORT="$2"
      PORT_EXPLICIT=1
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      PORT_EXPLICIT=1
      shift
      ;;
    -h|--help)
      cat <<'HELP'
Cabana installer
  sudo bash install.sh [--port 8080]
Environment:
  CABANA_PORT=8080   Listen port (default 80, or the port from a previous install)
  CABANA_VERSION=v1.0.0   Install a specific published release instead of latest
HELP
      exit 0
      ;;
    *) die "Unknown argument: $1. Use --help for usage." ;;
  esac
done
if [ -f "$ENV_FILE" ] && [ "$PORT_EXPLICIT" -eq 0 ]; then
  EXISTING_PORT="$(sed -n 's/^CABANA_PORT=//p' "$ENV_FILE" | tail -1)"
  if [ -n "$EXISTING_PORT" ]; then PORT="$EXISTING_PORT"; fi
fi
PORT="${PORT:-80}"
case "$PORT" in
  ''|*[!0-9]*) die "Invalid port: ${PORT}. Use a number between 1 and 65535." ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Invalid port: ${PORT}. Use a number between 1 and 65535."

if ! command -v ss >/dev/null 2>&1; then
  apt-get update -o DPkg::Lock::Timeout=120 >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -o DPkg::Lock::Timeout=120 iproute2 >/dev/null
fi

port_listener_pid() {
  ss -H -ltnp 2>/dev/null | awk -v suffix=":${PORT}" '$4 ~ suffix "$" { if (match($0, /pid=[0-9]+/)) { print substr($0, RSTART + 4, RLENGTH - 4); exit } }'
}
port_is_listening() {
  ss -H -ltn 2>/dev/null | awk -v suffix=":${PORT}" '$4 ~ suffix "$" { found=1 } END { exit found ? 0 : 1 }'
}
CABANA_PID="$(systemctl show -p MainPID --value cabana.service 2>/dev/null || true)"
LISTENER_PID="$(port_listener_pid || true)"
if [ -n "$LISTENER_PID" ]; then
  if [ -n "$CABANA_PID" ] && [ "$CABANA_PID" = "$LISTENER_PID" ]; then
    log "Port ${PORT} is already served by the installed Cabana service; continuing with a safe rerun."
  else
    LISTENER_NAME="$(ps -o comm= -p "$LISTENER_PID" 2>/dev/null || true)"
    die "Port ${PORT} is already in use by ${LISTENER_NAME:-another process} (pid ${LISTENER_PID}).
Cabana's default port is 80. Free the port, or install Cabana on another port:
  curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
No changes have been made."
  fi
fi

log "Detected ${PRETTY_NAME:-$DISTRO_ID $DISTRO_VERSION} (${HOST_ARCH})."

# ---------------------------------------------------------------------------
# Docker Engine + Compose plugin
# ---------------------------------------------------------------------------
docker_ok() {
  command -v docker >/dev/null 2>&1 &&
    docker info >/dev/null 2>&1 &&
    docker compose version >/dev/null 2>&1
}

add_docker_repo() {
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -s "$DOCKER_KEYRING" ]; then
    curl -fsSL --retry 3 "https://download.docker.com/linux/${DISTRO_ID}/gpg" -o "${DOCKER_KEYRING}.tmp"
    mv "${DOCKER_KEYRING}.tmp" "$DOCKER_KEYRING"
  fi
  chmod a+r "$DOCKER_KEYRING"
  local deb_arch="$HOST_ARCH"
  printf 'deb [arch=%s signed-by=%s] https://download.docker.com/linux/%s %s stable\n' \
    "$deb_arch" "$DOCKER_KEYRING" "$DISTRO_ID" "$DISTRO_CODENAME" > "${DOCKER_LIST}.tmp"
  mv "${DOCKER_LIST}.tmp" "$DOCKER_LIST"
  apt-get update -o DPkg::Lock::Timeout=120
}

install_standalone_compose() {
  local compose_arch compose_dest compose_tmp base expected actual
  case "$HOST_ARCH" in
    amd64) compose_arch="x86_64" ;;
    arm64) compose_arch="aarch64" ;;
  esac
  compose_dest="/usr/local/lib/docker/cli-plugins/docker-compose"
  compose_tmp="$(mktemp -d)"
  base="https://github.com/docker/compose/releases/latest/download"
  log "Installing the Docker Compose v2 plugin without replacing the existing Docker Engine."
  curl -fsSL --retry 3 "${base}/docker-compose-linux-${compose_arch}" -o "${compose_tmp}/docker-compose" ||
    die "Could not download the Docker Compose plugin."
  curl -fsSL --retry 3 "${base}/checksums.txt" -o "${compose_tmp}/checksums.txt" ||
    die "Could not download the Docker Compose checksums."
  expected="$(grep -E "docker-compose-linux-${compose_arch}$" "${compose_tmp}/checksums.txt" | awk '{print $1}' | head -1)"
  actual="$(sha256sum "${compose_tmp}/docker-compose" | awk '{print $1}')"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] ||
    { rm -rf "$compose_tmp"; die "Docker Compose checksum verification failed."; }
  install -d -m 0755 /usr/local/lib/docker/cli-plugins
  install -m 0755 "${compose_tmp}/docker-compose" "$compose_dest"
  rm -rf "$compose_tmp"
}

if docker_ok; then
  log "Reusing the existing Docker Engine and Compose plugin."
else
  if command -v docker >/dev/null 2>&1; then
    DOCKER_PATH="$(command -v docker)"
    case "$DOCKER_PATH" in
      *snap*) die "The existing Docker installation is the snap package (${DOCKER_PATH}), which is not compatible with Cabana's systemd service.
Remove snap Docker and re-run the installer to use Docker's official packages." ;;
    esac
    if ! docker info >/dev/null 2>&1; then
      log "Existing Docker Engine found but not running; trying to enable it without reinstalling."
      systemctl enable --now docker >/dev/null 2>&1 || true
      sleep 1
    fi
    if ! docker info >/dev/null 2>&1; then
      die "An existing Docker installation was found but its daemon is not available. Cabana will not replace or modify that installation.
Fix the existing Docker daemon (systemctl status docker) and re-run this installer."
    fi
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -o DPkg::Lock::Timeout=120
  apt-get install -y -o DPkg::Lock::Timeout=120 ca-certificates curl xz-utils >/dev/null

  if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker Engine from Docker's official repository."
    add_docker_repo
    apt-get install -y -o DPkg::Lock::Timeout=120 \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
    systemctl enable --now docker >/dev/null
    for _ in $(seq 1 20); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
    if docker info >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
      install_standalone_compose
    fi
  elif ! docker compose version >/dev/null 2>&1; then
    install_standalone_compose
  fi

  docker_ok || die "Docker Engine or the Compose plugin is still unavailable after installation. Check 'systemctl status docker' and 'docker compose version'."
  log "Docker Engine is ready."
fi

# ---------------------------------------------------------------------------
# Node.js LTS
# ---------------------------------------------------------------------------
node_compatible() {
  local candidate="$1"
  [ -x "$candidate" ] || return 1
  "$candidate" -e 'process.exit(process.versions.node.split(".")[0] >= 24 ? 0 : 1)' >/dev/null 2>&1 || return 1
  "$candidate" -e 'const m=+process.versions.node.split(".")[0]; process.exit(m % 2 === 0 ? 0 : 1)' >/dev/null 2>&1 || return 1
  "$candidate" -e "require('node:sqlite')" >/dev/null 2>&1 || return 1
}

NODE_BIN=""
if [ -x "$NODE_DIR/bin/node" ] && node_compatible "$NODE_DIR/bin/node"; then
  NODE_BIN="$NODE_DIR/bin/node"
  log "Reusing Cabana's existing Node.js $("$NODE_BIN" --version)."
elif command -v node >/dev/null 2>&1 && node_compatible "$(command -v node)"; then
  NODE_BIN="$(command -v node)"
  log "Reusing the compatible system Node.js $("$NODE_BIN" --version)."
else
  log "Installing Node.js ${CABANA_NODE_MAJOR}.x LTS from nodejs.org."
  apt-get update -o DPkg::Lock::Timeout=120 >/dev/null
  apt-get install -y -o DPkg::Lock::Timeout=120 ca-certificates curl xz-utils >/dev/null
  case "$HOST_ARCH" in
    amd64) NODE_ARCH="x64" ;;
    arm64) NODE_ARCH="arm64" ;;
  esac
  NODE_BASE="https://nodejs.org/dist/latest-v${CABANA_NODE_MAJOR}.x"
  NODE_SUMS="$(mktemp)"
  curl -fsSL --retry 3 "${NODE_BASE}/SHASUMS256.txt" -o "$NODE_SUMS"
  NODE_TARBALL="$(awk -v suffix="linux-${NODE_ARCH}.tar.xz" '$2 ~ suffix "$" { print $2; exit }' "$NODE_SUMS")"
  [ -n "$NODE_TARBALL" ] || die "Could not find a Node.js ${CABANA_NODE_MAJOR}.x Linux ${NODE_ARCH} tarball."
  NODE_SHA="$(awk -v file="$NODE_TARBALL" '$2 == file { print $1; exit }' "$NODE_SUMS")"
  mkdir -p /opt/cabana
  curl -fsSL --retry 3 "${NODE_BASE}/${NODE_TARBALL}" -o "/opt/cabana/${NODE_TARBALL}"
  echo "${NODE_SHA}  /opt/cabana/${NODE_TARBALL}" | sha256sum -c - >/dev/null
  rm -rf "${NODE_DIR}.new"
  mkdir -p "${NODE_DIR}.new"
  tar -xJf "/opt/cabana/${NODE_TARBALL}" -C "${NODE_DIR}.new" --strip-components=1
  rm -f "/opt/cabana/${NODE_TARBALL}" "$NODE_SUMS"
  rm -rf "${NODE_DIR}.old"
  if [ -d "$NODE_DIR" ]; then mv "$NODE_DIR" "${NODE_DIR}.old"; fi
  mv "${NODE_DIR}.new" "$NODE_DIR"
  NODE_BIN="$NODE_DIR/bin/node"
  node_compatible "$NODE_BIN" || die "The downloaded Node.js binary failed its compatibility check."
  log "Installed Node.js $("$NODE_BIN" --version)."
fi

# ---------------------------------------------------------------------------
# Release artifact
# ---------------------------------------------------------------------------
if [ "$RELEASE_REF" = "latest" ]; then
  RELEASE_BASE="https://github.com/${REPO}/releases/latest/download"
else
  RELEASE_BASE="https://github.com/${REPO}/releases/download/${RELEASE_REF}"
fi

log "Downloading the published Cabana application bundle."
TMP_DIR="$(mktemp -d)"
curl -fsSL --retry 3 --retry-delay 2 "${RELEASE_BASE}/cabana-app.tar.gz" -o "${TMP_DIR}/cabana-app.tar.gz" ||
  die "Could not download cabana-app.tar.gz from the latest release. Check your network and https://github.com/${REPO}/releases."
curl -fsSL --retry 3 --retry-delay 2 "${RELEASE_BASE}/cabana-app.tar.gz.sha256" -o "${TMP_DIR}/cabana-app.tar.gz.sha256" ||
  die "Could not download the release checksum. Refusing to install an unverified bundle."
EXPECTED_SHA="$(awk '{print $1}' "${TMP_DIR}/cabana-app.tar.gz.sha256")"
ACTUAL_SHA="$(sha256sum "${TMP_DIR}/cabana-app.tar.gz" | awk '{print $1}')"
[ -n "$EXPECTED_SHA" ] && [ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] ||
  die "The downloaded Cabana bundle failed SHA-256 verification. Refusing to install it."

mkdir -p "${TMP_DIR}/unpacked"
tar -xzf "${TMP_DIR}/cabana-app.tar.gz" -C "${TMP_DIR}/unpacked" --strip-components=1
[ -f "${TMP_DIR}/unpacked/server.cjs" ] || die "The release bundle is missing server.cjs."
[ -f "${TMP_DIR}/unpacked/web/dist/index.html" ] || die "The release bundle is missing the web UI."
[ -f "${TMP_DIR}/unpacked/VERSION" ] || die "The release bundle is missing its version marker."
APP_VERSION="$(tr -d '\n\r' < "${TMP_DIR}/unpacked/VERSION")"
log "Bundle ${APP_VERSION} verified."

# ---------------------------------------------------------------------------
# Directories, environment, systemd
# ---------------------------------------------------------------------------
install -d -m 0750 "$CABANA_STATE_DIR"
install -d -m 0755 "$CABANA_DATA_DIR"
install -d -m 0755 /opt/cabana
install -d -m 0750 "$ENV_DIR"
# The server keeps temporary uploads and Docker CLI state inside its state dir.
install -d -m 0700 "${CABANA_STATE_DIR}/tmp"

if port_is_listening; then
  LISTENER_PID="$(port_listener_pid || true)"
  CABANA_PID="$(systemctl show -p MainPID --value cabana.service 2>/dev/null || true)"
  if [ -z "$LISTENER_PID" ] || [ -z "$CABANA_PID" ] || [ "$LISTENER_PID" != "$CABANA_PID" ]; then
    die "Port ${PORT} became busy before Cabana could start. Free the port or re-run with CABANA_PORT."
  fi
fi

log "Installing application files and the systemd unit."
systemctl stop cabana.service >/dev/null 2>&1 || true
rm -rf "${APP_DIR}.old"
if [ -d "$APP_DIR" ]; then mv "$APP_DIR" "${APP_DIR}.old"; fi
mv "${TMP_DIR}/unpacked" "$APP_DIR"
chmod 0755 "$APP_DIR/server.cjs"

# Preserve administrator-provided environment options across reruns.
PRESERVED_ENV=""
if [ -f "$ENV_FILE" ]; then
  PRESERVED_ENV="$(grep -vE '^(CABANA_PORT|CABANA_STATE_DIR|CABANA_DATA_DIR|CABANA_VERSION|NODE_ENV|HOME)=' "$ENV_FILE" || true)"
fi
{
  printf '# Managed by the Cabana installer. Rerunning the installer preserves this file.\n'
  [ -n "$PRESERVED_ENV" ] && printf '%s\n' "$PRESERVED_ENV"
  printf 'CABANA_PORT=%s\n' "$PORT"
  printf 'CABANA_STATE_DIR=%s\n' "$CABANA_STATE_DIR"
  printf 'CABANA_DATA_DIR=%s\n' "$CABANA_DATA_DIR"
  printf 'CABANA_VERSION=%s\n' "$APP_VERSION"
  printf 'NODE_ENV=production\n'
  printf 'HOME=%s\n' "$CABANA_STATE_DIR"
} > "${ENV_FILE}.tmp"
chmod 0640 "${ENV_FILE}.tmp"
mv "${ENV_FILE}.tmp" "$ENV_FILE"

cat > "${UNIT_FILE}.tmp" <<UNIT
[Unit]
Description=Cabana personal cloud server
Documentation=https://github.com/${REPO}
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${APP_DIR}/server.cjs
Restart=on-failure
RestartSec=3
User=root
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=yes
ReadWritePaths=${CABANA_STATE_DIR} ${CABANA_DATA_DIR}
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "${UNIT_FILE}.tmp"
mv "${UNIT_FILE}.tmp" "$UNIT_FILE"

systemctl daemon-reload
systemctl enable cabana.service >/dev/null
systemctl restart cabana.service

HEALTH=""
for _ in $(seq 1 60); do
  if HEALTH="$(curl --noproxy '*' -fsS "http://127.0.0.1:${PORT}/api/health" 2>/dev/null)"; then
    break
  fi
  HEALTH=""
  sleep 1
done
if [ -z "$HEALTH" ]; then
  warn "Cabana did not become healthy. Recent service logs follow:"
  journalctl -u cabana.service -n 80 --no-pager >&2 || true
  systemctl stop cabana.service >/dev/null 2>&1 || true
  if [ -d "${APP_DIR}.old" ]; then
    rm -rf "${APP_DIR}.failed"
    mv "$APP_DIR" "${APP_DIR}.failed"
    mv "${APP_DIR}.old" "$APP_DIR"
    systemctl restart cabana.service >/dev/null 2>&1 || true
    warn "The previous Cabana application files were restored."
  fi
  die "Cabana failed to start on port ${PORT}. Your database and app data were not touched."
fi
rm -rf "${APP_DIR}.old" "${NODE_DIR}.old"

# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------
LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
if [ -z "$LAN_IP" ]; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
[ -n "$LAN_IP" ] || LAN_IP="this-host"
if [ "$PORT" = "80" ]; then
  ACCESS_URL="http://${LAN_IP}/"
else
  ACCESS_URL="http://${LAN_IP}:${PORT}/"
fi

cat <<DONE

  Cabana ${APP_VERSION} is installed and running.

  Open from your LAN:  ${ACCESS_URL}
  Local health check:  http://127.0.0.1:${PORT}/api/health

  The first visit lets you create the sole administrator account.
  There are no default credentials.

  State:  ${CABANA_STATE_DIR}
  Data:   ${CABANA_DATA_DIR}
  Service: systemctl status cabana
  Logs:    journalctl -u cabana -f

  Port override (if 80 is busy):
    curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash

  Re-running the same installer is safe: it updates code and keeps the
  administrator account, files, and app data intact.
DONE
