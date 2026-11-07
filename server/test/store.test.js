import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { StoreService } from '../src/services/store.js';
import { tempRoot, silence } from './helpers.js';

const BASE = 'https://store.example/gh/CasaOS-AppStore@gh-pages';
const INDEX_URL = `${BASE}/index.json`;

const INDEX = {
  version: 2,
  app_count: 3,
  updated_at: '2026-01-02T03:04:05Z',
  base_url: BASE,
  apps: [
    {
      id: 'com.example.multi',
      title: 'Multi App',
      tagline: 'A multi arch app',
      category: 'Networking',
      categories: ['networking'],
      author: 'Example',
      developer: 'Example Dev',
      architectures: ['amd64', 'arm64'],
      icon: '/apps/com.example.multi/assets/icon.svg',
      thumbnail: '/apps/com.example.multi/assets/thumb.webp',
      compose_url: '/apps/com.example.multi/docker-compose.yml',
      meta_url: '/apps/com.example.multi/meta.json',
      content_hash: 'hash-multi',
      version: '1.0.0',
    },
    {
      id: 'com.example.amdonly',
      title: 'AMD Only',
      tagline: 'Only on x86',
      category: 'Media',
      categories: ['media'],
      architectures: ['amd64'],
      icon: '/apps/com.example.amdonly/assets/icon.svg',
      compose_url: '/apps/com.example.amdonly/docker-compose.yml',
      meta_url: '/apps/com.example.amdonly/meta.json',
      content_hash: 'hash-amd',
      version: '2.0.0',
    },
    {
      id: 'com.example.armed',
      title: 'ARM App',
      tagline: 'Only on arm',
      category: 'Media',
      categories: ['media'],
      architectures: ['arm64'],
      icon: '/apps/com.example.armed/assets/icon.svg',
      compose_url: '/apps/com.example.armed/docker-compose.yml',
      meta_url: '/apps/com.example.armed/meta.json',
      content_hash: 'hash-arm',
      version: '3.0.0',
    },
  ],
};

const META = {
  id: 'com.example.multi',
  title: 'Multi App',
  description: 'A useful test app.',
  screenshot_link: ['/apps/com.example.multi/assets/shot-1.webp'],
  tips: { before_install: 'Read this first.' },
  website: 'https://example.com',
};

const COMPOSE_GENERIC = 'services:\n  app:\n    image: example/app:1\n';
const COMPOSE_ARM = 'services:\n  app:\n    image: example/app:arm64\n';

class FakeFetch {
  constructor() {
    this.calls = [];
    this.fail = false;
    this.indexEtag = '"etag-1"';
    this.indexStatus = 200;
  }

  async fetch(url, options = {}) {
    this.calls.push({ url, options });
    if (this.fail) throw new Error('network down');
    const headers = {
      get(name) {
        const lower = name.toLowerCase();
        if (lower === 'etag') return '"etag-1"';
        if (lower === 'content-type') {
          if (url.endsWith('.svg')) return 'image/svg+xml';
          if (url.endsWith('.webp')) return 'image/webp';
          return 'application/octet-stream';
        }
        return null;
      },
    };
    if (url === INDEX_URL) {
      if (options.headers?.['if-none-match'] === this.indexEtag) {
        return { ok: false, status: 304, headers };
      }
      return {
        ok: true,
        status: 200,
        headers,
        text: async () => JSON.stringify(INDEX),
      };
    }
    if (url.endsWith('/meta.json')) {
      return { ok: true, status: 200, headers, text: async () => JSON.stringify(META) };
    }
    if (url.endsWith('docker-compose.arm64.yml') && url.includes('com.example.armed')) {
      return { ok: true, status: 200, headers, text: async () => COMPOSE_ARM };
    }
    if (url.endsWith('docker-compose.arm64.yml')) {
      return { ok: false, status: 404, headers, text: async () => 'not found' };
    }
    if (url.endsWith('docker-compose.yml')) {
      return { ok: true, status: 200, headers, text: async () => COMPOSE_GENERIC };
    }
    if (url.includes('/assets/')) {
      return {
        ok: true,
        status: 200,
        headers,
        arrayBuffer: async () => new TextEncoder().encode('<svg></svg>').buffer,
      };
    }
    return { ok: false, status: 404, headers, text: async () => 'not found' };
  }
}

