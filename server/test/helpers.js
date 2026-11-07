import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { createApplication } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { SettingsService } from '../src/services/settings.js';
import { AppService } from '../src/services/apps.js';

export const silence = { info() {}, warn() {}, error() {}, log() {} };

export function tempRoot(prefix = 'cabana-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function makeApp(options = {}) {
  const root = tempRoot();
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const application = createApplication({
    stateDir,
    dataDir,
    webDir: path.join(root, 'no-web'),
    version: 'test',
    logger: silence,
    ...options,
  });
  return {
    ...application,
    root,
    stateDir,
    dataDir,
    cleanup() {
      try {
        application.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

export async function setupAdmin(agent, { username = 'admin', password = 'correct-horse-123' } = {}) {
  const res = await agent.post('/api/setup').send({ username, password });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    csrf: res.body.csrfToken,
    cookie: res.headers['set-cookie']?.[0]?.split(';')[0],
    user: res.body.user,
  };
}

export function csrfHeaders(csrf) {
  return { 'X-CSRF-Token': csrf };
}

export function makeAppService({ fetchImpl, composeOverride } = {}) {
  const root = tempRoot('cabana-apps-');
  const dataDir = path.join(root, 'DATA');
  const appsDir = path.join(root, 'apps');
  const db = openDatabase(path.join(root, 'test.db'));
  const settings = new SettingsService({ db, dataDir });
  const docker = new FakeDocker();
  const store = {
    getIndex: async () => ({ apps: [storeEntry(), storeEntry({ id: 'org.example.other', title: 'Other' })] }),
    getApp: async (_index, id) => ({
      ...storeEntry({ id, title: id === 'org.example.uptime' ? 'Uptime Test' : 'Other' }),
    }),
    getCompose: async () => ({ text: composeOverride || COMPOSE_FIXTURE, usedArchVariant: true }),
    getMeta: async () => ({}),
  };
  const config = { dataDir, appsDir, version: 'test' };
  const apps = new AppService({ db, docker, store, settings, config, logger: silence });
  return {
    root,
    dataDir,
    appsDir,
    db,
    settings,
    docker,
    store,
    apps,
    config,
    cleanup() {
      try {
        db.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

export function storeEntry(overrides = {}) {
  return {
    id: 'org.example.uptime',
    title: 'Uptime Test',
    tagline: 'A test monitor',
    category: 'Networking',
    categories: ['networking'],
    author: 'Test',
    developer: 'Test',
    architectures: ['amd64', 'arm64'],
    iconPath: '/apps/org.example.uptime/assets/icon.svg',
    icon: 'https://store.example/base/apps/org.example.uptime/assets/icon.svg',
    thumbnail: null,
    composePath: '/apps/org.example.uptime/docker-compose.yml',
    composeUrl: 'https://store.example/base/apps/org.example.uptime/docker-compose.yml',
    metaUrl: 'https://store.example/base/apps/org.example.uptime/meta.json',
    contentHash: 'abc123',
    version: '1.2.3',
    ...overrides,
  };
}

export const COMPOSE_FIXTURE = `name: uptime
services:
  uptime:
    image: example/uptime:1
    restart: unless-stopped
    ports:
      - target: 3001
        published: "39001"
        protocol: tcp
    volumes:
      - type: bind
        source: /DATA/AppData/$AppID/data
        target: /app/data
    environment:
      PUID: $PUID
      PGID: $PGID
      TZ: $TZ
x-casaos:
  id: org.example.uptime
  main: uptime
  port_map: "39001"
  scheme: http
  index: /
`;

export class FakeDocker {
  constructor() {
    this.containers = [];
    this.calls = [];
    this.available = true;
  }

  async info() {
    return this.available
      ? { available: true, version: '29.0.0', composeVersion: '2.40.0' }
      : { available: false, version: null, composeVersion: null, error: 'down' };
  }

  async requireAvailable() {
    const info = await this.info();
    if (!info.available) {
      const { AppError } = await import('../src/errors.js');
      throw new AppError(503, 'docker_unavailable', 'Docker unavailable');
    }
    return info;
  }

  async listContainers() {
    return this.containers;
  }

  async containerNames() {
    return new Set(this.containers.map((c) => c.name));
  }

  async publishedHostPorts() {
    const map = new Map();
    for (const c of this.containers) {
      if (c.state !== 'running') continue;
      for (const p of c.portBindings || []) map.set(p.hostPort, c.name);
    }
    return map;
  }

  invalidate() {}

  async up(project, composePath) {
    this.calls.push(['up', project]);
    const doc = YAML.parse(fs.readFileSync(composePath, 'utf8'));
    this.containers = this.containers.filter((c) => c.labels?.['com.docker.compose.project'] !== project);
    let index = 1;
    for (const [serviceName, service] of Object.entries(doc.services || {})) {
      const labels = { ...(service.labels || {}), 'com.docker.compose.project': project };
      this.containers.push({
        id: `fake-${project}-${index++}`,
        name: service.container_name || `${project}-${serviceName}-1`,
        image: service.image,
        state: 'running',
        health: 'healthy',
        statusText: 'Up (healthy)',
        labels,
        appId: labels['cabana.app.id'] || null,
        portBindings: (service.ports || []).map((p) => ({
          containerPort: String(p.target || p),
          hostPort: String(p.published || p),
          hostIp: '0.0.0.0',
        })),
        mounts: [],
      });
    }
  }

  async stop(project) {
    this.calls.push(['stop', project]);
    for (const container of this.containers) {
      if (container.labels?.['com.docker.compose.project'] === project) container.state = 'exited';
    }
  }

  async down(project, _composePath, options = {}) {
    this.calls.push(['down', project, options]);
    this.containers = this.containers.filter((c) => c.labels?.['com.docker.compose.project'] !== project);
  }

  async runner() {
    throw new Error('FakeDocker.runner is not implemented');
  }
}
