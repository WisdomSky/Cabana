import express from 'express';
import { asyncHandler } from '../errors.js';
import {
  authenticate,
  changePassword,
  clearCookie,
  createSession,
  destroySession,
  hashPassword,
  sessionCookie,
  validatePassword,
  validateUsername,
  deleteUserSessions,
} from '../auth.js';
import { COOKIE_NAME, parseCookies } from '../auth.js';
import { createUser, getUserById, getUserCount } from '../db.js';
import { LoginRateLimiter } from '../security.js';

export function authRoutes({ db, config, limiter = new LoginRateLimiter(), setupLimiter = new LoginRateLimiter({ maxAttempts: 10 }) }) {
  const router = express.Router();

  router.get('/setup/status', (req, res) => {
    res.json({ needsSetup: getUserCount(db) === 0 });
  });

  router.post(
    '/setup',
    asyncHandler(async (req, res) => {
      if (getUserCount(db) > 0) {
        return res.status(409).json({ error: { code: 'setup_complete', message: 'Cabana has already been set up.' } });
      }
      if (setupLimiter.isBlocked(req, 'setup')) {
        return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many setup attempts. Try again later.' } });
      }
      const { username, password } = req.body || {};
      if (!validateUsername(username)) {
        setupLimiter.fail(req, 'setup');
        return res.status(400).json({
          error: {
            code: 'invalid_username',
            message: 'Username must be 3-32 characters using letters, numbers, dots, dashes or underscores.',
          },
        });
      }
      if (!validatePassword(password)) {
        setupLimiter.fail(req, 'setup');
        return res.status(400).json({ error: { code: 'weak_password', message: 'Password must be 8-200 characters.' } });
      }
      let user;
      try {
        user = createUser(db, username, await hashPassword(password));
      } catch (error) {
        if (/UNIQUE|constraint/i.test(error.message)) {
          return res.status(409).json({ error: { code: 'setup_complete', message: 'Cabana has already been set up.' } });
        }
        throw error;
      }
      const session = createSession(db, user.id, config.sessionTtlMs);
      res.cookie(COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(config.cookieSecure || req.secure),
        maxAge: config.sessionTtlMs,
        path: '/',
      });
      res.status(201).json({
        user: { username: user.username },
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      });
    }),
  );

  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body || {};
      if (limiter.isBlocked(req, username)) {
        return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many login attempts. Try again in a few minutes.' } });
      }
      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: { code: 'invalid_credentials', message: 'Username and password are required.' } });
      }
      const user = await authenticate(db, username, password);
      if (!user) {
        limiter.fail(req, username);
        return res.status(401).json({ error: { code: 'invalid_credentials', message: 'Invalid username or password.' } });
      }
      limiter.reset(req, username);
      const session = createSession(db, user.id, config.sessionTtlMs);
      res.cookie(COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: Boolean(config.cookieSecure || req.secure),
        maxAge: config.sessionTtlMs,
        path: '/',
      });
      res.json({ user: { username: user.username }, csrfToken: session.csrfToken, expiresAt: session.expiresAt });
    }),
  );

  router.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const cookies = parseCookies(req.headers.cookie);
      destroySession(db, cookies[COOKIE_NAME]);
      res.setHeader('Set-Cookie', clearCookie(Boolean(config.cookieSecure || req.secure)));
      res.json({ ok: true });
    }),
  );

  router.get('/auth/me', (req, res) => {
    if (!req.session) return res.json({ authenticated: false, needsSetup: getUserCount(db) === 0 });
    const user = getUserById(db, req.session.user_id);
    if (!user) return res.json({ authenticated: false, needsSetup: getUserCount(db) === 0 });
    res.json({
      authenticated: true,
      user: { username: user.username },
      csrfToken: req.session.csrf_token,
      expiresAt: req.session.expires_at,
    });
  });

  return router;
}
