import fs from 'node:fs';
import { AppError } from '../errors.js';
import { getSetting, setSetting, allSettings } from '../db.js';

export const DEFAULT_TZ = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const FORBIDDEN_ROOTS = ['/', '/proc', '/sys', '/dev', '/boot'];

export class SettingsService {
  constructor({ db, dataDir }) {
    this.db = db;
    this.dataDir = dataDir;
  }

  get() {
    const stored = allSettings(this.db);
    const roots = Array.isArray(stored.fileRoots) && stored.fileRoots.length ? stored.fileRoots : [this.dataDir];
    return {
      puid: Number.isInteger(stored.puid) ? stored.puid : 1000,
      pgid: Number.isInteger(stored.pgid) ? stored.pgid : 1000,
      tz: typeof stored.tz === 'string' && stored.tz ? stored.tz : DEFAULT_TZ,
      fileRoots: roots,
      storeFetchedAt: stored.storeFetchedAt || null,
    };
  }

  getFileRoots() {
    return this.get().fileRoots;
  }

  update(input) {
    const current = this.get();
    const next = { ...current };
    if (input.puid !== undefined) {
      if (!Number.isInteger(input.puid) || input.puid < 1 || input.puid > 65535) {
        throw new AppError(400, 'invalid_puid', 'PUID must be an integer between 1 and 65535.');
      }
      next.puid = input.puid;
    }
    if (input.pgid !== undefined) {
      if (!Number.isInteger(input.pgid) || input.pgid < 1 || input.pgid > 65535) {
        throw new AppError(400, 'invalid_pgid', 'PGID must be an integer between 1 and 65535.');
      }
      next.pgid = input.pgid;
    }
    if (input.tz !== undefined) {
      if (typeof input.tz !== 'string' || !/^[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(input.tz)) {
        throw new AppError(400, 'invalid_timezone', 'Timezone must be an IANA timezone such as UTC or America/New_York.');
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.tz });
      } catch {
        throw new AppError(400, 'invalid_timezone', 'Timezone is not recognized.');
      }
      next.tz = input.tz;
    }
    if (input.fileRoots !== undefined) {
      if (!Array.isArray(input.fileRoots) || input.fileRoots.length < 1 || input.fileRoots.length > 8) {
        throw new AppError(400, 'invalid_file_roots', 'Provide between 1 and 8 file manager roots.');
      }
      const roots = [];
      for (const candidate of input.fileRoots) {
        if (typeof candidate !== 'string' || !candidate.startsWith('/')) {
          throw new AppError(400, 'invalid_file_roots', 'File roots must be absolute paths.');
        }
        let real;
        try {
          real = fs.realpathSync(candidate);
          if (!fs.statSync(real).isDirectory()) throw new Error('not a directory');
        } catch {
          throw new AppError(400, 'invalid_file_roots', `File root does not exist or is not a directory: ${candidate}`);
        }
        if (FORBIDDEN_ROOTS.includes(real) || real.startsWith('/proc/') || real.startsWith('/sys/') || real.startsWith('/dev/')) {
          throw new AppError(400, 'invalid_file_roots', `That path cannot be used as a file root: ${real}`);
        }
        if (!roots.includes(real)) roots.push(real);
      }
      next.fileRoots = roots;
    }
    if (input.puid !== undefined) setSetting(this.db, 'puid', next.puid);
    if (input.pgid !== undefined) setSetting(this.db, 'pgid', next.pgid);
    if (input.tz !== undefined) setSetting(this.db, 'tz', next.tz);
    if (input.fileRoots !== undefined) setSetting(this.db, 'fileRoots', next.fileRoots);
    return this.get();
  }

  markStoreFetched(at) {
    setSetting(this.db, 'storeFetchedAt', at);
  }
}
