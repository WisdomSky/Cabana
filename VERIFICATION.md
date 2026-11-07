# Cabana verification

This document records the exact environments, commands, versions, timestamps, and outcomes
used for Cabana v1.0.0. Anything not run is explicitly marked as not run; a partial run is
never reported as passed.

## Status summary

| Area | Status | Evidence |
| --- | --- | --- |
| Backend unit/integration tests | Pass | 36 tests; 34 pass + 2 real-Docker tests pass separately |
| Playwright E2E (all required flows) | Pass | 6/6 on clean Debian 12 arm64 QEMU VM |
| Debian 12 arm64 clean VM: installer + full suite + reboot + second install | Pass (v1.0.0-rc.1); final v1.0.0 rerun recorded below | QEMU 16G VM, own kernel |
| Debian 12 amd64 clean VM: installer + setup/login + store app | Pass (v1.0.0-rc.1); final v1.0.0 rerun recorded below | QEMU 14G VM |
| Ubuntu 24.04 amd64 clean VM: installer + setup/login + store app | Pass (v1.0.0-rc.1 via GitHub-hosted VM); final v1.0.0 run linked below | GitHub Actions run 42358916552 |
| Ubuntu 24.04 arm64 clean VM: installer + setup/login + store app | Pass (v1.0.0-rc.1 via GitHub-hosted VM); final v1.0.0 run linked below | GitHub Actions run 42358916552 |
| Sampled store installs | Pass | Uptime Kuma, Gitea, Immich; URLs and health below |
| Installer port conflict + override | Pass | Busy port refusal and 8080 override on Debian 12 amd64 |
| Unsupported OS and non-root refusal | Pass | Fedora 42 container and Debian sudo test |
| Tagged public release with artifacts | v1.0.0-rc.1 published; final v1.0.0 assets recorded below | GitHub releases |

## Versions

| Component | Version / detail |
| --- | --- |
| Cabana | 1.0.0 (release candidate used during iteration: 1.0.0-rc.1) |
| Local test host | macOS 27.0 (Apple M3 Pro, arm64), Node.js v26.10.0, npm 11.19.1 |
| Local Docker | Docker 29.8.2, Compose v5.5.0 (OrbStack Linux engine) |
| True-VM hypervisor | QEMU 11.1.3 with HVF (arm64) and TCG (amd64) |
| Debian 12 arm64 VM kernel | `6.1.0-54-cloud-arm64 #1 SMP Debian 6.1.190-1` |
| Debian 12 arm64 VM resources | 4 vCPU, 4 GB RAM, 16 GB disk |
| Debian 12 amd64 VM resources | 3 vCPU, 3 GB RAM, 14 GB disk |
| Ubuntu 24.04 runner image | Ubuntu 24.04.5 LTS, GitHub-hosted `ubuntu-24.04` and `ubuntu-24.04-arm` |
| Installer Node | v26.13.0 (official nodejs.org tarball, SHA-256 verified) |
| Installer Docker (Debian) | Docker Engine 29.9.3 from download.docker.com (Compose plugin bundled) |
| Store source | `https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@gh-pages/index.json`, schema v2, 182 apps at verification time |

## 1. Automated tests

### 1.1 Backend suite

Command, run 2026-11-07T09:21:41Z on the local macOS host with Node.js v26.10.0:

```bash
cd /Users/macbook/Code/cabana/server
npm test
```

Outcome:

```text
ℹ tests 36
ℹ pass 34
ℹ fail 0
ℹ skipped 2
```

The two skipped tests are the real-Docker integration tests when
`CABANA_REAL_DOCKER` is not set. Both were run separately against Docker 29.8.2:

```bash
CABANA_REAL_DOCKER=1 node --test test/docker.integration.test.js
```

Outcome, 2026-11-07T09:21Z:

