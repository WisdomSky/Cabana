import crypto from 'node:crypto';
import { promisify } from 'node:util';
import {
  createSessionRow,
  deleteSessionRow,
  getSessionRow,
  getUserByUsername,
  updateUserPassword,
  deleteUserSessions,
} from './db.js';

const scryptAsync = promisify(crypto.scrypt);

export const COOKIE_NAME = 'cabana.sid';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const N = Number.parseInt(nRaw, 10);
    const r = Number.parseInt(rRaw, 10);
    const p = Number.parseInt(pRaw, 10);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validateUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(username);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSession(db, userId, ttlMs) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  createSessionRow(db, { id: sha256(token), userId, csrfToken, expiresAt });
  return { token, csrfToken, expiresAt };
}

export function resolveSession(db, token) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return getSessionRow(db, sha256(token));
}

export function destroySession(db, token) {
  if (!token) return;
  deleteSessionRow(db, sha256(token));
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function sessionCookie(token, maxAgeSeconds, secure = false) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie(secure = false) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export async function authenticate(db, username, password) {
  if (!validateUsername(username) || typeof password !== 'string') return null;
  const user = getUserByUsername(db, username);
  if (!user) {
    // Spend comparable time to avoid a trivial username oracle.
    await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA');
    return null;
  }
  const ok = await verifyPassword(password, user.password_hash);
  return ok ? user : null;
}

export async function changePassword(db, userId, currentPassword, newPassword) {
  const { getUserById } = await import('./db.js');
  const user = getUserById(db, userId);
  if (!user) return { ok: false, code: 'not_found' };
  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) return { ok: false, code: 'invalid_password' };
  if (!validatePassword(newPassword)) return { ok: false, code: 'weak_password' };
  updateUserPassword(db, userId, await hashPassword(newPassword));
  return { ok: true };
}

export { deleteUserSessions };
