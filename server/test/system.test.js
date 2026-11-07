import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { makeApp, setupAdmin, csrfHeaders, FakeDocker, silence } from './helpers.js';

test('settings API validates inputs and protects file root changes with the password', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  const { csrf } = await setupAdmin(agent);

  let res = await agent.get('/api/settings');
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.puid, 1000);
  assert.equal(res.body.settings.pgid, 1000);
  assert.deepEqual(res.body.settings.fileRoots, [ctx.dataDir]);
  assert.equal(res.body.system.dataDir, ctx.dataDir);
  assert.equal(res.body.system.hostArch, process.arch === 'x64' ? 'amd64' : process.arch);

  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ puid: 0 });
  assert.equal(res.status, 400);
  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ pgid: 70000 });
  assert.equal(res.status, 400);
  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ tz: 'Not/AZone' });
  assert.equal(res.status, 400);
  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ tz: 'America/New_York', puid: 1001 });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.tz, 'America/New_York');
  assert.equal(res.body.settings.puid, 1001);

  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ fileRoots: [ctx.dataDir] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'password_required');
  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ fileRoots: [ctx.dataDir], currentPassword: 'wrong' });
  assert.equal(res.status, 403);
  res = await agent.patch('/api/settings').set(csrfHeaders(csrf)).send({ fileRoots: ['/'], currentPassword: 'correct-horse-123' });
  assert.equal(res.status, 400);
  res = await agent
    .patch('/api/settings')
    .set(csrfHeaders(csrf))
    .send({ fileRoots: [ctx.dataDir, path.join(ctx.root, 'missing')], currentPassword: 'correct-horse-123' });
  assert.equal(res.status, 400);

  const extra = path.join(ctx.root, 'extra-root');
  fs.mkdirSync(extra);
  res = await agent
    .patch('/api/settings')
    .set(csrfHeaders(csrf))
    .send({ fileRoots: [ctx.dataDir, extra], currentPassword: 'correct-horse-123' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.settings.fileRoots, [fs.realpathSync(ctx.dataDir), fs.realpathSync(extra)]);
});

