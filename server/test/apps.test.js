import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../src/errors.js';
import { getApp, listApps } from '../src/db.js';
import { makeAppService, silence } from './helpers.js';

test('store app lifecycle: install, reconcile, stop/start, uninstall preserving data', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());

  const installed = await ctx.apps.installStore('org.example.uptime');
  assert.equal(installed.id, 'org.example.uptime');
  assert.equal(installed.status, 'running');
  assert.equal(installed.port, '39001');
  assert.equal(installed.source, 'store');
  assert.equal(installed.health, 'healthy');
  assert.equal(installed.containers.length, 1);

  const row = getApp(ctx.db, 'org.example.uptime');
  assert.equal(row.mainService, 'uptime');
  assert.equal(row.storeId, 'org.example.uptime');
  assert.ok(fs.existsSync(row.composePath));
  const compose = fs.readFileSync(row.composePath, 'utf8');
  assert.match(compose, /cabana\.app\.id: org\.example\.uptime/);
  assert.match(compose, /source: .*AppData\/uptime\/data/);

  const marker = path.join(ctx.dataDir, 'AppData', 'uptime', 'app', 'data', 'keep-me.txt');
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, 'precious data');

  let result = await ctx.apps.stop('org.example.uptime');
  assert.equal(result.app.status, 'stopped');
  const stopCall = ctx.docker.calls.find((c) => c[0] === 'stop');
  assert.ok(stopCall);

  result = await ctx.apps.start('org.example.uptime');
  assert.equal(result.app.status, 'running');

  ctx.docker.containers = [];
  result = await ctx.apps.get('org.example.uptime');
  assert.equal(result.app.status, 'missing');
  await ctx.apps.start('org.example.uptime');

  const uninstall = await ctx.apps.uninstall('org.example.uptime', { deleteData: false });
  assert.equal(uninstall.dataPreserved, true);
  assert.equal(getApp(ctx.db, 'org.example.uptime'), null);
  assert.ok(fs.existsSync(marker), 'app data must be preserved without explicit deletion');
  assert.equal(listApps(ctx.db).length, 0);

  const reinstalled = await ctx.apps.installStore('org.example.uptime');
  assert.equal(reinstalled.status, 'running');
  assert.ok(fs.existsSync(marker), 'reinstall must not wipe existing data');
  const deleted = await ctx.apps.uninstall('org.example.uptime', { deleteData: true });
  assert.equal(deleted.dataDeleted, true);
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'AppData', 'uptime')), 'explicit delete removes app data');
});

test('install failures are surfaced and leave no app record', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());
  ctx.docker.up = async () => {
    throw new AppError(502, 'docker_compose_failed', 'Docker Compose failed:\nno space left on device');
  };

  await assert.rejects(() => ctx.apps.installStore('org.example.uptime'), (error) => {
    assert.equal(error.status, 502);
    assert.match(error.message, /no space left/);
    return true;
  });
  assert.equal(getApp(ctx.db, 'org.example.uptime'), null);
  assert.equal(listApps(ctx.db).length, 0);
});

test('name and port conflicts are detected before Docker Compose runs', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());

  ctx.docker.containers.push({
    id: 'foreign-1',
    name: 'cabana_org_example_uptime-uptime',
    state: 'running',
    labels: {},
    portBindings: [],
    statusText: 'Up',
  });
  await assert.rejects(
    () => ctx.apps.installStore('org.example.uptime'),
    (error) => error.code === 'container_name_conflict' && error.status === 409,
  );
  assert.equal(ctx.docker.calls.filter((c) => c[0] === 'up').length, 0);

  ctx.docker.containers = [
    {
      id: 'foreign-2',
      name: 'another-app',
      state: 'running',
      labels: {},
      portBindings: [{ hostPort: '39001', hostIp: '0.0.0.0', containerPort: '3001' }],
      statusText: 'Up',
    },
  ];
  await assert.rejects(
    () => ctx.apps.installStore('org.example.uptime'),
    (error) => error.code === 'port_conflict' && error.status === 409 && /39001/.test(error.message),
  );
  assert.equal(ctx.docker.calls.filter((c) => c[0] === 'up').length, 0);
});

