import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { openDatabase } from '../src/db.js';
import { SettingsService } from '../src/services/settings.js';
import { AppService } from '../src/services/apps.js';
import { DockerService } from '../src/services/docker.js';
import { silence, tempRoot } from './helpers.js';

const enabled = process.env.CABANA_REAL_DOCKER === '1';

function dockerTestRoot() {
  if (process.platform === 'darwin') {
    return fs.mkdtempSync(path.join(process.cwd(), '.tmp-docker-test-'));
  }
  return tempRoot('cabana-docker-');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '0.0.0.0', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return await response.text();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

test('real Docker volume failures are surfaced with the underlying error', { skip: !enabled }, async (t) => {
  const root = dockerTestRoot();
  const dataDir = path.join(root, 'DATA');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(path.join(root, 'test.db'));
  const settings = new SettingsService({ db, dataDir });
  const docker = new DockerService({ logger: silence });
  const store = {
    getIndex: async () => ({ apps: [] }),
    getApp: async () => {
      throw new Error('not used');
    },
    getCompose: async () => {
      throw new Error('not used');
    },
  };
  const config = { dataDir, appsDir: path.join(root, 'apps'), version: 'test' };
  const apps = new AppService({ db, docker, store, settings, config, logger: silence });
  const appId = `ci-badvolume-${Date.now().toString(36)}`;
  t.after(async () => {
    await docker.runner('docker', ['volume', 'rm', '-f', `cabana_${appId}_broken`], { timeout: 30_000 }).catch(() => {});
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const info = await docker.info();
  if (!info.available) {
    t.skip('Docker is not available');
    return;
  }
  const compose = `services:
  bad:
    image: busybox:1
    command: ["true"]
    volumes:
      - broken:/data
volumes:
  broken:
    driver_opts:
      type: none
      device: /this/path/definitely/does/not/exist
      o: bind
`;
  await assert.rejects(
    () => apps.installCustom({ compose, title: 'Broken Volume', id: appId }),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /Docker Compose failed/i);
      assert.match(`${error.message}\n${error.details?.output || ''}`, /mount|volume|no such file|invalid/i);
      return true;
    },
  );
  assert.equal(db.prepare('SELECT id FROM apps WHERE id = ?').get(appId), undefined);
});

test('real Docker lifecycle: custom Compose install, HTTP, stop/start, uninstall preserving data', { skip: !enabled }, async (t) => {
  const root = dockerTestRoot();
  const dataDir = path.join(root, 'DATA');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(path.join(root, 'test.db'));
  const settings = new SettingsService({ db, dataDir });
  const docker = new DockerService({ logger: silence });
  const store = {
    getIndex: async () => ({ apps: [] }),
    getApp: async () => {
      throw new Error('not used');
    },
    getCompose: async () => {
      throw new Error('not used');
    },
  };
  const config = { dataDir, appsDir: path.join(root, 'apps'), version: 'test' };
  const apps = new AppService({ db, docker, store, settings, config, logger: silence });
  const appId = `ci-whoami-${Date.now().toString(36)}`;
  const port = await freePort();
  t.after(async () => {
    try {
      if (db.prepare('SELECT id FROM apps WHERE id = ?').get(appId)) {
        await apps.uninstall(appId, { deleteData: true }).catch(() => {});
      }
      db.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const info = await docker.info();
  if (!info.available) {
    t.skip('Docker is not available');
    return;
  }

  const compose = `services:
  whoami:
    image: traefik/whoami:v1.10
    ports:
      - "${port}:80"
    volumes:
      - /DATA/AppData/$AppID/keep:/data
`;

  const dataPath = path.join(dataDir, 'AppData', appId, 'keep');
  fs.mkdirSync(dataPath, { recursive: true });
  fs.writeFileSync(path.join(dataPath, 'marker.txt'), 'preserve me');

  const installed = await apps.installCustom({ compose, title: 'Cabana CI Whoami', id: appId });
  assert.equal(installed.id, appId);
  assert.equal(installed.status, 'running');
  assert.equal(installed.port, String(port));

  const body = await waitForHttp(`http://127.0.0.1:${port}/`);
  assert.match(body, /Hostname:/);

  let result = await apps.stop(appId);
  assert.equal(result.app.status, 'stopped');
  result = await apps.start(appId);
  assert.equal(result.app.status, 'running');
  await waitForHttp(`http://127.0.0.1:${port}/`);

  const uninstall = await apps.uninstall(appId, { deleteData: false });
  assert.equal(uninstall.dataPreserved, true);
  assert.ok(fs.existsSync(path.join(dataPath, 'marker.txt')));

  const containers = await docker.listContainers({ force: true });
  assert.equal(containers.some((c) => c.labels?.['cabana.app.id'] === appId), false);
});