test('dashboard and storage APIs report real host, Docker and disk data', async (t) => {
  const docker = new FakeDocker();
  docker.containers.push({
    id: 'c1',
    name: 'demo',
    image: 'demo:1',
    state: 'running',
    health: 'healthy',
    statusText: 'Up (healthy)',
    labels: { 'cabana.managed': 'true', 'cabana.app.id': 'demo' },
    portBindings: [],
    mounts: [],
  });
  const ctx = makeApp({ dockerService: docker });
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  await setupAdmin(agent);

  let res = await agent.get('/api/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.docker.available, true);
  assert.equal(res.body.docker.containers.running, 1);
  assert.equal(res.body.host.cpu.cores > 0, true);
  assert.equal(res.body.host.memory.total > 0, true);
  assert.equal(res.body.host.disk.used >= 0, true);
  assert.equal(typeof res.body.host.network.rxRate, 'number');
  assert.equal(res.body.apps.counts.total, 0);
  assert.equal(res.body.orphans.length, 1);
  assert.equal(res.body.dataDir, ctx.dataDir);

  res = await agent.get('/api/storage');
  assert.equal(res.status, 200);
  assert.equal(res.body.dataDir, ctx.dataDir);
  assert.ok(res.body.filesystems.length >= 1);
  assert.equal(res.body.roots[0].path, ctx.dataDir);
  assert.equal(res.body.appData.path, path.join(ctx.dataDir, 'AppData'));
  assert.deepEqual(res.body.mountedByCabana, []);
  assert.equal(typeof res.body.host.disk.percent, 'number');

  res = await agent.get('/api/storage/host');
  assert.equal(res.status, 200);
  assert.equal(res.body.hostname.length > 0, true);
});

test('store API lists, filters, details, refreshes and proxies assets', async (t) => {
  const fetchImpl = async (url) => {
    const headers = { get: (name) => (name.toLowerCase() === 'content-type' ? (url.endsWith('.svg') ? 'image/svg+xml' : 'application/json') : null) };
    if (url.endsWith('index.json')) {
      return {
        ok: true,
        status: 200,
        headers,
        text: async () =>
          JSON.stringify({
            version: 2,
            updated_at: '2026-01-01T00:00:00Z',
            base_url: 'https://store.example/base',
            apps: [
              {
                id: 'org.example.kuma',
                title: 'Kuma',
                tagline: 'Monitor',
                category: 'Networking',
                categories: ['networking'],
                architectures: ['amd64', 'arm64'],
                icon: '/apps/org.example.kuma/assets/icon.svg',
                compose_url: '/apps/org.example.kuma/docker-compose.yml',
                meta_url: '/apps/org.example.kuma/meta.json',
                content_hash: 'x',
                version: '1.0.0',
              },
              {
                id: 'org.example.x86',
                title: 'X86 Only',
                tagline: 'Desktop only',
                category: 'Developer',
                categories: ['developer'],
                architectures: ['amd64'],
                compose_url: '/apps/org.example.x86/docker-compose.yml',
                meta_url: '/apps/org.example.x86/meta.json',
                content_hash: 'y',
                version: '1.0.0',
              },
            ],
          }),
      };
    }
    if (url.endsWith('/meta.json')) {
      return { ok: true, status: 200, headers, text: async () => JSON.stringify({ description: 'Monitor things', tips: {} }) };
    }
    if (url.endsWith('docker-compose.yml')) {
      const id = url.includes('kuma') ? 'kuma' : 'x86';
      return {
        ok: true,
        status: 200,
        headers,
        text: async () =>
          `services:\n  ${id}:\n    image: example/${id}:1\n    ports: ["39060:80"]\nx-casaos:\n  main: ${id}\n  port_map: "39060"\n`,
      };
    }
    if (url.includes('/assets/')) {
      return { ok: true, status: 200, headers, arrayBuffer: async () => new TextEncoder().encode('<svg/>').buffer };
    }
    if (url.endsWith('docker-compose.arm64.yml')) return { ok: false, status: 404, headers, text: async () => 'no' };
    return { ok: false, status: 404, headers, text: async () => 'no' };
  };
  const ctx = makeApp({ fetchImpl, storeUrl: 'https://store.example/index.json' });
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  const { csrf } = await setupAdmin(agent);

  let res = await agent.get('/api/store');
  assert.equal(res.status, 200);
  const hostArch = process.arch === 'x64' ? 'amd64' : process.arch;
  assert.equal(res.body.total, hostArch === 'amd64' ? 2 : 1);
  assert.ok(res.body.categories.some((c) => c.id === 'networking'));
  assert.equal(res.body.hostArch, process.arch === 'x64' ? 'amd64' : process.arch);

  res = await agent.get('/api/store?q=kuma');
  assert.equal(res.body.total, 1);
  assert.equal(res.body.apps[0].id, 'org.example.kuma');
  res = await agent.get('/api/store?category=developer&arch=all');
  assert.equal(res.body.total, 1);
  res = await agent.get('/api/store?arch=all');
  assert.equal(res.body.total, 2);
  res = await agent.get('/api/store?arch=amd64');
  assert.equal(res.body.total, 2);
  res = await agent.get('/api/store?arch=arm64');
  assert.equal(res.body.total, 1);

  res = await agent.get('/api/store/apps/org.example.kuma');
  assert.equal(res.status, 200);
  assert.equal(res.body.app.description, 'Monitor things');
  assert.equal(res.body.app.port, '39060');
  assert.equal(res.body.app.iconPath, '/apps/org.example.kuma/assets/icon.svg');

  res = await agent.get('/api/store/apps/missing');
  assert.equal(res.status, 404);

  res = await agent.get('/api/store/asset?path=%2Fapps%2Forg.example.kuma%2Fassets%2Ficon.svg');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /image\/svg/);

  res = await agent.post('/api/store/refresh');
  assert.equal(res.status, 403);
  res = await agent.post('/api/store/refresh').set(csrfHeaders(csrf));
  assert.equal(res.status, 200);
  assert.equal(res.body.appCount, 2);
});

test('store remains usable when the upstream index is temporarily unreachable', async (t) => {
  let fail = false;
  const fetchImpl = async (url) => {
    if (fail) throw new Error('offline');
    const headers = { get: () => 'application/json' };
    return {
      ok: true,
      status: 200,
      headers,
      text: async () =>
        JSON.stringify({
          version: 2,
          base_url: 'https://store.example/base',
          apps: [{ id: 'org.example.a', title: 'A', architectures: ['amd64', 'arm64'], compose_url: '/apps/a/docker-compose.yml' }],
        }),
    };
  };
  const ctx = makeApp({ fetchImpl, storeUrl: 'https://store.example/index.json', storeCacheTtlMs: 0 });
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  await setupAdmin(agent);
  let res = await agent.get('/api/store');
  assert.equal(res.status, 200);
  fail = true;
  res = await agent.get('/api/store');
  assert.equal(res.status, 200);
  assert.equal(res.body.stale, true);
  assert.equal(res.body.apps.length, 1);
});
