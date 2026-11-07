import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../errors.js';

function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function safeName(name) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
  return Buffer.byteLength(name, 'utf8') <= 255;
}

export class FileService {
  constructor({ settings, tmpDir }) {
    this.settings = settings;
    this.tmpDir = tmpDir;
  }

  roots() {
    return this.settings.getFileRoots().map((root, index) => ({ id: String(index), path: root }));
  }

  rootById(rootId) {
    const index = Number.parseInt(rootId, 10);
    const roots = this.settings.getFileRoots();
    if (!Number.isInteger(index) || index < 0 || index >= roots.length) {
      throw new AppError(400, 'invalid_root', 'Unknown file root.');
    }
    return roots[index];
  }

  async resolve(rootId, relative = '') {
    const root = this.rootById(rootId);
    let rel = String(relative ?? '');
    if (rel.includes('\0')) throw new AppError(400, 'invalid_path', 'Invalid path.');
    if (rel.startsWith('/')) throw new AppError(400, 'invalid_path', 'Paths must be relative to the selected root.');
    const segments = rel.split('/').filter((s) => s !== '');
    for (const segment of segments) {
      if (segment === '.' || segment === '..') throw new AppError(400, 'invalid_path', 'Path traversal is not allowed.');
    }
    let realRoot;
    try {
      realRoot = await fsp.realpath(root);
    } catch {
      throw new AppError(400, 'invalid_root', 'The configured file root is not available.');
    }
    const candidate = path.join(realRoot, ...segments);
    if (!isWithin(realRoot, candidate)) throw new AppError(400, 'invalid_path', 'Path escapes the configured root.');
    await this.assertNoEscape(realRoot, candidate, segments);
    return { root: realRoot, abs: candidate, rel: segments.join('/') };
  }

  async assertNoEscape(realRoot, candidate, segments) {
    let current = realRoot;
    for (let i = 0; i < segments.length; i += 1) {
      current = path.join(current, segments[i]);
      let stat;
      try {
        stat = await fsp.lstat(current);
      } catch {
        return; // remaining path does not exist yet; parent is verified
      }
      if (stat.isSymbolicLink()) {
        let target;
        try {
          target = await fsp.realpath(current);
        } catch {
          throw new AppError(400, 'invalid_path', 'A dangling symlink cannot be accessed.');
        }
        if (!isWithin(realRoot, target)) {
          throw new AppError(403, 'path_escape', 'That symlink points outside the configured root.');
        }
      }
    }
    let realCandidate;
    try {
      realCandidate = await fsp.realpath(candidate);
    } catch {
      return;
    }
    if (!isWithin(realRoot, realCandidate)) {
      throw new AppError(403, 'path_escape', 'Path resolves outside the configured root.');
    }
  }

  async list(rootId, relative = '') {
    const { abs, rel } = await this.resolve(rootId, relative);
    let entries;
    try {
      entries = await fsp.readdir(abs, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') throw new AppError(404, 'not_found', 'Directory not found.');
      if (error.code === 'EACCES') throw new AppError(403, 'permission_denied', 'Permission denied.');
      throw error;
    }
    const items = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.cabana-upload-')) continue;
      const full = path.join(abs, entry.name);
      let stat;
      try {
        stat = await fsp.lstat(full);
      } catch {
        continue;
      }
      let symlinkTarget = null;
      let contained = true;
      if (stat.isSymbolicLink()) {
        try {
          const real = await fsp.realpath(full);
          symlinkTarget = real;
          contained = isWithin(await fsp.realpath(abs), real);
        } catch {
          contained = false;
        }
      }
      items.push({
        name: entry.name,
        path: rel ? `${rel}/${entry.name}` : entry.name,
        type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : 'other',
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        mode: (stat.mode & 0o777).toString(8).padStart(3, '0'),
        isSymlink: stat.isSymbolicLink(),
        symlinkTarget: contained ? symlinkTarget : null,
        escape: stat.isSymbolicLink() && !contained,
      });
    }
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
    return { rootId: String(rootId), path: rel, items };
  }