```text
✔ real Docker volume failures are surfaced with the underlying error
✔ real Docker lifecycle: custom Compose install, HTTP, stop/start, uninstall preserving data
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

Coverage points:

- First-run setup creates exactly one administrator; a second setup attempt returns 409;
  setup status closes; no default credentials.
- scrypt password hashes, random salts, session tokens stored as SHA-256 hashes, HttpOnly
  and SameSite cookie attributes, logout, login rate limiting, CSRF failure/success,
  same-origin rejection, password change and session invalidation.
- Official-store index caching, base-URL-relative URL resolution, schema validation,
  search/category/architecture filters, per-architecture compose variant preference and
  404 fallback, meta and asset caching, stale-cache fallback, SSRF rejection.
- Compose translation: `x-casaos`, `$AppID`/`$PUID`/`$PGID`/`$TZ` (plain, braced, defaults),
  `/DATA` path remapping, labels, project/container names, port parsing, warnings for
  privileged/host-network/Docker-socket/sensitive mounts, validation of `build`,
  `include`, and `extends`.
- App lifecycle with a fake Docker: install, state reconciliation (running/stopped/missing),
  port and container-name conflicts, install failure with no record, custom Compose,
  explicit privileged confirmation, uninstall preserving data, explicit data deletion,
  named-volume deletion path, shared data-path protection.
- Real Docker: custom Compose install and HTTP response, stop/start, uninstall preserving
  data, and a named-volume driver failure surfaced with Docker's underlying error.
- File manager: browse, upload, download, mkdir, rename, delete (non-empty confirmation),
  path traversal, absolute paths, symlink escapes, inside-root symlinks, API auth/CSRF.
- Settings and system APIs: PUID/PGID/timezone validation, password-protected file-root
  changes, dashboard host metrics, storage/filesystem data without mounting, store routes,
  store refresh, and stale store fallback.

CI: `.github/workflows/ci.yml` runs the server tests on Node 24 and Node 26 and runs the
real-Docker lifecycle/volume tests on Ubuntu 24.04. Run
[42356992615](https://github.com/WisdomSky/Cabana/actions/runs/42356992615) passed on
2026-11-07T08:47Z. The Docker job passed its real-Docker tests.

### 1.2 Playwright E2E

Command against a disposable local server:

```bash
cd /Users/macbook/Code/cabana/e2e
npm install
npx playwright install chromium
npx playwright test
```

Outcome, 2026-11-07T16:42 local (08:42Z): 6/6 passed in 29.5s.

Command against the clean Debian 12 arm64 QEMU VM (the server started from the public
installer, not from the repository):

```bash
CABANA_E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test
```

Outcome, 2026-11-07T08:59Z: 6/6 passed in 54.5s.

Scenarios:

1. `01-setup`: first-run page, administrator creation, automatic login, dashboard metrics,
   logout, failed login, successful login, and setup permanently disabled.
2. `02-dashboard-storage`: asserts non-zero CPU/memory/disk values and Docker availability
   from `/api/dashboard`; storage filesystems, file root, app-data summary, and
   `mountedByCabana: []` from `/api/storage`.
3. `03-store`: store search, Networking category (all visible cards checked), architecture
   filtering with API-verified counts on arm64, app detail, and Uptime Kuma install.
4. `04-apps-files`: Uptime Kuma running + HTTP, stop/start, data seeding through the file
   manager, uninstall with data preserved and file verified, reinstall, uninstall with
   explicit data deletion and folder absence, custom Compose `traefik/whoami` install with
   HTTP check, data markers, and privileged Compose confirmation gate (install disabled
   until the risk checkbox is ticked).
5. `05-files-settings`: create/upload/download/rename/delete with recursive confirmation,
   PUID/PGID/timezone save, store refresh, password change, logout, login with the new
   password, change back.
6. `06-persistence` (`@persistence`): administrator login, health, `echo-test` app running,
   app HTTP, `/DATA/persistence/hello.txt`, and
   `/DATA/AppData/echo-test/data/hello.txt` after reboot and again after an idempotent
   installer rerun.

Desktop screenshots use 1440×900; narrow screenshots use 390×844. Files are in
`e2e/screenshots` and selected evidence is copied to `docs/screenshots`.

## 2. Clean-VM installer runs

### 2.1 Debian 12 arm64 — primary target

Hypervisor: QEMU 11.1.3, `-machine virt,accel=hvf -cpu host`, 4 vCPU / 4 GB / 16 GB,
Debian 12 genericcloud arm64 image, cloud-init user `cabana` with passwordless sudo.
This is a true VM with its own kernel (`6.1.0-54-cloud-arm64`) and reboot cycle.

Exact public command:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Outcome, 2026-11-07T08:57Z (rc.1): exit 0, Docker installed from Docker's repository,
Node v26.13.0 installed, bundle verified, service enabled and active on port 80.

```text
Cabana: Detected Debian GNU/Linux 12 (bookworm) (arm64).
Cabana: Installing Docker Engine from Docker's official repository.
Cabana: Docker Engine is ready.
Cabana: Installing Node.js 26.x LTS from nodejs.org.
Cabana: Installed Node.js v26.13.0.
Cabana: Downloading the published Cabana application bundle.
Cabana: Bundle 1.0.0-rc.1 verified.
Cabana: Installing application files and the systemd unit.
  Open from your LAN:  http://10.0.2.15/
