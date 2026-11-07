import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { verifyPassword } from '../src/auth.js';
import { getUserCount } from '../src/db.js';
import { makeApp, setupAdmin, csrfHeaders } from './helpers.js';

test('first-run setup creates exactly one administrator and closes setup', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);

  let res = await agent.get('/api/setup/status');
  assert.equal(res.status, 200);
  assert.equal(res.body.needsSetup, true);

  res = await agent.get('/api/auth/me');
  assert.equal(res.body.authenticated, false);
  assert.equal(res.body.needsSetup, true);

  res = await agent.post('/api/setup').send({ username: 'ab', password: 'longenough1' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_username');

  res = await agent.post('/api/setup').send({ username: 'admin', password: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'weak_password');

  res = await agent.post('/api/setup').send({ username: 'admin', password: 'correct-horse-123' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.username, 'admin');
  assert.ok(res.body.csrfToken.length >= 32);
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /^cabana\.sid=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Secure/);

  assert.equal(getUserCount(ctx.db), 1);
  const row = ctx.db.prepare('SELECT * FROM users').get();
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes('correct-horse-123'));
  assert.equal(await verifyPassword('correct-horse-123', row.password_hash), true);
  assert.equal(await verifyPassword('wrong', row.password_hash), false);

  res = await request(ctx.app).post('/api/setup').send({ username: 'another', password: 'correct-horse-123' });
  assert.equal(res.status, 409);
  assert.equal(getUserCount(ctx.db), 1);

  res = await agent.get('/api/setup/status');
  assert.equal(res.body.needsSetup, false);

  res = await agent.get('/api/auth/me');
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.user.username, 'admin');
  assert.ok(res.body.csrfToken);
});

test('login, logout, CSRF protection and session storage', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  const { csrf } = await setupAdmin(agent);

  let res = await agent.post('/api/auth/logout').send({});
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'csrf');

  res = await agent.post('/api/auth/logout').set(csrfHeaders(csrf)).send({});
  assert.equal(res.status, 200);
  assert.match(res.headers['set-cookie'][0], /Max-Age=0/);

  res = await agent.get('/api/auth/me');
  assert.equal(res.body.authenticated, false);

  res = await agent.post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'invalid_credentials');

  res = await agent.post('/api/auth/login').send({ username: 'missing', password: 'wrong-password' });
  assert.equal(res.status, 401);

  res = await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-123' });
  assert.equal(res.status, 200);
  const loginCsrf = res.body.csrfToken;
  const token = res.headers['set-cookie'][0].split(';')[0].split('=')[1];
  assert.ok(token.length > 30);
  const sessionRows = ctx.db.prepare('SELECT * FROM sessions').all();
  assert.ok(sessionRows.length >= 1);
  for (const row of sessionRows) {
    assert.notEqual(row.id, token);
    assert.match(row.id, /^[a-f0-9]{64}$/);
  }

  res = await agent.get('/api/auth/me');
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.csrfToken, loginCsrf);

  res = await agent.patch('/api/settings').send({ puid: 1001 });
  assert.equal(res.status, 403);

  res = await agent.patch('/api/settings').set(csrfHeaders(loginCsrf)).send({ puid: 1001 });
  assert.equal(res.status, 200);
  assert.equal(res.body.settings.puid, 1001);

  res = await agent.post('/api/auth/logout').set(csrfHeaders(loginCsrf)).send({});
  assert.equal(res.status, 200);
  res = await agent.get('/api/auth/me');
  assert.equal(res.body.authenticated, false);
});

test('same-origin guard rejects cross-origin mutations but allows same origin', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const agent = request.agent(ctx.app);
  const { csrf } = await setupAdmin(agent);

  let res = await agent
    .patch('/api/settings')
    .set('Origin', 'https://evil.example')
    .set(csrfHeaders(csrf))
    .send({ puid: 1002 });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'origin');

  res = await agent
    .patch('/api/settings')
    .set('Origin', 'http://127.0.0.1')
    .set('Host', '127.0.0.1')
    .set(csrfHeaders(csrf))
    .send({ puid: 1002 });
  assert.equal(res.status, 200);

  res = await agent.get('/api/auth/me').set('Origin', 'https://evil.example');
  assert.equal(res.status, 200);
});

test('login attempts are rate limited', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const setupAgent = request.agent(ctx.app);
  await setupAdmin(setupAgent);
  const agent = request.agent(ctx.app);

  for (let i = 0; i < 6; i += 1) {
    const res = await agent.post('/api/auth/login').send({ username: 'admin', password: `wrong-${i}-password` });
    assert.equal(res.status, 401);
  }
  const blocked = await agent.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-123' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'rate_limited');
});

test('password change verifies the old password and invalidates other sessions', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  const first = request.agent(ctx.app);
  const second = request.agent(ctx.app);
  const { csrf } = await setupAdmin(first);
  let res = await second.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-123' });
  assert.equal(res.status, 200);

  res = await first.post('/api/settings/password').set(csrfHeaders(csrf)).send({ currentPassword: 'nope', newPassword: 'new-password-456' });
  assert.equal(res.status, 403);

  res = await first.post('/api/settings/password').set(csrfHeaders(csrf)).send({ currentPassword: 'correct-horse-123', newPassword: 'short' });
  assert.equal(res.status, 400);

  res = await first.post('/api/settings/password').set(csrfHeaders(csrf)).send({ currentPassword: 'correct-horse-123', newPassword: 'new-password-456' });
  assert.equal(res.status, 200);

  res = await second.get('/api/auth/me');
  assert.equal(res.body.authenticated, false);

  res = await first.get('/api/auth/me');
  assert.equal(res.body.authenticated, true);

  res = await second.post('/api/auth/login').send({ username: 'admin', password: 'correct-horse-123' });
  assert.equal(res.status, 401);
  res = await second.post('/api/auth/login').send({ username: 'admin', password: 'new-password-456' });
  assert.equal(res.status, 200);
});