function makeStore(fetchImpl = new FakeFetch(), options = {}) {
  const root = tempRoot('cabana-store-');
  const store = new StoreService({
    storeUrl: INDEX_URL,
    storeDir: path.join(root, 'store'),
    ttlMs: 60_000,
    fetchImpl: fetchImpl.fetch.bind(fetchImpl),
    logger: silence,
    ...options,
  });
  return { store, root, fetchImpl, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('store index is fetched once, cached, and relative base URLs resolve correctly', async (t) => {
  const ctx = makeStore();
  t.after(() => ctx.cleanup());

  const index = await ctx.store.getIndex();
  assert.equal(index.version, 2);
  assert.equal(index.apps.length, 3);
  const multi = index.apps.find((a) => a.id === 'com.example.multi');
  assert.equal(multi.icon, `${BASE}/apps/com.example.multi/assets/icon.svg`);
  assert.equal(multi.composeUrl, `${BASE}/apps/com.example.multi/docker-compose.yml`);
  assert.equal(multi.metaUrl, `${BASE}/apps/com.example.multi/meta.json`);
  assert.equal(index.updatedAt, INDEX.updated_at);
  assert.equal(ctx.fetchImpl.calls.length, 1);

  const again = await ctx.store.getIndex();
  assert.equal(again.apps.length, 3);
  assert.equal(ctx.fetchImpl.calls.length, 1);

  const forced = await ctx.store.getIndex({ force: true });
  assert.equal(forced.stale, false);
  assert.equal(ctx.fetchImpl.calls.length, 2);
});

test('store filters by search, category and architecture', async (t) => {
  const ctx = makeStore();
  t.after(() => ctx.cleanup());
  const index = await ctx.store.getIndex();

  assert.deepEqual(
    ctx.store.listApps(index, { arch: 'amd64' }).map((a) => a.id),
    ['com.example.multi', 'com.example.amdonly'],
  );
  assert.deepEqual(
    ctx.store.listApps(index, { arch: 'arm64' }).map((a) => a.id),
    ['com.example.multi', 'com.example.armed'],
  );
  assert.equal(ctx.store.listApps(index, { arch: 'all' }).length, 3);
  assert.deepEqual(
    ctx.store.listApps(index, { arch: 'all', category: 'Networking' }).map((a) => a.id),
    ['com.example.multi'],
  );
  assert.deepEqual(
    ctx.store.listApps(index, { arch: 'all', query: 'x86' }).map((a) => a.id),
    ['com.example.amdonly'],
  );
  assert.deepEqual(
    ctx.store.listApps(index, { arch: 'all', query: 'EXAMPLE DEV' }).map((a) => a.id),
    ['com.example.multi'],
  );
  const cats = ctx.store.categories(index, { arch: 'amd64' });
  assert.deepEqual(cats.find((c) => c.id === 'media').count, 1);
});

test('architecture-specific compose files are preferred and 404 falls back', async (t) => {
  const ctx = makeStore();
  t.after(() => ctx.cleanup());
  const index = await ctx.store.getIndex();

  const armed = index.apps.find((a) => a.id === 'com.example.armed');
  const armCompose = await ctx.store.getCompose(armed, 'arm64');
  assert.match(armCompose.text, /example\/app:arm64/);
  assert.equal(armCompose.usedArchVariant, true);

  const multi = index.apps.find((a) => a.id === 'com.example.multi');
  const fallback = await ctx.store.getCompose(multi, 'arm64');
  assert.match(fallback.text, /example\/app:1/);
  assert.equal(fallback.usedArchVariant, false);

  const cached = await ctx.store.getCompose(multi, 'arm64');
  assert.equal(cached.text, fallback.text);
});

test('metadata and screenshots resolve to absolute store URLs and proxied assets cache', async (t) => {
  const ctx = makeStore();
  t.after(() => ctx.cleanup());
  const index = await ctx.store.getIndex();
  const entry = index.apps.find((a) => a.id === 'com.example.multi');
  const app = await ctx.store.getApp(index, entry.id);
  assert.equal(app.description, 'A useful test app.');
  assert.equal(app.screenshots[0], `${BASE}/apps/com.example.multi/assets/shot-1.webp`);
  assert.equal(app.tips.before_install, 'Read this first.');
  assert.equal(app.website, 'https://example.com');

  const asset = await ctx.store.fetchAsset('/apps/com.example.multi/assets/icon.svg');
  assert.equal(asset.contentType, 'image/svg+xml');
  assert.match(asset.body.toString(), /<svg/);
  const before = ctx.fetchImpl.calls.length;
  const cached = await ctx.store.fetchAsset('/apps/com.example.multi/assets/icon.svg');
  assert.equal(cached.contentType, 'image/svg+xml');
  assert.equal(ctx.fetchImpl.calls.length, before);

  await assert.rejects(() => ctx.store.fetchAsset('/etc/passwd'), /Invalid store asset path/);
  await assert.rejects(() => ctx.store.fetchAsset('/apps/../secret'), /Invalid store asset path/);
});

test('stale cache is served when the store becomes unreachable', async (t) => {
  const first = makeStore();
  t.after(() => first.cleanup());
  await first.store.getIndex();

  const fetchImpl = new FakeFetch();
  fetchImpl.fail = true;
  const store = new StoreService({
    storeUrl: INDEX_URL,
    storeDir: path.join(first.root, 'store'),
    ttlMs: 0,
    fetchImpl: fetchImpl.fetch.bind(fetchImpl),
    logger: silence,
  });
  const index = await store.getIndex();
  assert.equal(index.stale, true);
  assert.equal(index.warning.includes('cached'), true);
  assert.equal(index.apps.length, 3);
});

test('untrusted absolute store URLs are rejected', async (t) => {
  const fetchImpl = new FakeFetch();
  const original = fetchImpl.fetch.bind(fetchImpl);
  fetchImpl.fetch = async (url, options) => {
    if (url === INDEX_URL) {
      const bad = JSON.parse(JSON.stringify(INDEX));
      bad.apps[0].icon = 'https://evil.example/icon.svg';
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(bad) };
    }
    return original(url, options);
  };
  const ctx = makeStore(fetchImpl);
  t.after(() => ctx.cleanup());
  await assert.rejects(() => ctx.store.getIndex(), /unexpected URL/i);
});

test('missing app metadata falls back gracefully', async (t) => {
  const fetchImpl = new FakeFetch();
  const original = fetchImpl.fetch.bind(fetchImpl);
  fetchImpl.fetch = async (url, options) => {
    if (url.endsWith('/meta.json')) return { ok: false, status: 404, headers: { get: () => null }, text: async () => 'no' };
    return original(url, options);
  };
  const ctx = makeStore(fetchImpl);
  t.after(() => ctx.cleanup());
  const index = await ctx.store.getIndex();
  const entry = index.apps.find((a) => a.id === 'com.example.multi');
  const app = await ctx.store.getApp(index, entry.id);
  assert.equal(app.description, '');
  assert.deepEqual(app.screenshots, []);
});
