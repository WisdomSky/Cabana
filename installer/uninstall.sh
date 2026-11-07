#!/usr/bin/env bash
# Cabana uninstaller. Interactive by default; data and Docker are kept unless chosen.
# Recommended:
#   curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/uninstall.sh -o /tmp/cabana-uninstall.sh
#   sudo bash /tmp/cabana-uninstall.sh
# Non-interactive:
#   sudo bash uninstall.sh --yes [--remove-data] [--remove-docker]
set -Eeuo pipefail
IFS=$'\n\t'
umask 022

REPO="WisdomSky/Cabana"
SERVICE="cabana"
UNIT="/etc/systemd/system/cabana.service"
ENV_DIR="/etc/cabana"
OPT_DIR="/opt/cabana"
STATE_DIR="/var/lib/cabana"
DATA_DIR="/DATA"
REMOVE_DATA=0
REMOVE_DOCKER=0
ASSUME_YES=0
DATA_FLAG=0
DOCKER_FLAG=0

log() { printf 'Cabana uninstaller: %s\n' "$*"; }
warn() { printf 'Cabana uninstaller: warning: %s\n' "$*" >&2; }
die() {
  printf '\nCabana uninstaller stopped: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'HELP'
Cabana uninstaller
  sudo bash uninstall.sh                   Interactive; keep data and Docker by default
  sudo bash uninstall.sh --yes             Non-interactive; keep data and Docker
  sudo bash uninstall.sh --remove-data     Also remove Cabana state and /DATA/AppData
  sudo bash uninstall.sh --remove-docker   Also remove Docker Engine and ALL Docker data
HELP
}

for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --remove-data) REMOVE_DATA=1; DATA_FLAG=1 ;;
    --remove-docker) REMOVE_DOCKER=1; DOCKER_FLAG=1 ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown argument: $arg. Use --help for usage." ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "This uninstaller must run as root:
  curl -fsSL https://github.com/${REPO}/releases/latest/download/uninstall.sh -o /tmp/cabana-uninstall.sh
  sudo bash /tmp/cabana-uninstall.sh"

