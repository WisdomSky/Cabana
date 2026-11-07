# Cabana verification

This document records the exact environments, commands, versions, timestamps, and outcomes
used for Cabana v1.1.0. v1.1.0 adds the shadcn-vue interface, the CasaOS-inspired dashboard,
the interactive uninstaller, and `npm run docker`; the v1.0.1 security dependency updates are
included. Anything not run is explicitly marked as not run; a partial run is never reported
as passed.

## Status summary

| Area | Status | Evidence |
| --- | --- | --- |
| Backend unit/integration tests | **Pass** | 36 tests; 34 pass + 2 real-Docker tests pass separately |
| Playwright E2E (all required flows, shadcn-vue UI) | **Pass** | 6/6 on a fresh Debian 12 arm64 QEMU VM, v1.1.0 |
| Debian 12 arm64 clean VM: installer + full suite + reboot + second install | **Pass** | QEMU 16G VM, own kernel, final v1.1.0 |
| Debian 12 amd64 clean VM: installer + setup/login + store app | **Pass** | QEMU 14G VM, final v1.1.0 |
| Ubuntu 24.04 amd64 clean VM: installer + setup/login + store app | **Pass** | GitHub-hosted VM run 42367982882, final v1.1.0 |
| Ubuntu 24.04 arm64 clean VM: installer + setup/login + store app | **Pass** | GitHub-hosted VM run 42367982882, final v1.1.0 |
| Sampled store installs | **Pass** | Uptime Kuma, Gitea, multi-service Immich; URLs and health below |
| Installer port conflict + override | **Pass** | Busy-port refusal and 8080 override on Debian 12 amd64 |
| Unsupported OS and non-root refusal | **Pass** | Fedora 42 container and Debian non-root run |
| Uninstaller defaults and Docker-removal path | **Pass** | Interactive defaults and release-asset test on disposable VMs |
| `npm run docker` local container mode | **Pass** | First-run, Uptime Kuma install, health, host-side data |
| Tagged public release with artifacts | **Pass** | v1.1.0 release and checksum below |

No required check was skipped. No required target or test failed at completion.

## Versions

| Component | Version / detail |
| --- | --- |
| Cabana | 1.1.0 |
| Local test host | macOS 27.0 (Apple M3 Pro, arm64), Node.js v26.10.0, npm 11.19.1 |
| Local Docker | Docker 29.8.2, Compose v5.5.0 (OrbStack Linux engine) |
| True-VM hypervisor | QEMU 11.1.3 with HVF (arm64) and TCG (amd64) |
| Debian 12 arm64 VM kernel | `6.1.0-54-cloud-arm64 #1 SMP Debian 6.1.190-1` |
| Debian 12 amd64 VM kernel | Debian 12 genericcloud amd64, own kernel |
| Debian 12 arm64 VM resources | 4 vCPU, 4 GB RAM, 16 GB disk |
| Debian 12 amd64 VM resources | 3 vCPU, 3 GB RAM, 14 GB disk |
| Ubuntu 24.04 runner image | Ubuntu 24.04.5 LTS, GitHub-hosted `ubuntu-24.04` and `ubuntu-24.04-arm` |
| Installer Node | v26.13.0 (official nodejs.org tarball, SHA-256 verified) |
| Installer Docker (Debian) | Docker Engine 29.9.3 from download.docker.com (Compose plugin bundled) |
| Store source | `https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@gh-pages/index.json`, schema v2, 182 apps at verification time |

## 1. Automated tests

### 1.1 Backend suite

Command, final dependency set, run 2026-11-07T10:15Z on the local macOS host with Node.js v26.10.0:

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