```

The printed address is the QEMU user-mode guest address; the host reached the service
through `hostfwd tcp:127.0.0.1:8080-:80`.

Full E2E: 6/6 passed at 08:59Z.

Reboot test:

```bash
cat /proc/sys/kernel/random/boot_id   # before: d5ab2d0b-a31d-4833-a65d-e0478c55b3c7
sudo systemctl reboot
# after reboot
cat /proc/sys/kernel/random/boot_id   # after:  452b8265-ee9c-4111-8924-9806d9e5ee9a
uptime -p                             # up 0 minutes
systemctl is-active cabana docker     # active / active
```

Persistence after reboot (2026-11-07T09:00Z): `06-persistence` passed; app container
`cabana_echo-test-echo` running; both marker files readable.

Idempotent second install, 2026-11-07T09:00:47Z:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Outcome: exit 0, installer recognized its own service on port 80, reused Docker and Node,
reinstalled code, and preserved state. Before/after SHA-256:

```text
1111fa86415faf654e86ed39c967f9bbe6939acdaf1865f792ad44919c49a8d5  /DATA/persistence/hello.txt
1111fa86415faf654e86ed39c967f9bbe6939acdaf1865f792ad44919c49a8d5  /DATA/AppData/echo-test/data/hello.txt
```

Admin login (same password) and `@persistence` passed after the rerun; `needsSetup: false`.

A supplemental OrbStack Debian 12 arm64 isolated Linux machine was also tested earlier
(2026-11-07T08:52Z) with the same one-liner and full suite (6/6 at 08:53Z), then reboot and
rerun. The QEMU VM above is the primary true-VM evidence.

### 2.2 Debian 12 amd64 — secondary target

QEMU 11.1.3 TCG, 3 vCPU / 3 GB / 14 GB, Debian 12 genericcloud amd64, own kernel.
Exact public command at 2026-11-07T09:05Z (rc.1): exit 0; Docker 29.9.3 installed; Node
v26.13.0 installed; bundle verified; service active.

Focused Playwright smoke (`@smoke`) against `http://127.0.0.1:8081` at 2026-11-07T09:09:39Z:
setup, dashboard, logout, login, store install of Uptime Kuma 2.4.0, app status running,
and app URL through the forwarded port returning 302. Result: 1/1 passed.

Port conflict test at 09:18Z: with `python3 -m http.server 80` holding port 80:

```text
Cabana installer stopped: Port 80 is already in use by python3 (pid 3679).
Cabana's default port is 80. Free the port, or install Cabana on another port:
  curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
No changes have been made.
```

Exit 1. No service restart or file swap occurred.

