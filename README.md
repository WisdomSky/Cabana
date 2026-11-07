# Cabana

An independent, CasaOS-style personal cloud server for home Linux machines. Cabana gives
you a dashboard for the host, a catalog of self-hosted apps sourced from the official
CasaOS/ZimaOS app store, a small Docker app manager, a confined file browser, and honest
storage reporting. It is built from scratch and is not affiliated with CasaOS or ZimaOS.

> Work in progress. The final evidence, screenshots, and limitations are recorded in
> `VERIFICATION.md` before the v1.0.0 release.

## Install

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Port 80 is the default. If it is busy:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
```

Supported systems: Debian 12 and Ubuntu 24.04 on amd64 or arm64, with systemd.
The installer refuses other systems, installs Docker Engine + Compose and a supported
Node.js LTS when missing, reuses compatible existing installs, verifies published release
artifacts, installs Cabana as an enabled systemd service, and prints the LAN URL. It does
not partition, format, or mount disks.

- State: `/var/lib/cabana`
- App data: `/DATA`
- Service: `systemctl status cabana`
- Logs: `journalctl -u cabana -f`

Open the printed LAN URL to create the sole administrator account. There are no default
credentials. Re-running the installer is safe and preserves the account, files, and app data.

## Development

Requirements: Node.js 24+ and Docker (for the Docker-backed parts).

```bash
npm run setup
npm --prefix server test
npm --prefix web run build
npm --prefix server run build
```

Run the backend locally against a development data directory:

```bash
CABANA_STATE_DIR=/tmp/cabana-state \
CABANA_DATA_DIR=/tmp/cabana-data \
CABANA_WEB_DIR="$PWD/web/dist" \
CABANA_PORT=8080 \
node server/src/start.js
```

For local development where Docker runs in a Linux VM (OrbStack or Docker Desktop), set
`CABANA_DATA_DIR` to a host path shared with Docker so bind mounts resolve.

Build release artifacts:

```bash
bash scripts/build-release.sh
```

## Architecture

- Backend: Node.js 24+ / Express 4 / built-in `node:sqlite` (SQLite)
- Frontend: Vue 3 / Vue Router / Tailwind CSS 4 / Vite
- Apps: Docker Compose projects managed with the Docker CLI (never exposed to the browser)
- App catalog: https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@gh-pages/index.json

## Security model

- The installer is root-only and performs no disk partitioning, formatting, or mounting.
- The sole administrator is created on first run; setup is permanently closed afterwards.
- Passwords are hashed with scrypt and a random salt.
- Sessions use random HttpOnly, SameSite=Lax cookies; only a SHA-256 hash of each token is stored.
- Every authenticated state-changing API call requires a per-session CSRF token and a same-origin check.
- The file manager confines all operations to configured roots and checks symlinks against escape.
- Docker access stays server-side. Custom Compose definitions requesting privileged or host
  networking require explicit confirmation.
- TLS, remote access, multi-user access, backups, app upgrades, and disk/SMB management are out of scope for v1.

## Credits

App definitions, icons, screenshots, and catalog metadata come from the
[official CasaOS/ZimaOS App Store](https://github.com/IceWhaleTech/CasaOS-AppStore).
Cabana is not affiliated with or endorsed by CasaOS or ZimaOS. See `NOTICE`.

## License

MIT