Outcome, 2026-11-07T10:15Z:

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
real-Docker lifecycle/volume tests on Ubuntu 24.04. Final CI run
[42367296723](https://github.com/WisdomSky/Cabana/actions/runs/42367296723) passed on
2026-11-07T11:13Z.

### 1.2 Playwright E2E

Command against a disposable local server:

```bash
cd /Users/macbook/Code/cabana/e2e
npm install
npx playwright install chromium
npx playwright test
```

Outcome, 2026-11-07T08:42Z: 6/6 passed in 29.5s.

Final v1.1.0 command against the fresh Debian 12 arm64 QEMU VM (server started from the
public installer, not from the repository):

```bash
CABANA_E2E_BASE_URL=http://127.0.0.1:8080 npx playwright test
```

Outcome, 2026-11-07T11:18:48–11:19:41Z: 6/6 passed in 53.3s with the shadcn-vue UI. Log:
`/tmp/v110-e2e-arm.log`.

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

Desktop screenshots use 1440×900; narrow screenshots use 390×844. Selected final
screenshots are committed in `docs/screenshots`:
`dashboard-desktop.png`, `dashboard-mobile.png`, `setup-desktop.png`, `login-desktop.png`,
`apps-desktop.png`, `store-mobile.png`, `store-detail-desktop.png`, `files-mobile.png`,
`storage-desktop.png`, `settings-desktop.png`, and
`custom-privileged-confirmation-desktop.png`.

### 1.3 Backend suite inside the final Debian 12 arm64 VM

To make “full suite on one target” literal, the server tests were also copied to the final
VM (test tooling only; the production Cabana installation still came from the public
release) and run with the VM's installed Node v26.13.0:

```bash
export PATH=/opt/cabana/node/bin:$PATH
cd /tmp/cabana-src/server
npm ci
npm test
sudo env PATH=/opt/cabana/node/bin:/usr/bin:/bin CABANA_REAL_DOCKER=1 \
  node --test test/docker.integration.test.js
```

Outcome, 2026-11-07T11:21Z:

```text
ℹ tests 36
ℹ pass 34
ℹ fail 0
ℹ skipped 2
```

```text
✔ real Docker volume failures are surfaced with the underlying error
✔ real Docker lifecycle: custom Compose install, HTTP, stop/start, uninstall preserving data
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

The first run skipped the real-Docker tests because the unprivileged test user could not
open the Docker socket; they were then run as root, matching the production Cabana service,
and both passed against the VM's Docker 29.9.3. Logs:
`/tmp/v110-vm-backend-tests.txt`.

## 2. Clean-VM installer runs

### 2.1 Debian 12 arm64 — primary target (final v1.1.0)

Hypervisor: QEMU 11.1.3, `-machine virt,accel=hvf -cpu host`, 4 vCPU / 4 GB / 16 GB,
Debian 12 genericcloud arm64 image, cloud-init user `cabana` with passwordless sudo.
This is a true VM with its own kernel (`6.1.0-54-cloud-arm64`) and reboot cycle. The final
overlay was created fresh from the untouched cloud base image for this run.

Exact public command at 2026-11-07T11:15:37Z:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Outcome: exit 0; Docker installed from Docker's repository; Node v26.13.0 installed; bundle
verified; service enabled and active on port 80.

```text
Cabana: Bundle 1.1.0 verified.
Cabana: Installing application files and the systemd unit.
Created symlink /etc/systemd/system/multi-user.target.wants/cabana.service → /etc/systemd/system/cabana.service.
  Open from your LAN:  http://10.0.2.15/
```

Health at 2026-11-07T11:17:01Z:
`{"status":"ok","version":"1.1.0","needsSetup":true,"arch":"arm64","docker":{"available":true,"version":"29.9.3"}}`.

The printed address is the QEMU user-mode guest address; the host reached the service
through `hostfwd tcp:127.0.0.1:8080-:80`. On real hardware the installer prints the LAN
address (observed `192.168.139.75` in a supplemental isolated-machine run).

Full E2E: 6/6 passed at 11:19:41Z.

Reboot test at 11:20:08Z:

```text
BOOT_ID_BEFORE=5b54d065-0b15-439d-ae08-8681fef51f68
BOOT_ID_AFTER=b6ab546d-457b-4862-9dc3-54b3584288af
uptime after reboot: up 0 minutes
systemctl is-active cabana docker: active / active
cabana_echo-test-echo: Up
```

`06-persistence` passed after reboot at 11:20:24Z.

Idempotent second install, 2026-11-07T11:20:41Z:

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash
```

Outcome: exit 0; installer recognized its own service on port 80, reused Docker and Node,
verified bundle 1.1.0, reinstalled code, and preserved state.

```text
Cabana: Port 80 is already served by the installed Cabana service; continuing with a safe rerun.
Cabana: Reusing the existing Docker Engine and Compose plugin.
Cabana: Reusing Cabana's existing Node.js v26.13.0.
Cabana: Bundle 1.1.0 verified.
```

Before/after SHA-256, unchanged:

```text
1111fa86415faf654e86ed39c967f9bbe6939acdaf1865f792ad44919c49a8d5  /DATA/persistence/hello.txt
1111fa86415faf654e86ed39c967f9bbe6939acdaf1865f792ad44919c49a8d5  /DATA/AppData/echo-test/data/hello.txt
```

Admin login (same password) and `@persistence` passed again after the rerun at 11:20:42Z;
health reported `needsSetup:false`. The same full suite, reboot, and rerun checks also passed
on v1.0.0-rc.1, v1.0.0, and v1.0.1.

### 2.2 Debian 12 amd64 — secondary target (final v1.1.0)

Fresh QEMU 11.1.3 TCG overlay from the untouched Debian 12 genericcloud amd64 base,
3 vCPU / 3 GB / 14 GB, own kernel. Exact public command at 2026-11-07T11:17:02Z: exit 0;
Docker 29.9.3 installed; Node v26.13.0 installed; bundle 1.1.0 verified; service active.
Health at 11:18:41Z: `version":"1.1.0","needsSetup":true,"arch":"amd64"`.

Focused Playwright smoke (`@smoke`) at 2026-11-07T11:21–11:23Z against
`http://127.0.0.1:8081`: first-run setup, dashboard, logout, login, store install of Uptime
Kuma 2.4.0, app status running, app URL through the forwarded port returning 302. Result:
1/1 passed (2.1m, emulated). Log: `/tmp/v110-smoke-amd64.log`.

Port conflict test (installer code unchanged in v1.1.0) at 2026-11-07T10:29Z with
`python3 -m http.server 80` holding port 80:

```text
Cabana installer stopped: Port 80 is already in use by python3 (pid 3679).
Cabana's default port is 80. Free the port, or install Cabana on another port:
  curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
No changes have been made.
```

Exit 1. No service restart or file swap occurred. The service was then restarted with the installer and health/login/app state was intact.

Override test at 09:19Z (rc.1), 09:57Z (v1.0.0), and 10:28Z (v1.0.1; installer unchanged in v1.1.0):

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo CABANA_PORT=8080 bash
```

Service healthy on 8080, `needsSetup:false`, admin login and running Uptime Kuma state
preserved. Reverted to port 80 with the same command plus `CABANA_PORT=80`; health on 80
and admin/app state preserved.

### 2.3 Ubuntu 24.04 amd64 and arm64 — secondary targets (final v1.1.0)

GitHub-hosted clean VMs: `ubuntu-24.04` (amd64) and `ubuntu-24.04-arm` (arm64), both
Ubuntu 24.04.5 LTS. Workflow: `.github/workflows/ubuntu-vm.yml`, final dispatch run
[42367982882](https://github.com/WisdomSky/Cabana/actions/runs/42367982882), 2026-11-07T11:23:28Z.
Both jobs passed: amd64 in 1m25s, arm64 in 1m25s.

The workflow starts with `test ! -e /var/lib/cabana`, then runs the exact public one-liner,
then a Playwright smoke: first-run administrator, dashboard, logout/login, store install of
Uptime Kuma 2.4.0, app status running, app URL check, and desktop/narrow screenshots.
Artifacts: `ubuntu-24.04-amd64-evidence` and `ubuntu-24.04-arm64-evidence`.

Installer logs from the artifacts:

```text
Cabana: Detected Ubuntu 24.04.5 LTS (amd64).
Cabana: Reusing the existing Docker Engine and Compose plugin.
Cabana: Installing Node.js 26.x LTS from nodejs.org.
Cabana: Installed Node.js v26.13.0.
Cabana: Bundle 1.1.0 verified.
  Open from your LAN:  http://10.1.0.83/
```

```text
Cabana: Detected Ubuntu 24.04.5 LTS (arm64).
Cabana: Reusing the existing Docker Engine and Compose plugin.
Cabana: Installing Node.js 26.x LTS from nodejs.org.
Cabana: Installed Node.js v26.13.0.
Cabana: Bundle 1.1.0 verified.
  Open from your LAN:  http://10.1.0.30/
```

Health artifacts: version 1.1.0, `needsSetup:true` before the smoke, arch amd64/arm64, and
Docker 28.0.4 reused from the runner image. This demonstrates reuse of an existing Docker
Engine without replacing it, and Node LTS installation when compatible Node.js was absent.

## 3. Installer safety checks

- **Root-only**: running the installer as the non-root `cabana` user on Debian 12 amd64
  produced the explicit root-only message and exit 1; nothing was installed or changed.
- **Unsupported OS**: running the installer inside a `fedora:42` container exited non-zero
  with: `Unsupported operating system: Fedora Linux 42 (Container Image). Supported systems
  are Debian 12 (bookworm) and Ubuntu 24.04 LTS (noble) on amd64 or arm64. No changes have
  been made.`
- **Busy port**: verified above with the listening process named; installer did not stop or
  replace anything.
- **Existing Docker without Compose** (v1.0.0, unchanged installer code in v1.0.1; Debian 12 amd64): the bundled
  `/usr/libexec/docker/cli-plugins/docker-compose` was moved aside, leaving Docker Engine
  working but `docker compose` unavailable. The installer detected the missing plugin and
  installed the standalone official Compose v2 plugin at
  `/usr/local/lib/docker/cli-plugins/docker-compose` without replacing Docker. Result:
  `docker compose version` returned `v5.7.0`, health remained v1.0.0/`needsSetup:false`,
  admin login still worked, and Uptime Kuma remained running.
- **Own port on rerun**: verified above; installer identified its own service and proceeded
  with a safe rerun.
- **Rerun data safety**: verified above with unchanged marker hashes and working admin login.
- **No disk operations**: the installer contains no partitioning/formatting/mount commands;
  storage overview only reads filesystem statistics.

### 3.1 Uninstaller verification

The uninstaller is published as `uninstall.sh` on the v1.1.0 release. Its SHA-256 is
`f0a3866e836902b71b8c53a10f951c35a5b36ccc22c503663aa91f503adcb133`.

Interactive prompt test on an isolated Debian 12 arm64 machine (2026-11-07T11:10Z), using a
pseudo-terminal and answering `n` to both questions:

```bash
sudo bash /tmp/uninstall.sh
# Remove Cabana state and /DATA/AppData? [y/N] n
# Remove Docker Engine and ALL Docker containers...? [y/N] n
```

Outcome: `cabana_gone`, `Docker: kept`, `state_kept`, `appdata_kept`, and the previously
installed Uptime Kuma container remained running. Both prompts defaulted to no.

Release-asset test on the final Debian 12 amd64 VM (2026-11-07T11:26Z):

```bash
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/uninstall.sh -o /tmp/uninstall.sh
sudo bash /tmp/uninstall.sh --yes
```

Outcome: Cabana service/files removed; `/var/lib/cabana`, `/DATA/AppData`, Docker, and the
Uptime Kuma workload kept; Docker status printed `kept`.

```bash
sudo bash /tmp/uninstall.sh --yes --remove-data --remove-docker
```

Outcome at 11:27Z: Docker command absent, Docker packages absent, `/var/lib/cabana` absent,
`/DATA/AppData` absent, no containers. This was run on a disposable VM. The interactive
Docker prompt additionally requires typing `REMOVE`; the explicit flag is the non-interactive
confirmation.

### 3.2 `npm run docker` local test mode

Validated from the source checkout on the local macOS/Docker host:

```bash
CABANA_DOCKER_PORT=8090 CABANA_DOCKER_DIR="$PWD/.cabana-docker-test2" npm run docker
```

The script built the image, started `cabana-local`, and reported healthy version 1.1.0. A
fresh first-run setup succeeded, Uptime Kuma installed through the store, its container was
`running healthy`, and Uptime Kuma's host data appeared under the host-visible
`.cabana-docker-test2/data/AppData/uptimekuma` path. No Cabana or Node packages were
installed on the host. `npm run docker:stop` stops the container while keeping
`.cabana-docker/`.

The container uses the host Docker socket so test apps are published on the host; this is a
development convenience with root-equivalent Docker access, not a hardened deployment mode.

### 3.3 shadcn-vue interface

The frontend now uses shadcn-vue-style components backed by Reka UI primitives:
`Button`, `Card`, `Input`, `Textarea`, `Label`, `Badge`, `Progress`, `Dialog`, `Sheet`,
`Avatar`, `Select`, `Separator`, and `Skeleton`, with shared `cn()` utilities and design
tokens. The dashboard follows a CasaOS-inspired layout: clock/date, CPU and RAM rings,
storage health and usage, network history, search, and a live app tile grid. Full Playwright
coverage passed against this UI on the final Debian 12 arm64 VM (section 1.2), and desktop
and narrow screenshots were regenerated from that run.


## 4. Sampled official-store installs (final v1.1.0)

All installs used the official CasaOS/ZimaOS v2 index on the final Debian 12 arm64 Cabana
instance (Docker 29.9.3), 2026-11-07T11:23–11:25Z.

| App | Version | Containers / health | URL check | Data |
| --- | --- | --- | --- | --- |
| Uptime Kuma `org.icewhale.uptimekuma` | 2.4.0 | `uptimekuma` healthy | port 3001, HTTP 302 | `/DATA/AppData/uptimekuma/app/data` |
| Gitea `org.icewhale.gitea` | 1.26.2 | `gitea` running, restarts 0, no image healthcheck | port 3002, HTTP 200 | `/DATA/AppData/gitea/data` populated |
| Immich `org.icewhale.immich` | 2.7.2 | `immich-server`, `immich-postgres`, `immich-redis`, `immich-machine-learning` all healthy | port 2283, HTTP 200 | `/DATA/AppData/immich` and `/DATA/Gallery/immich` populated |

Exact verification command and outcome:

```bash
# inside the Debian 12 arm64 VM
for c in immich-server immich-postgres immich-redis immich-machine-learning; do
  docker inspect "$c" --format '{{.Name}} {{.State.Status}} {{.State.Health.Status}} restarts={{.RestartCount}}'
done
docker inspect gitea --format '{{.Name}} {{.State.Status}} restarts={{.RestartCount}}'
curl -s -o /dev/null -w 'gitea=%{http_code}\n' http://127.0.0.1:3002/
curl -s -o /dev/null -w 'immich=%{http_code}\n' http://127.0.0.1:2283/
```

```text
/immich-server running healthy restarts=0
/immich-postgres running healthy restarts=0
/immich-redis running healthy restarts=0
/immich-machine-learning running healthy restarts=0
/gitea running restarts=0
gitea=200
immich=200
gitea_data_ok
immich_gallery_ok
```

Image digests confirmed on the final instance:
`ghcr.io/immich-app/immich-server:v2.7.2@sha256:60f637...`,
`gitea/gitea:1.26.2@sha256:7bae79...`.

Uptime Kuma was installed and verified by the E2E suites on Debian 12 arm64, Debian 12
amd64, and Ubuntu 24.04 amd64/arm64; its final v1.1.0 container reported `running healthy`
and `HTTP 302` at 2026-11-07T11:25Z.

## 5. Release artifacts

Final public release:
[WisdomSky/Cabana v1.1.0](https://github.com/WisdomSky/Cabana/releases/tag/v1.1.0),
published 2026-11-07T11:14:20Z from tag `v1.1.0`. v1.0.1 remains published as the previous
security-maintenance release.

| Asset | Size |
| --- | --- |
| `install.sh` | 17,885 bytes |
| `uninstall.sh` | 6,659 bytes |
| `cabana-app.tar.gz` | 504,794 bytes |
| `cabana-app.tar.gz.sha256` | 84 bytes |

Bundle checksum:

```text
44475d5598a2807b9d7129ecd1f8be0786e1f0a3c99fb5b578dd25fbd4e82078  cabana-app.tar.gz
```

`install.sh` SHA-256 observed while fetching the latest release:

```text
1d91d34c617bd9b50d4208e4928a2243906ecd697c7fa06722626ba57c5cc254

Uninstaller SHA-256:

```text
f0a3866e836902b71b8c53a10f951c35a5b36ccc22c503663aa91f503adcb133
```
```

The installer verifies the bundle checksum before installing and refuses an unverified
bundle. Release workflow run
[42367301281](https://github.com/WisdomSky/Cabana/actions/runs/42367301281) built and
published the v1.1.0 assets. Final Ubuntu clean-VM run
[42367982882](https://github.com/WisdomSky/Cabana/actions/runs/42367982882) consumed the
`latest` asset after publication. The tagged `install.sh` is also directly available at
`https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh`.

## 6. Notes and limitations of this verification

### Fixes found and validated during verification

- Official Node.js Linux arm64 binaries need `libatomic.so.1`; the first Debian arm64 run
  failed the Node compatibility check. The installer now installs `libatomic1` when needed,
  and the rerun installed Node 26.13.0 and completed successfully.
- An existing Docker Engine without the Compose plugin was detected; the installer now
  installs the official standalone Compose v2 plugin without replacing Docker.
- The release workflow's initial checksum verification ran from the wrong directory; it now
  verifies from the artifact directory. The release job passes.
- Playwright's default test discovery needed an explicit path glob for the numbered E2E
  suite and the smoke suite; the final full suite passes.
- Store app detail now previews the published Compose file to show the real port before
  installation.
- v1.0.1 updates Express, Multer, and YAML to patched releases; `npm audit --omit=dev`
  reports 0 vulnerabilities for the server.
- v1.1.0 moves the interface to shadcn-vue/Reka UI components with a CasaOS-inspired
  dashboard. The Playwright suite was updated and passed 6/6 against the final Debian 12
  arm64 VM and Ubuntu 24.04 amd64/arm64 smokes.
- v1.1.0 adds the interactive uninstaller and local Docker test mode; both were verified
  below.

### Environment notes

- True VMs used QEMU with user-mode networking. The installer's LAN URL therefore printed
  the guest NAT address (`10.0.2.15`); host tests used forwarded ports. The same installer
  printed a real LAN address (`192.168.139.75`) on an isolated OrbStack Debian 12 arm64
  machine, and GitHub runners printed their VM LAN addresses.
- The GitHub-hosted Ubuntu runners reuse a preinstalled Docker Engine (28.0.4). This was
  intentional evidence that the installer reuses compatible existing Docker installations.
- Integrity note: checks were run only for the environments above. No validation was
  performed for other distributions, other CPU architectures, TLS/reverse-proxy deployments,
  disk mounting/SMB, multi-user access, backups, app upgrades, or third-party app stores,
  because those are out of scope for v1.
- TLS termination, remote access, and authentication proxies are not implemented.
- Single administrator only.
- No disk mounting/partitioning/formatting or SMB.
- No backup/restore or app upgrade tooling.
- No Cabana uninstall/upgrade tooling beyond safe installer reruns.
- No third-party app store management.
- Custom Compose images are not vetted; the administrator is responsible for them.
- App URLs are direct host ports; host firewalls must allow them.

## 7. Reproducing the checks

```bash
# Backend
cd server && npm test
CABANA_REAL_DOCKER=1 node --test test/docker.integration.test.js

# E2E against a disposable local server (requires Docker)
cd ../e2e && npm install && npx playwright install chromium && npx playwright test

# E2E against an installed server
CABANA_E2E_BASE_URL=http://SERVER-LAN-IP npx playwright test
CABANA_E2E_BASE_URL=http://SERVER-LAN-IP npx playwright test --grep @persistence

# Smoke on a fresh installed server
CABANA_E2E_SMOKE=1 CABANA_E2E_BASE_URL=http://SERVER-LAN-IP npx playwright test

# Public installer on a supported clean host
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/install.sh | sudo bash

# Local non-invasive container mode
npm run docker
npm run docker:stop

# Uninstaller (download first so prompts can read a terminal)
curl -fsSL https://github.com/WisdomSky/Cabana/releases/latest/download/uninstall.sh -o /tmp/cabana-uninstall.sh
sudo bash /tmp/cabana-uninstall.sh
```
