import { execFile } from 'node:child_process';
import net from 'node:net';
import { AppError, sanitizeText } from '../errors.js';

const DEFAULT_TIMEOUT = 120_000;

function run(command, args, { timeout = DEFAULT_TIMEOUT, env, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        timeout,
        maxBuffer,
        env: env ?? process.env,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          const wrapped = new Error(stderr?.trim() || error.message);
          wrapped.code = error.code;
          wrapped.stdout = stdout;
          wrapped.stderr = stderr;
          wrapped.timedOut = error.killed === true;
          reject(wrapped);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

export class DockerService {
  constructor({ runner = run, logger = console, socketPath = process.env.DOCKER_HOST } = {}) {
    this.runner = runner;
    this.logger = logger;
    this.socketPath = socketPath;
    this._cache = null;
    this._cacheAt = 0;
  }

  invalidate() {
    this._cache = null;
    this._cacheAt = 0;
  }

  async info({ force = false } = {}) {
    const now = Date.now();
    if (!force && this._cache && now - this._cacheAt < 2500) return this._cache;
    try {
      const [version, compose] = await Promise.all([
        this.runner('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 8000 }),
        this.runner('docker', ['compose', 'version', '--short'], { timeout: 8000 }),
      ]);
      this._cache = {
        available: true,
        version: version.stdout.trim(),
        composeVersion: compose.stdout.trim(),
      };
    } catch (error) {
      this._cache = {
        available: false,
        version: null,
        composeVersion: null,
        error: sanitizeText(error.message, 1000),
      };
    }
    this._cacheAt = now;
    return this._cache;
  }

  async requireAvailable() {
    const info = await this.info();
    if (!info.available) {
      throw new AppError(
        503,
        'docker_unavailable',
        'Docker Engine is not available. Check that Docker is installed, the daemon is running, and the Cabana service can reach /var/run/docker.sock.',
        { reason: info.error },
      );
    }
    return info;
  }

  async listContainers({ force = false } = {}) {
    if (!force && this._containers && Date.now() - this._containersAt < 1500) return this._containers;
    const ids = await this.runner('docker', ['ps', '-aq', '--no-trunc'], { timeout: 10_000 });
    const idList = ids.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    let containers = [];
    if (idList.length) {
      for (let i = 0; i < idList.length; i += 100) {
        const batch = idList.slice(i, i + 100);
        const res = await this.runner('docker', ['inspect', ...batch], {
          timeout: 20_000,
          maxBuffer: 32 * 1024 * 1024,
        });
        const parsed = JSON.parse(res.stdout);
        containers = containers.concat(parsed.map(normalizeContainer));
      }
    }
    this._containers = containers;
    this._containersAt = Date.now();
    return containers;
  }

  async containerNames() {
    const containers = await this.listContainers();
    return new Set(containers.map((c) => c.name.replace(/^\//, '')));
  }

  async publishedHostPorts() {
    const containers = await this.listContainers();
    const ports = new Map();
    for (const container of containers) {
      if (container.state !== 'running') continue;
      for (const binding of container.portBindings) {
        ports.set(binding.hostPort, `${container.name} (${binding.containerPort})`);
      }
    }
    return ports;
  }

  async compose(project, composePath, args, { timeout = 15 * 60 * 1000, env } = {}) {
    const cmdArgs = ['compose', '--ansi', 'never', '--project-name', project, '--file', composePath, ...args];
    try {
      return await this.runner('docker', cmdArgs, { timeout, env });
    } catch (error) {
      throw new AppError(502, 'docker_compose_failed', composeFailureMessage(error), {
        command: `docker ${cmdArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`,
        output: sanitizeText(error.stderr || error.stdout || error.message, 6000),
      });
    }
  }

  async up(project, composePath) {
    const result = await this.compose(project, composePath, ['up', '-d', '--remove-orphans']);
    this.invalidate();
    return result;
  }

  async stop(project, composePath) {
    const result = await this.compose(project, composePath, ['stop']);
    this.invalidate();
    return result;
  }

  async down(project, composePath, { deleteVolumes = false } = {}) {
    const args = ['down', '--remove-orphans'];
    if (deleteVolumes) args.push('--volumes');
    const result = await this.compose(project, composePath, args);
    this.invalidate();
    return result;
  }

  async logs(project, composePath, { tail = 200 } = {}) {
    return this.compose(project, composePath, ['logs', '--no-color', '--tail', String(tail)], { timeout: 30_000 });
  }
}

function composeFailureMessage(error) {
  if (error.timedOut) {
    return 'Docker Compose timed out while installing or starting the app. The image may be large or the network may be slow.';
  }
  const raw = sanitizeText(error.stderr || error.stdout || error.message, 4000);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const useful = lines
    .filter((line) => !/^time=/.test(line))
    .slice(-14)
    .join('\n');
  return useful ? `Docker Compose failed:\n${useful}` : 'Docker Compose failed.';
}

function normalizeContainer(raw) {
  const labels = raw.Config?.Labels || {};
  const hostname = (raw.Name || '').replace(/^\//, '');
  const portBindings = [];
  const seen = new Set();
  for (const [containerPort, bindings] of Object.entries(raw.NetworkSettings?.Ports || {})) {
    if (!bindings) continue;
    const container = containerPort.split('/')[0];
    for (const binding of bindings) {
      const key = `${binding.HostIp}:${binding.HostPort}:${container}`;
      if (seen.has(key)) continue;
      seen.add(key);
      portBindings.push({
        containerPort: container,
        hostIp: binding.HostIp || '0.0.0.0',
        hostPort: binding.HostPort,
      });
    }
  }
  const statusText = raw.State?.Health?.Status
    ? `${raw.State?.Status} (${raw.State.Health.Status})`
    : raw.State?.Status || 'unknown';
  return {
    id: raw.Id,
    name: hostname,
    image: raw.Config?.Image || '',
    state: raw.State?.Status || 'unknown',
    health: raw.State?.Health?.Status || null,
    statusText,
    startedAt: raw.State?.StartedAt || null,
    createdAt: raw.Created || null,
    restartCount: raw.RestartCount || 0,
    labels,
    appId: labels['cabana.app.id'] || null,
    source: labels['cabana.app.source'] || null,
    portBindings,
    mounts: (raw.Mounts || []).map((m) => ({
      type: m.Type,
      source: m.Source,
      destination: m.Destination,
      mode: m.RW === false ? 'ro' : 'rw',
    })),
  };
}

export function isPortFree(port, { host = '0.0.0.0', timeout = 800 } = {}) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const done = (free) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        /* ignore */
      }
      resolve(free);
    };
    server.once('error', (err) => done(err.code === 'EADDRINUSE' ? false : true));
    server.once('listening', () => done(true));
    server.listen({ port, host, exclusive: true });
    setTimeout(() => done(false), timeout).unref?.();
  });
}

export function assertPortsFree(portMap, { ownPorts = new Set() } = {}) {
  const conflicts = [];
  for (const [hostPort, description] of portMap) {
    if (ownPorts.has(String(hostPort))) continue;
    if (!isPortFreeSync(String(hostPort))) conflicts.push({ port: String(hostPort), description });
  }
  return conflicts;
}

function isPortFreeSync(port) {
  // Used only where an async check is not possible; the server bootstrap uses
  // `isPortFree`. This is a syntax/sanity check to catch invalid port values.
  const n = Number(port);
  return Number.isInteger(n) && n > 0 && n < 65536;
}

export { run as execFileRunner };