answer_yes() {
  local prompt="$1" answer=""
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 1
  fi
  if [ -r /dev/tty ] && printf '%s [y/N] ' "$prompt" > /dev/tty 2>/dev/null; then
    if ! IFS= read -r answer < /dev/tty 2>/dev/null; then
      answer=""
    fi
  else
    printf 'No interactive terminal is available; keeping the safe default (no).\n'
    return 1
  fi
  case "${answer,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -e "$UNIT" ] || [ -d "$OPT_DIR" ]; then
  log "Cabana is installed on this host."
else
  log "No Cabana installation was found in ${OPT_DIR} or ${UNIT}."
fi

if [ "$DATA_FLAG" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
  if answer_yes "Remove Cabana state (${STATE_DIR}) and Cabana app data (${DATA_DIR}/AppData)? Other files in ${DATA_DIR} are kept."; then
    REMOVE_DATA=1
  fi
fi
if [ "$DOCKER_FLAG" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
  if answer_yes "Remove Docker Engine and ALL Docker containers, images, volumes, and networks on this host? This affects every Docker workload, not just Cabana."; then
    REMOVE_DOCKER=1
    if [ -r /dev/tty ] && printf 'Type REMOVE to confirm Docker destruction: ' > /dev/tty 2>/dev/null; then
      IFS= read -r confirm < /dev/tty 2>/dev/null || confirm=""
    else
      printf 'No interactive terminal is available; not removing Docker.\n'
      confirm=""
    fi
    if [ "$confirm" != "REMOVE" ]; then
      warn "Docker removal was not confirmed; Docker will be kept."
      REMOVE_DOCKER=0
    fi
  fi
fi

if [ "$REMOVE_DATA" -eq 1 ] && [ ! -e "$STATE_DIR" ] && [ ! -e "$DATA_DIR/AppData" ]; then
  log "Cabana data was already absent."
fi
if [ "$REMOVE_DOCKER" -eq 1 ]; then
  log "Docker and all Docker data will be removed after Cabana is stopped."
fi

log "Stopping and disabling the Cabana service."
systemctl stop "$SERVICE" >/dev/null 2>&1 || true
systemctl disable "$SERVICE" >/dev/null 2>&1 || true
rm -f "$UNIT"
systemctl daemon-reload >/dev/null 2>&1 || true

if [ "$REMOVE_DATA" -eq 1 ] && command -v docker >/dev/null 2>&1; then
  log "Removing Cabana-managed containers."
  IDS="$(docker ps -aq --filter label=cabana.managed=true 2>/dev/null || true)"
  if [ -n "$IDS" ]; then
    # shellcheck disable=SC2086
    docker rm -f $IDS >/dev/null 2>&1 || warn "Some Cabana containers could not be removed."
  fi
fi

log "Removing Cabana application files and service configuration."
rm -rf "$OPT_DIR" "$ENV_DIR"

if [ "$REMOVE_DATA" -eq 1 ]; then
  log "Removing ${STATE_DIR} and ${DATA_DIR}/AppData (other ${DATA_DIR} content is kept)."
  rm -rf "$STATE_DIR"
  rm -rf "${DATA_DIR:?}/AppData"
else
  log "Keeping ${STATE_DIR} and ${DATA_DIR}."
fi

if [ "$REMOVE_DOCKER" -eq 1 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker is not installed; nothing to remove."
  else
    log "Removing all Docker containers, images, volumes, and networks."
    IDS="$(docker ps -aq 2>/dev/null || true)"
    if [ -n "$IDS" ]; then
      # shellcheck disable=SC2086
      docker rm -f $IDS >/dev/null 2>&1 || warn "Some containers could not be removed."
    fi
    VOLUMES="$(docker volume ls -q 2>/dev/null || true)"
    if [ -n "$VOLUMES" ]; then
      # shellcheck disable=SC2086
      docker volume rm -f $VOLUMES >/dev/null 2>&1 || true
    fi
    systemctl stop docker docker.socket containerd >/dev/null 2>&1 || true
    systemctl disable docker docker.socket containerd >/dev/null 2>&1 || true
    export DEBIAN_FRONTEND=noninteractive
    apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
      docker-compose-plugin docker-ce-rootless-extras docker.io docker-compose \
      containerd runc >/dev/null 2>&1 || warn "Some Docker packages were not installed or could not be purged."
    apt-get autoremove -y >/dev/null 2>&1 || true
    rm -rf /var/lib/docker /var/lib/containerd /etc/docker \
      /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.asc \
      /usr/local/lib/docker/cli-plugins/docker-compose
    log "Docker Engine and Docker data were removed."
  fi
fi

if command -v docker >/dev/null 2>&1; then
  DOCKER_STATUS="kept (run 'docker ps' to see existing workloads)"
else
  DOCKER_STATUS="not installed / removed"
fi
if [ "$REMOVE_DOCKER" -eq 1 ]; then
  hash -r 2>/dev/null || true
  if command -v docker >/dev/null 2>&1; then
    DOCKER_STATUS="still present at $(command -v docker); remove it manually if it was installed by another method"
  else
    DOCKER_STATUS="removed"
  fi
fi
if [ "$REMOVE_DATA" -eq 1 ]; then
  DATA_STATUS="${STATE_DIR} and ${DATA_DIR}/AppData removed"
else
  DATA_STATUS="${STATE_DIR} and ${DATA_DIR} kept"
fi

cat <<DONE

  Cabana has been uninstalled.

  Docker: ${DOCKER_STATUS}
  Data:   ${DATA_STATUS}

  The installer can be run again at any time:
    curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sudo bash

  To reinstall while keeping existing data, simply run the installer again.
DONE
