import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { FileService } from '../src/services/files.js';
import { SettingsService } from '../src/services/settings.js';
import { openDatabase } from '../src/db.js';
import { makeApp, setupAdmin, csrfHeaders, tempRoot } from './helpers.js';

function makeFiles() {
  const root = tempRoot('cabana-files-');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(dataDir, 'docs', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'docs', 'readme.txt'), 'hello cabana');
  fs.writeFileSync(path.join(dataDir, 'root.txt'), 'root file');
  const db = openDatabase(path.join(root, 'files.db'));
  const settings = new SettingsService({ db, dataDir });
  const files = new FileService({ settings, tmpDir: path.join(root, 'tmp') });
  return {
    root,
    dataDir,
    files,
    db,
    cleanup() {
      try {
        db.close();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

test('file service browses, creates, renames, uploads, downloads and deletes', async (t) => {
  const ctx = makeFiles();
  t.after(() => ctx.cleanup());

  let listing = await ctx.files.list('0', '');
  assert.deepEqual(listing.items.map((i) => i.name).sort(), ['docs', 'root.txt']);
  assert.equal(listing.items.find((i) => i.name === 'docs').type, 'directory');

  listing = await ctx.files.list('0', 'docs');
  assert.deepEqual(listing.items.map((i) => i.name), ['nested', 'readme.txt']);

  await ctx.files.mkdir('0', '', 'new-folder');
  assert.ok(fs.statSync(path.join(ctx.dataDir, 'new-folder')).isDirectory());
  await assert.rejects(() => ctx.files.mkdir('0', '', 'new-folder'), /already exists/);

  await ctx.files.rename('0', 'root.txt', 'renamed.txt');
  assert.ok(fs.existsSync(path.join(ctx.dataDir, 'renamed.txt')));
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'root.txt')));

  const download = await ctx.files.downloadPath('0', 'docs/readme.txt');
  assert.equal(download.name, 'readme.txt');
  assert.equal(fs.readFileSync(download.abs, 'utf8'), 'hello cabana');
  await assert.rejects(() => ctx.files.downloadPath('0', 'docs'), /Only files/);

  const temp = path.join(ctx.root, 'temp-upload');
  fs.writeFileSync(temp, 'uploaded');
  const uploaded = await ctx.files.upload('0', 'docs', { originalname: 'upload.txt', path: temp });
  assert.equal(uploaded.name, 'upload.txt');
  assert.equal(fs.readFileSync(path.join(ctx.dataDir, 'docs', 'upload.txt'), 'utf8'), 'uploaded');
  const temp2 = path.join(ctx.root, 'temp-upload-2');
  fs.writeFileSync(temp2, 'again');
  await assert.rejects(() => ctx.files.upload('0', 'docs', { originalname: 'upload.txt', path: temp2 }), /already exists/);
  assert.ok(fs.existsSync(temp2), 'failed upload temp file is left for the route layer to clean up');

  await assert.rejects(() => ctx.files.remove('0', 'docs', false), /not empty/);
  await ctx.files.remove('0', 'docs/upload.txt', false);
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'docs', 'upload.txt')));
  await ctx.files.remove('0', 'new-folder', true);
  assert.ok(!fs.existsSync(path.join(ctx.dataDir, 'new-folder')));
  await assert.rejects(() => ctx.files.remove('0', '', true), /Refusing/);
});