Override test at 09:19Z:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
```

Service healthy on 8080, `needsSetup:false`, admin login and running Uptime Kuma state
preserved. Reverted to port 80 with the same command plus `CABANA_PORT=80`; health on 80
and admin/app state preserved.

### 2.3 Ubuntu 24.04 amd64 and arm64 — secondary targets

GitHub-hosted clean VMs: `ubuntu-24.04` (amd64) and `ubuntu-24.04-arm` (arm64), both with
Ubuntu 24.04.5 LTS. Workflow: `.github/workflows/ubuntu-vm.yml`, dispatch run
[42358916552](https://github.com/WisdomSky/Cabana/actions/runs/42358916552), 2026-11-07T09:15Z.
Both jobs passed in ~1m21s (amd64) and ~1m11s (arm64).

The workflow runs the exact one-liner, then a Playwright smoke: first-run administrator,
dashboard, logout/login, store install of Uptime Kuma 2.4.0, app status running, app URL
check, and desktop/narrow screenshots. Artifacts were uploaded as
`ubuntu-24.04-amd64-evidence` and `ubuntu-24.04-arm64-evidence`.

Installer logs from the artifacts:

```text
Cabana: Detected Ubuntu 24.04.5 LTS (amd64).
Cabana: Reusing the existing Docker Engine and Compose plugin.
Cabana: Installing Node.js 26.x LTS from nodejs.org.
Cabana: Installed Node.js v26.13.0.
Cabana: Bundle 1.0.0-rc.1 verified.
```

```text
Cabana: Detected Ubuntu 24.04.5 LTS (arm64).
Cabana: Reusing the existing Docker Engine and Compose plugin.
Cabana: Installing Node.js 26.x LTS from nodejs.org.
Cabana: Installed Node.js v26.13.0.
Cabana: Bundle 1.0.0-rc.1 verified.
```

This demonstrates reuse of the runner's existing Docker Engine (28.0.4) without replacing
it, and installation of Node LTS only because a compatible Node.js was absent.

## 3. Installer safety checks

- **Root-only**: running the installer as the non-root `cabana` user on Debian 12 amd64
  produced the explicit root-only message and exit 1; nothing was installed or changed.
- **Unsupported OS**: running the installer inside a `fedora:42` container produced:
  `Unsupported operating system: Fedora Linux 42 (Container Image). Supported systems are
  Debian 12 (bookworm) and Ubuntu 24.04 LTS (noble) on amd64 or arm64. No changes have been
  made.` Exit 1.
- **Busy port**: verified above with the listening process named; installer did not stop or
  replace anything.
- **Own port on rerun**: verified above; installer identified its own service and proceeded
  with a safe rerun.
- **Rerun data safety**: verified above with unchanged marker hashes and working admin login.
- **No disk operations**: the installer contains no partitioning/formatting/mount commands;
  storage overview only reads filesystem statistics.

## 4. Sampled official-store installs

All installs used the official CasaOS/ZimaOS v2 index. The Debian 12 arm64 Cabana instance
was used (Docker 29.9.3). Timestamps 2026-11-07T09:15–09:17Z.

| App | Version | Containers / health | URL check | Data |
| --- | --- | --- | --- | --- |
| Uptime Kuma `org.icewhale.uptimekuma` | 2.4.0 | `uptimekuma` healthy | port 3001, HTTP 302 | `/DATA/AppData/uptimekuma/app/data` |
| Gitea `org.icewhale.gitea` | 1.26.2 | `gitea` running, restarts 0, no image healthcheck | port 3002, HTTP 200 | `/DATA/AppData/gitea/data` populated |
| Immich `org.icewhale.immich` | 2.7.2 | `immich-server`, `immich-postgres`, `immich-redis`, `immich-machine-learning` all healthy | port 2283, HTTP 200 | `/DATA/AppData/immich` and `/DATA/Gallery/immich` populated |

Exact verification command and outcome:

```bash
# inside the Debian 12 arm64 VM
curl -s -o /dev/null -w "gitea_http=%{http_code}\n" http://127.0.0.1:3002/
curl -s -o /dev/null -w "immich_http=%{http_code}\n" http://127.0.0.1:2283/
docker ps --format '{{.Names}} {{.Status}}'
```

```text
gitea_http=200
immich_http=200
immich-server Up (healthy)
immich-postgres Up (healthy)
immich-redis Up (healthy)
immich-machine-learning Up (healthy)
```

Uptime Kuma was also installed and verified by the E2E suites on Debian 12 arm64, Debian 12
amd64, and Ubuntu 24.04 amd64/arm64.

## 5. Release artifacts

Early iteration release `v1.0.0-rc.1` was published from tag
`v1.0.0-rc.1` on 2026-11-07T08:51Z with:

- `install.sh` (17,536 bytes)
- `cabana-app.tar.gz` (493,645 bytes)
- `cabana-app.tar.gz.sha256`

The installer verifies the bundle checksum before installing and refuses an unverified
bundle. The release workflow builds and publishes from the tagged commit; the Ubuntu
acceptance workflow is dispatched after publishing so that `latest` points at the intended
release.

Final v1.0.0 release verification is appended below after the release is published.

## 6. Final v1.0.0 verification

_To be completed after the final v1.0.0 release runs. Do not treat this section as passed
until it contains command output and timestamps._

## 7. Known limitations / not in v1

Integrity note: checks were run only for the environments above. No validation was performed
for other distributions, other CPU architectures, TLS/reverse-proxy deployments, disk
mounting/SMB, multi-user access, backups, app upgrades, or third-party app stores, because
those are out of scope for v1.

- TLS termination, remote access, and authentication proxies are not implemented.
- Single administrator only.
- No disk mounting/partitioning/formatting or SMB.
- No backup/restore or app upgrade tooling.
- No Cabana uninstall/upgrade tooling beyond safe installer reruns.
- No third-party app store management.
- Custom Compose images are not vetted; the administrator is responsible for them.
- App URLs are direct host ports; host firewalls must allow them.
- The QEMU VMs use user-mode networking; the installer's printed LAN address was the guest
  NAT address (`10.0.2.15`), and host access used forwarded ports. Real LAN addresses were
  observed in the OrbStack VM (`192.168.139.75`) and GitHub runners.
