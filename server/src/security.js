import { COOKIE_NAME, parseCookies, resolveSession } from './auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function attachSession(db) {
  return (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = resolveSession(db, cookies[COOKIE_NAME]);
    if (session) {
      req.session = session;
      req.userId = session.user_id;
    }
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.session) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required.' } });
  }
  next();
}

export function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.session) return next();
  const header = req.get('x-csrf-token');
  if (!header || header.length < 20) {
    return res.status(403).json({ error: { code: 'csrf', message: 'Missing or invalid CSRF token.' } });
  }
  const a = Buffer.from(String(header));
  const b = Buffer.from(String(req.session.csrf_token));
  if (a.length !== b.length || !a.equals(b)) {
    return res.status(403).json({ error: { code: 'csrf', message: 'Missing or invalid CSRF token.' } });
  }
  next();
}

export function sameOriginGuard(trustProxy = false) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return res.status(403).json({ error: { code: 'origin', message: 'Invalid request origin.' } });
    }
    const host = trustProxy && req.get('x-forwarded-host') ? req.get('x-forwarded-host').split(',')[0].trim() : req.get('host');
    if (!host || originHost !== host) {
      return res.status(403).json({ error: { code: 'origin', message: 'Cross-origin request refused.' } });
    }
    next();
  };
}

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

export class LoginRateLimiter {
  constructor({ maxAttempts = 6, windowMs = 15 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  key(req, username) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `${ip}|${String(username || '').toLowerCase()}`;
  }

  isBlocked(req, username) {
    const entry = this.entries.get(this.key(req, username));
    if (!entry) return false;
    if (entry.resetAt <= Date.now()) {
      this.entries.delete(this.key(req, username));
      return false;
    }
    return entry.count >= this.maxAttempts;
  }

  fail(req, username) {
    const key = this.key(req, username);
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
    }
    entry.count += 1;
    this.entries.set(key, entry);
    if (this.entries.size > 5000) {
      for (const [k, v] of this.entries) if (v.resetAt <= now) this.entries.delete(k);
    }
  }

  reset(req, username) {
    this.entries.delete(this.key(req, username));
  }
}
