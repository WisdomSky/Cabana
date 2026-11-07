import fs from 'node:fs';
import { listFilesystems } from './host.js';

export class StorageService {
  constructor({ settings, dataDir, hostMetrics }) {
    this.settings = settings;
    this.dataDir = dataDir;
    this.hostMetrics = hostMetrics;
  }

  overview() {
    const filesystems = listFilesystems(this.dataDir);
    const roots = this.settings.getFileRoots().map((root) => {
      let stats = null;
      let entries = null;
      try {
        const s = fs.statfsSync(root);
        stats = {
          total: s.blocks * s.bsize,
          available: s.bavail * s.bsize,
          used: s.blocks * s.bsize - s.bfree * s.bsize,
        };
        stats.percent = stats.total ? Math.round((stats.used / stats.total) * 1000) / 10 : 0;
        entries = fs.readdirSync(root).length;
      } catch {
        /* root may be unavailable */
      }
      return { path: root, stats, entries };
    });
    return {
      host: this.hostMetrics.snapshot(),
      filesystems,
      roots,
      dataDir: this.dataDir,
      appData: this.appDataSummary(),
      mountedByCabana: [],
    };
  }

  appDataSummary() {
    const base = `${this.dataDir}/AppData`;
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
      return {
        path: base,
        appCount: entries.length,
        apps: entries.slice(0, 100).map((e) => ({ name: e.name })),
      };
    } catch {
      return { path: base, appCount: 0, apps: [] };
    }
  }
}
