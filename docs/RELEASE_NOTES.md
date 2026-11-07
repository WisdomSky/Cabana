# Cabana v1.0.0

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

## Verified

See the repository `VERIFICATION.md` for exact commands, versions, timestamps, and outcomes,
and `docs/screenshots` for desktop and narrow-viewport evidence.

- Backend: 36 tests including real-Docker lifecycle and volume-failure coverage.
- E2E: 6 Playwright scenarios against a real Debian 12 arm64 Docker host, including data
  preservation, explicit data deletion, custom Compose, and privileged confirmation.
- Clean-VM installer checks on Debian 12 and Ubuntu 24.04, amd64 and arm64; full suite,
  reboot persistence, and idempotent reinstall on Debian 12 arm64. Final Ubuntu runs:
  https://github.com/WisdomSky/Cabana/actions/runs/42361353350
- Sampled store installs: Uptime Kuma 2.4.0, Gitea 1.26.2, Immich 2.7.2 (multi-service).

## Limitations

TLS, remote access, multi-user accounts, disk/SMB management, backups, app upgrades,
third-party stores, and Cabana uninstall/upgrade tooling are out of scope for v1.
Custom Compose images are not vetted by Cabana.

Cabana is not affiliated with CasaOS or ZimaOS; app catalog content comes from the official
CasaOS/ZimaOS app store.
