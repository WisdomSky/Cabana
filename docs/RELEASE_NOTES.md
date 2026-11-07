# Cabana v1.1.0

Cabana is an independent, CasaOS-style personal cloud server for Debian 12 and Ubuntu 24.04
on amd64 and arm64.

## Install

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

If port 80 is busy:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
```

## New in v1.1.0

- **shadcn-vue UI** using Reka UI primitives, shared design tokens, dialogs, buttons,
  inputs, badges, progress indicators, and a glass desktop visual language.
- **CasaOS-inspired dashboard**: clock, CPU/RAM rings, storage health, network history,
  searchable app tiles, and system status.
- **Safe uninstaller** with prompts that default to keeping Cabana data and Docker. It can
  optionally remove `/var/lib/cabana`, `/DATA/AppData`, and Docker Engine with all Docker
  containers, images, volumes, and networks.
- **`npm run docker`** local test mode that builds Cabana into a container and runs it
  non-invasively on the host Docker socket, with state in `.cabana-docker/`.

## Highlights

- Real host dashboard: CPU, memory, disk, network, Docker, and app status.
- Official CasaOS/ZimaOS v2 store: search, categories, architecture filtering, caching,
  base-URL-relative compose/meta/assets, per-architecture compose variants.
- One-click store install/start/stop/uninstall with Docker reconciliation and data
  preservation unless explicitly deleted.
- CasaOS compose contract: `x-casaos`, `$AppID`, `$PUID`, `$PGID`, `$TZ`, `/DATA` paths.
- Custom Compose import with analysis and explicit confirmation for privileged or
  host-network definitions.
- Confined file manager with upload/download/mkdir/rename/delete and traversal/symlink
  protection.
- Storage overview without mounting; administrator password and store refresh settings.
- Sole administrator first-run setup with scrypt hashing, HttpOnly sessions, and CSRF
  protection.

## Uninstall

Download the uninstaller rather than piping it, so prompts can read your terminal:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/uninstall.sh -o /tmp/cabana-uninstall.sh
sudo bash /tmp/cabana-uninstall.sh
```

Data and Docker are kept by default. Non-interactive flags:
`--yes`, `--remove-data`, `--remove-docker`.

## Verified

See [VERIFICATION.md](https://github.com/WisdomSky/Cabana/blob/main/VERIFICATION.md) for exact
commands, versions, timestamps, and outcomes, and
[docs/screenshots](https://github.com/WisdomSky/Cabana/tree/main/docs/screenshots) for desktop
and narrow-viewport evidence.

- Backend: 36 tests including real-Docker lifecycle and volume-failure coverage.
- E2E: 6 Playwright scenarios against a real Debian 12 arm64 Docker host with the new
  shadcn-vue UI, including data preservation, explicit data deletion, custom Compose, and
  privileged confirmation.
- Clean-VM installer checks on Debian 12 and Ubuntu 24.04, amd64 and arm64; full suite,
  reboot persistence, and idempotent reinstall on Debian 12 arm64. Final Ubuntu run:
  https://github.com/WisdomSky/Cabana/actions/runs/42367982882
- Sampled store installs: Uptime Kuma 2.4.0, Gitea 1.26.2, Immich 2.7.2 (multi-service).
- Uninstaller defaults and Docker-removal path verified on disposable VMs.
- `npm run docker` verified with a first-run setup and Uptime Kuma install.

## Limitations

TLS, remote access, multi-user accounts, disk/SMB management, backups, app upgrades,
third-party stores, and Cabana uninstall/upgrade tooling are out of scope for v1.
Custom Compose images are not vetted by Cabana. The Docker test container has root-equivalent
Docker socket access and is intended for local development only.

Cabana is not affiliated with CasaOS or ZimaOS; app catalog content comes from the official
CasaOS/ZimaOS app store.
