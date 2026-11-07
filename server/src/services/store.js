import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../errors.js';

export const DEFAULT_STORE_BASE = 'https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@gh-pages';

function atomicWrite(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  const tmp = path.join(dir, `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export class StoreService {
  constructor({ storeUrl, storeDir, ttlMs = 15 * 60 * 1000, fetchImpl = globalThis.fetch, logger = console }) {
    this.storeUrl = storeUrl;
    this.baseUrl = DEFAULT_STORE_BASE;
    this.storeDir = storeDir;
    this.ttlMs = ttlMs;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.indexFile = path.join(storeDir, 'index.json');
    this.metaFile = path.join(storeDir, 'index.meta.json');
    this._memo = null;
  }

  async fetchText(url, { etag, timeout = 25_000 } = {}) {
    const headers = {
      accept: 'application/json, text/yaml, text/plain, */*',
      'user-agent': 'Cabana/1.0 (personal cloud server)',
    };
    if (etag) headers['if-none-match'] = etag;
    let res;
    try {
      res = await this.fetchImpl(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new AppError(502, 'store_unreachable', `Could not reach the official CasaOS app store: ${error.message}`);
    }
    if (res.status === 304) return { notModified: true, etag: res.headers.get('etag') };
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.url = url;
      throw err;
    }
    return { text: await res.text(), etag: res.headers.get('etag'), contentType: res.headers.get('content-type') };
  }

  normalizeIndex(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.apps)) {
      throw new AppError(502, 'invalid_store', 'The app store index did not contain an apps array.');
    }
    const baseUrl = (typeof raw.base_url === 'string' ? raw.base_url : this.baseUrl).replace(/\/$/, '');
    this.baseUrl = baseUrl;
    const seen = new Set();
    const apps = [];
    for (const app of raw.apps) {
      if (!app || typeof app.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(app.id)) continue;
      if (seen.has(app.id)) continue;
      seen.add(app.id);
      apps.push({
        id: app.id,
        title: String(app.title || app.id),
        tagline: String(app.tagline || ''),
        category: String(app.category || 'Other'),
        categories: Array.isArray(app.categories) ? app.categories.map(String) : [],
        author: String(app.author || ''),
        developer: String(app.developer || ''),
        architectures: Array.isArray(app.architectures) ? app.architectures.map(String) : [],
        icon: app.icon ? this.resolveUrl(app.icon) : null,
        iconPath: app.icon || null,
        thumbnail: app.thumbnail ? this.resolveUrl(app.thumbnail) : null,
        thumbnailPath: app.thumbnail || null,
        composePath: app.compose_url || null,
        composeUrl: app.compose_url ? this.resolveUrl(app.compose_url) : null,
        metaUrl: app.meta_url ? this.resolveUrl(app.meta_url) : null,
        contentHash: app.content_hash || null,
        version: app.version || null,
      });
    }
    return {
      version: raw.version ?? 2,
      appCount: apps.length,
      updatedAt: raw.updated_at || null,
      baseUrl,
      apps,
    };
  }

  resolveUrl(value) {
    const base = String(this.baseUrl || DEFAULT_STORE_BASE).replace(/\/$/, '');
    const raw = String(value);
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const baseUrl = new URL(`${base}/`);
      if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
        throw new AppError(502, 'invalid_store_url', `The app store returned an unexpected URL: ${raw}`);
      }
      return url.toString();
    }
    const suffix = raw.startsWith('/') ? raw : `/${raw}`;
    if (suffix.includes('..')) {
      throw new AppError(502, 'invalid_store_url', 'The app store returned an unsafe relative URL.');
    }
    return `${base}${suffix}`;
  }

  resolveRelative(value) {
    const base = String(this.baseUrl || DEFAULT_STORE_BASE).replace(/\/$/, '');
    if (/^https?:\/\//i.test(String(value))) return String(value);
    const suffix = String(value).startsWith('/') ? String(value) : `/${value}`;
    return `${base}${suffix}`;
  }

  async getIndex({ force = false } = {}) {
    const meta = readJson(this.metaFile, null);
    const cached = readJson(this.indexFile, null);
    const fresh = meta?.fetchedAt && Date.now() - Date.parse(meta.fetchedAt) < this.ttlMs;
    if (!force && cached && fresh) {
      if (!this._memo) this._memo = this.normalizeIndex(cached);
      return { ...this._memo, fetchedAt: meta.fetchedAt, stale: false, cached: true };
    }

    try {
      const result = await this.fetchText(this.storeUrl, { etag: force ? undefined : meta?.etag });
      if (result.notModified && cached) {
        const fetchedAt = new Date().toISOString();
        atomicWrite(this.metaFile, JSON.stringify({ ...meta, fetchedAt, etag: result.etag || meta.etag }));
        this._memo = this.normalizeIndex(cached);
        return { ...this._memo, fetchedAt, stale: false, cached: true };
      }
      const parsed = JSON.parse(result.text);
      const normalized = this.normalizeIndex(parsed);
      const fetchedAt = new Date().toISOString();
      atomicWrite(this.indexFile, JSON.stringify(parsed));
      atomicWrite(this.metaFile, JSON.stringify({ fetchedAt, etag: result.etag || null, baseUrl: this.baseUrl }));
      this._memo = normalized;
      return { ...normalized, fetchedAt, stale: false, cached: false };
    } catch (error) {
      if (cached) {
        this._memo = this.normalizeIndex(cached);
        this.logger.warn?.(`store refresh failed, serving cached index: ${error.message}`);
        return {
          ...this._memo,
          fetchedAt: meta?.fetchedAt || null,
          stale: true,
          cached: true,
          warning: 'The official app store could not be refreshed; showing the last cached index.',
        };
      }
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'store_unreachable', `Could not load the official CasaOS app store: ${error.message}`);
    }
  }

  listApps(index, { query = '', category = '', arch = '', includeIncompatible = false } = {}) {
    const hostArch = process.arch === 'x64' ? 'amd64' : process.arch;
    let apps = index.apps;
    if (arch && arch !== 'all') {
      apps = apps.filter((app) => app.architectures.includes(arch));
    } else if (arch !== 'all' && !includeIncompatible) {
      apps = apps.filter((app) => app.architectures.includes(hostArch));
    }
    if (category) {
      const wanted = String(category).toLowerCase();
      apps = apps.filter(
        (app) =>
          app.categories.some((c) => c.toLowerCase() === wanted) ||
          app.category.toLowerCase() === wanted ||
          app.category.toLowerCase().replace(/\s+/g, '-') === wanted,
      );
    }
    const q = String(query).trim().toLowerCase();
    if (q) {
      apps = apps.filter((app) =>
        [app.title, app.tagline, app.id, app.developer, app.author, app.category]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return apps;
  }

  categories(index, { arch = '' } = {}) {
    const apps = this.listApps(index, { arch, includeIncompatible: arch === 'all' });
    const map = new Map();
    for (const app of apps) {
      const name = app.category || 'Other';
      const id = name.toLowerCase().replace(/\s+/g, '-');
      map.set(id, { id, name, count: (map.get(id)?.count || 0) + 1 });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  metaPath(appId) {
    return path.join(this.storeDir, 'meta', `${appId}.json`);
  }

  async getMeta(app, { force = false } = {}) {
    if (!app.metaUrl) return {};
    const file = this.metaPath(app.id);
    const cached = readJson(file, null);
    if (!force && cached?.data) return cached.data;
    try {
      const result = await this.fetchText(app.metaUrl);
      const data = JSON.parse(result.text);
      atomicWrite(file, JSON.stringify({ fetchedAt: new Date().toISOString(), data }));
      return data;
    } catch (error) {
      if (cached?.data) return cached.data;
      this.logger.warn?.(`store meta unavailable for ${app.id}: ${error.message}`);
      return {};
    }
  }

  composePath(appId, arch) {
    return path.join(this.storeDir, 'compose', `${appId}.${arch}.yml`);
  }

  async getCompose(app, arch, { force = false } = {}) {
    if (!app.composeUrl) throw new AppError(502, 'store_invalid_app', 'The store entry has no compose file.');
    const cacheFile = this.composePath(app.id, arch);
    const cached = readJson(`${cacheFile}.json`, null);
    let text = null;
    if (!force && cached && fs.existsSync(cacheFile) && cached.contentHash === app.contentHash) {
      text = fs.readFileSync(cacheFile, 'utf8');
      return { text, usedArchVariant: cached.usedArchVariant, url: cached.url };
    }

    const archUrl = this.resolveRelative(
      String(app.composePath).replace(/docker-compose\.ya?ml$/, `docker-compose.${arch}.yml`),
    );
    let usedArchVariant = false;
    let url = archUrl;
    try {
      const result = await this.fetchText(archUrl);
      text = result.text;
      usedArchVariant = true;
    } catch (error) {
      if (!(error.status === 404 || error.status === 403)) {
        // jsDelivr returns 403 for paths that do not exist in some cases; fall back for both.
        if (!cached) {
          // still attempt the base compose below
        }
      }
      url = app.composeUrl;
    }
    if (!text) {
      try {
        const result = await this.fetchText(app.composeUrl);
        text = result.text;
      } catch (error) {
        if (cached && fs.existsSync(cacheFile)) {
          text = fs.readFileSync(cacheFile, 'utf8');
          usedArchVariant = cached.usedArchVariant;
          url = cached.url;
        } else {
          throw new AppError(502, 'store_compose_unavailable', `Could not download the app's Compose file: ${error.message}`);
        }
      }
    }
    atomicWrite(cacheFile, text);
    atomicWrite(`${cacheFile}.json`, JSON.stringify({ fetchedAt: new Date().toISOString(), contentHash: app.contentHash, usedArchVariant, url }));
    return { text, usedArchVariant, url };
  }

  async getApp(index, id) {
    const app = index.apps.find((a) => a.id === id);
    if (!app) throw new AppError(404, 'store_app_not_found', 'That app is not in the official store index.');
    const meta = await this.getMeta(app);
    return {
      ...app,
      description: meta.description || '',
      screenshots: Array.isArray(meta.screenshot_link)
        ? meta.screenshot_link.map((rel) => this.resolveRelative(rel))
        : [],
      screenshotsPaths: Array.isArray(meta.screenshot_link) ? meta.screenshot_link : [],
      tips: meta.tips || {},
      website: meta.website || '',
      repo: meta.repo || '',
      docs: meta.docs || '',
      updateAt: meta.update_at || null,
      releaseNote: meta.release_note || '',
      minMemory: meta.min_memory || null,
      minImageSize: meta.min_image_size || null,
    };
  }

  async refresh() {
    const index = await this.getIndex({ force: true });
    return index;
  }

  async fetchAsset(relPath) {
    if (typeof relPath !== 'string' || !relPath.startsWith('/apps/') || relPath.includes('..')) {
      throw new AppError(400, 'invalid_asset_path', 'Invalid store asset path.');
    }
    const url = this.resolveRelative(relPath);
    if (!/\/assets\//.test(url) && !/\.(svg|png|jpe?g|webp|gif|avif)$/i.test(url)) {
      throw new AppError(400, 'invalid_asset_path', 'Only store image assets can be proxied.');
    }
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const file = path.join(this.storeDir, 'assets', hash);
    const metaFile = `${file}.json`;
    const cachedMeta = readJson(metaFile, null);
    if (cachedMeta && fs.existsSync(file)) {
      return { body: await fsp.readFile(file), contentType: cachedMeta.contentType };
    }
    const res = await this.fetchImpl(url, {
      headers: { 'user-agent': 'Cabana/1.0 (personal cloud server)', accept: 'image/*' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new AppError(502, 'store_asset_unavailable', 'Could not download that store image.');
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    if (!/^image\//i.test(contentType)) {
      throw new AppError(502, 'store_asset_invalid', 'The store asset was not an image.');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > 12 * 1024 * 1024) throw new AppError(502, 'store_asset_too_large', 'Store image is too large.');
    atomicWrite(file, buffer);
    atomicWrite(metaFile, JSON.stringify({ contentType, url, fetchedAt: new Date().toISOString() }));
    return { body: buffer, contentType };
  }
}
