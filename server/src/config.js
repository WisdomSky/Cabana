import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const DEFAULT_STATE_DIR = '/var/lib/cabana';
const DEFAULT_DATA_DIR = '/DATA';

function artifactVersion() {
  try {
    const value = fs.readFileSync(path.resolve(process.cwd(), 'VERSION'), 'utf8').trim();
    if (/^[0-9A-Za-z._+-]{1,40}$/.test(value)) return value;
  } catch {
    /* not running from a release bundle */
  }
  return 'dev';
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(overrides = {}) {
  const stateDir = path.resolve(overrides.stateDir ?? process.env.CABANA_STATE_DIR ?? DEFAULT_STATE_DIR);
  const dataDir = path.resolve(overrides.dataDir ?? process.env.CABANA_DATA_DIR ?? DEFAULT_DATA_DIR);
  return {
    version: overrides.version ?? process.env.CABANA_VERSION ?? artifactVersion(),
    port: overrides.port ?? envInt('CABANA_PORT', envInt('PORT', 80)),
    host: overrides.host ?? process.env.CABANA_HOST ?? '0.0.0.0',
    stateDir,
    dataDir,
    dbPath: overrides.dbPath ?? path.join(stateDir, 'cabana.db'),
    appsDir: overrides.appsDir ?? path.join(stateDir, 'apps'),
    storeDir: overrides.storeDir ?? path.join(stateDir, 'store'),
    tmpDir: overrides.tmpDir ?? path.join(stateDir, 'tmp'),
    webDir: overrides.webDir ?? path.resolve(process.env.CABANA_WEB_DIR ?? path.join(process.cwd(), 'web', 'dist')),
    storeUrl: overrides.storeUrl ?? process.env.CABANA_STORE_URL ?? 'https://cdn.jsdelivr.net/gh/IceWhaleTech/CasaOS-AppStore@gh-pages/index.json',
    storeCacheTtlMs: overrides.storeCacheTtlMs ?? envInt('CABANA_STORE_TTL', 900) * 1000,
    sessionTtlMs: overrides.sessionTtlMs ?? envInt('CABANA_SESSION_TTL', 7 * 24 * 3600) * 1000,
    cookieSecure: overrides.cookieSecure ?? process.env.CABANA_COOKIE_SECURE === '1',
    trustProxy: overrides.trustProxy ?? process.env.CABANA_TRUST_PROXY === '1',
    hostname: overrides.hostname ?? os.hostname(),
    expectDocker: overrides.expectDocker ?? true,
    log: overrides.log ?? console,
  };
}

export default loadConfig;