  async mkdir(rootId, relative, name) {
    if (!safeName(name)) throw new AppError(400, 'invalid_name', 'Invalid folder name.');
    const { abs, rel } = await this.resolve(rootId, path.posix.join(relative || '', name));
    try {
      await fsp.mkdir(abs, { mode: 0o755 });
    } catch (error) {
      if (error.code === 'EEXIST') throw new AppError(409, 'exists', 'A file or folder with that name already exists.');
      if (error.code === 'EACCES') throw new AppError(403, 'permission_denied', 'Permission denied.');
      throw error;
    }
    return { path: rel, name };
  }

  async rename(rootId, relative, newName) {
    if (!safeName(newName)) throw new AppError(400, 'invalid_name', 'Invalid file name.');
    if (!relative) throw new AppError(400, 'invalid_path', 'Cannot rename the root.');
    const sourceRel = String(relative);
    const parentRel = path.posix.dirname(sourceRel);
    const targetRel = parentRel === '.' ? newName : `${parentRel}/${newName}`;
    const source = await this.resolve(rootId, sourceRel);
    const target = await this.resolve(rootId, targetRel);
    try {
      await fsp.lstat(target.abs);
      throw new AppError(409, 'exists', 'A file or folder with that name already exists.');
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await fsp.rename(source.abs, target.abs);
    } catch (error) {
      if (error.code === 'EACCES') throw new AppError(403, 'permission_denied', 'Permission denied.');
      throw error;
    }
    return { from: sourceRel, to: targetRel };
  }

  async remove(rootId, relative, recursive = false) {
    if (!relative) throw new AppError(400, 'invalid_path', 'Refusing to delete a configured root.');
    const { abs, rel } = await this.resolve(rootId, relative);
    let stat;
    try {
      stat = await fsp.lstat(abs);
    } catch {
      throw new AppError(404, 'not_found', 'That file or folder no longer exists.');
    }
    if (stat.isSymbolicLink()) {
      await fsp.unlink(abs);
      return { path: rel };
    }
    if (stat.isDirectory() && !recursive) {
      const entries = await fsp.readdir(abs);
      if (entries.length) {
        throw new AppError(409, 'not_empty', 'Folder is not empty. Confirm recursive deletion.');
      }
    }
    await fsp.rm(abs, { recursive: Boolean(recursive), force: false });
    return { path: rel };
  }

  async downloadPath(rootId, relative) {
    const { abs, rel } = await this.resolve(rootId, relative);
    const stat = await fsp.stat(abs);
    if (!stat.isFile()) throw new AppError(400, 'not_a_file', 'Only files can be downloaded.');
    return { abs, rel, name: path.basename(abs), size: stat.size };
  }

  async upload(rootId, relative, file) {
    const dir = await this.resolve(rootId, relative || '');
    const original = path.basename(file.originalname || 'upload');
    const name = String(original)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[/\\]/g, '_')
      .slice(0, 200);
    if (!safeName(name)) throw new AppError(400, 'invalid_name', 'Invalid upload file name.');
    const targetRel = relative ? `${dir.rel}/${name}` : name;
    const target = await this.resolve(rootId, targetRel);
    let exists = false;
    try {
      await fsp.lstat(target.abs);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) throw new AppError(409, 'exists', 'A file with that name already exists.');
    await fsp.mkdir(path.dirname(target.abs), { recursive: true });
    try {
      await fsp.rename(file.path, target.abs);
    } catch (error) {
      if (error.code === 'EXDEV') {
        await fsp.copyFile(file.path, target.abs);
        await fsp.unlink(file.path);
      } else {
        throw error;
      }
    }
    const stat = await fsp.stat(target.abs);
    return { path: targetRel, name, size: stat.size };
  }

  makeUploadTemp() {
    fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o700 });
    return this.tmpDir;
  }

  tempName() {
    return `upload-${crypto.randomBytes(12).toString('hex')}`;
  }
}

export { safeName, isWithin };