test('file service refuses traversal and symlink escapes', async (t) => {
  const ctx = makeFiles();
  t.after(() => ctx.cleanup());
  const outside = path.join(ctx.root, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.symlinkSync(outside, path.join(ctx.dataDir, 'escape-link'));
  fs.symlinkSync(path.join(ctx.dataDir, 'docs'), path.join(ctx.dataDir, 'inside-link'));

  for (const bad of ['..', '../outside', 'docs/../../outside', '/etc/passwd', 'docs/../../../etc', 'a/../../b']) {
    await assert.rejects(() => ctx.files.list('0', bad), (error) => error.status === 400 || error.status === 403, bad);
  }
  await assert.rejects(() => ctx.files.list('0', 'escape-link'), (error) => error.status === 403);
  await assert.rejects(() => ctx.files.downloadPath('0', 'escape-link/secret.txt'), (error) => error.status === 403);

  const listing = await ctx.files.list('0', '');
  const escape = listing.items.find((i) => i.name === 'escape-link');
  assert.equal(escape.escape, true);
  assert.equal(escape.symlinkTarget, null);
  const inside = listing.items.find((i) => i.name === 'inside-link');
  assert.equal(inside.escape, false);

  const insideListing = await ctx.files.list('0', 'inside-link');
  assert.ok(insideListing.items.some((i) => i.name === 'readme.txt'));

  await assert.rejects(() => ctx.files.mkdir('0', 'escape-link', 'pwn'), (error) => error.status === 403);
  await assert.rejects(() => ctx.files.rename('0', 'escape-link', 'moved'), (error) => error.status === 403);
});

test('files API enforces auth, CSRF, upload and download', async (t) => {
  const ctx = makeApp();
  t.after(() => ctx.cleanup());
  fs.writeFileSync(path.join(ctx.dataDir, 'api-file.txt'), 'api content');

  let res = await request(ctx.app).get('/api/files?root=0&path=');
  assert.equal(res.status, 401);

  const agent = request.agent(ctx.app);
  const { csrf } = await setupAdmin(agent);

  res = await agent.get('/api/files/roots');
  assert.equal(res.status, 200);
  assert.equal(res.body.roots[0].path, ctx.dataDir);

  res = await agent.get('/api/files?root=0&path=');
  assert.equal(res.status, 200);
  assert.ok(res.body.items.some((i) => i.name === 'api-file.txt'));

  res = await agent.get('/api/files/download?root=0&path=api-file.txt');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'api content');
  assert.match(res.headers['content-disposition'], /attachment/);

  res = await agent.post('/api/files/upload?root=0&path=').attach('file', Buffer.from('uploaded via api'), 'api-upload.txt');
  assert.equal(res.status, 403);

  res = await agent
    .post('/api/files/upload?root=0&path=')
    .set(csrfHeaders(csrf))
    .attach('file', Buffer.from('uploaded via api'), 'api-upload.txt');
  assert.equal(res.status, 201);
  assert.equal(fs.readFileSync(path.join(ctx.dataDir, 'api-upload.txt'), 'utf8'), 'uploaded via api');

  res = await agent.post('/api/files/mkdir').set(csrfHeaders(csrf)).send({ root: '0', path: '', name: 'api-folder' });
  assert.equal(res.status, 201);
  res = await agent.post('/api/files/rename').set(csrfHeaders(csrf)).send({ root: '0', path: 'api-upload.txt', name: 'api-renamed.txt' });
  assert.equal(res.status, 200);
  assert.ok(fs.existsSync(path.join(ctx.dataDir, 'api-renamed.txt')));
  res = await agent.post('/api/files/delete').set(csrfHeaders(csrf)).send({ root: '0', path: 'api-folder', recursive: true });
  assert.equal(res.status, 200);

  res = await agent.get('/api/files?root=0&path=..%2Fetc');
  assert.equal(res.status, 400);
  res = await agent.get('/api/files?root=0&path=%2Fetc%2Fpasswd');
  assert.equal(res.status, 400);

  const outside = path.join(ctx.root, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret'), 'no');
  fs.symlinkSync(outside, path.join(ctx.dataDir, 'api-escape'));
  res = await agent.get('/api/files?root=0&path=api-escape');
  assert.equal(res.status, 403);
  res = await agent.get('/api/files/download?root=0&path=api-escape%2Fsecret');
  assert.equal(res.status, 403);

  res = await agent.post('/api/files/delete').set(csrfHeaders(csrf)).send({ root: '0', path: '', recursive: true });
  assert.equal(res.status, 400);
});
