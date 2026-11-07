import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function nowIso() {
  return new Date().toISOString();
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  password_changed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('store', 'custom')),
  store_id TEXT,
  version TEXT,
  compose_path TEXT NOT NULL,
  main_service TEXT,
  scheme TEXT NOT NULL DEFAULT 'http',
  port_map TEXT,
  url_path TEXT NOT NULL DEFAULT '/',
  icon TEXT,
  data_paths TEXT NOT NULL DEFAULT '[]',
  container_names TEXT NOT NULL DEFAULT '[]',
  warnings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_store_id ON apps(store_id) WHERE store_id IS NOT NULL;
`;

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o750 });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export function getUserCount(db) {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
}

export function getUserByUsername(db, username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

export function getUserById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser(db, username, passwordHash) {
  const at = nowIso();
  const info = db
    .prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)')
    .run(username, passwordHash, at);
  return getUserById(db, Number(info.lastInsertRowid) || 1);
}

export function updateUserPassword(db, userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
    .run(passwordHash, nowIso(), userId);
}

export function createSessionRow(db, { id, userId, csrfToken, expiresAt }) {
  const at = nowIso();
  db.prepare(
    'INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, userId, csrfToken, at, expiresAt, at);
}

export function deleteSessionRow(db, id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function deleteUserSessions(db, userId, exceptId = null) {
  if (exceptId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(userId, exceptId);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function getSessionRow(db, id, now = nowIso()) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(id, now);
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, id);
  return row;
}

export function purgeExpiredSessions(db, now = nowIso()) {
  const info = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  return Number(info.changes);
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

export function setSetting(db, key, value, at = nowIso()) {
  db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).run(key, JSON.stringify(value), at);
}

export function allSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function listApps(db) {
  return db.prepare('SELECT * FROM apps ORDER BY created_at ASC').all().map(deserializeApp);
}

export function getApp(db, id) {
  const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
  return row ? deserializeApp(row) : null;
}

export function getAppByStoreId(db, storeId) {
  const row = db.prepare('SELECT * FROM apps WHERE store_id = ?').get(storeId);
  return row ? deserializeApp(row) : null;
}

export function insertApp(db, app) {
  const at = nowIso();
  db.prepare(
    `INSERT INTO apps (id, project, title, source, store_id, version, compose_path, main_service, scheme,
      port_map, url_path, icon, data_paths, container_names, warnings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    app.id,
    app.project,
    app.title,
    app.source,
    app.storeId ?? null,
    app.version ?? null,
    app.composePath,
    app.mainService ?? null,
    app.scheme ?? 'http',
    app.portMap ?? null,
    app.urlPath ?? '/',
    app.icon ?? null,
    JSON.stringify(app.dataPaths ?? []),
    JSON.stringify(app.containerNames ?? []),
    JSON.stringify(app.warnings ?? []),
    at,
    at,
  );
  return getApp(db, app.id);
}

export function deleteApp(db, id) {
  db.prepare('DELETE FROM apps WHERE id = ?').run(id);
}

export function deserializeApp(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  return {
    ...row,
    dataPaths: parse(row.data_paths, []),
    containerNames: parse(row.container_names, []),
    warnings: parse(row.warnings, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    composePath: row.compose_path,
    mainService: row.main_service,
    portMap: row.port_map,
    urlPath: row.url_path || '/',
    storeId: row.store_id,
  };
}