test('custom compose needs explicit confirmation for privileged host access', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());
  const compose = `services:
  risky:
    image: busybox:1
    privileged: true
    network_mode: host
    command: ["sleep", "infinity"]
`;

  const analysis = await ctx.apps.analyzeCustom({ compose, title: 'Risky Test' });
  assert.equal(analysis.needsConfirmation, true);
  assert.ok(analysis.warnings.some((w) => w.code === 'privileged'));
  assert.ok(analysis.warnings.some((w) => w.code === 'host_network'));

  await assert.rejects(
    () => ctx.apps.installCustom({ compose, title: 'Risky Test' }),
    (error) => error.status === 409 && error.code === 'confirmation_required',
  );
  assert.equal(listApps(ctx.db).length, 0);

  const installed = await ctx.apps.installCustom({ compose, title: 'Risky Test', confirmRisk: true });
  assert.equal(installed.title, 'Risky Test');
  assert.equal(installed.source, 'custom');
  assert.equal(installed.status, 'running');
  assert.ok(listApps(ctx.db).length === 1);
  const row = listApps(ctx.db)[0];
  assert.ok(row.warnings.some((w) => w.code === 'privileged'));
});

test('custom compose install substitutes $AppID, uses /DATA defaults, and validates input', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());
  const compose = `services:
  web:
    image: nginx:alpine
    ports:
      - "39050:80"
    volumes:
      - /DATA/AppData/$AppID/www:/usr/share/nginx/html
    environment:
      TZ: $TZ
      PUID: $PUID
`;
  const analysis = await ctx.apps.analyzeCustom({ compose, title: 'Static Site' });
  assert.equal(analysis.port, '39050');
  assert.equal(analysis.needsConfirmation, false);
  assert.equal(analysis.services.length, 1);

  const installed = await ctx.apps.installCustom({ compose, title: 'Static Site', id: analysis.id });
  assert.equal(installed.id, 'static-site');
  assert.equal(installed.port, '39050');
  const row = getApp(ctx.db, 'static-site');
  assert.ok(row.dataPaths.includes(path.join(ctx.dataDir, 'AppData', 'static-site', 'www')));
  const yaml = fs.readFileSync(row.composePath, 'utf8');
  assert.match(yaml, /cabana\.app\.source: custom/);

  await assert.rejects(() => ctx.apps.analyzeCustom({ compose: 'services: []', title: 'Bad' }), /mapping|service/i);
  await assert.rejects(() => ctx.apps.installCustom({ compose: 'x: 1', title: 'Bad' }), /service/i);
});

test('shared data paths are not deleted when another app still uses them', async (t) => {
  const ctx = makeAppService();
  t.after(() => ctx.cleanup());
  const sharedCompose = `services:
  one:
    image: busybox
    volumes:
      - /DATA/Shared:/shared
`;
  const a = await ctx.apps.installCustom({ compose: sharedCompose.replace('one:', 'a:').replace('one', 'a'), title: 'Shared A', id: 'shared-a' });
  assert.ok(a);
  ctx.docker.containers = [];
  const b = await ctx.apps.installCustom({ compose: sharedCompose.replace('one:', 'b:').replace('one', 'b'), title: 'Shared B', id: 'shared-b' });
  assert.ok(b);
  fs.mkdirSync(path.join(ctx.dataDir, 'Shared'), { recursive: true });
  fs.writeFileSync(path.join(ctx.dataDir, 'Shared', 'shared.txt'), 'keep');

  const result = await ctx.apps.uninstall('shared-a', { deleteData: true });
  assert.equal(result.removedPaths.length, 0);
  assert.ok(fs.existsSync(path.join(ctx.dataDir, 'Shared', 'shared.txt')));
});
