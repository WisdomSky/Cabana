# Cabana 1.0.0-rc.1

An independent, CasaOS-style personal cloud server for home Linux machines.

- One-command installer for Debian 12 and Ubuntu 24.04 on amd64 and arm64.
- First-run administrator setup with no default credentials.
- Dashboard with real host CPU, memory, disk, network and app state.
- Official CasaOS/ZimaOS v2 app store, searched and installed from the published index.
- Docker app lifecycle: install, start, stop, uninstall (data preserved unless explicitly deleted).
- Custom Compose import with explicit confirmation for privileged/host-network definitions.
- File manager confined to configured roots, with traversal and symlink-escape protection.
- Storage overview based on real host filesystem statistics.
- Settings for the administrator password, app defaults, file roots and store refresh.

## Install

On a supported host:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Override the port when 80 is busy:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
```

Supported: Debian 12 (bookworm) and Ubuntu 24.04 LTS (noble), amd64 and arm64.
The installer must run as root. It installs Docker Engine and the Compose plugin and a
supported Node.js LTS only when compatible versions are not already present. It never
partitions, formats, or mounts disks.

State lives in `/var/lib/cabana`; app data lives in `/DATA`. The installer is safely
rerunnable and preserves the administrator account, files, and app data.

See `README.md` and `VERIFICATION.md` in the repository for evidence and limitations.
