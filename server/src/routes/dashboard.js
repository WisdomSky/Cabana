import express from 'express';
import { asyncHandler } from '../errors.js';

export function dashboardRoutes({ hostMetrics, docker, apps, store, settings, config }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const host = hostMetrics.snapshot();
    const dockerInfo = await docker.info();
    let containers = [];
    if (dockerInfo.available) {
      containers = await docker.listContainers().catch(() => []);
    }
    const list = await apps.list();
    const counts = {
      total: list.apps.length,
      running: list.apps.filter((a) => a.status === 'running').length,
      stopped: list.apps.filter((a) => a.status === 'stopped').length,
      missing: list.apps.filter((a) => a.status === 'missing').length,
      error: list.apps.filter((a) => a.status === 'error').length,
    };
    let storeInfo = null;
    try {
      const index = await store.getIndex();
      storeInfo = {
        appCount: index.appCount,
        updatedAt: index.updatedAt,
        fetchedAt: index.fetchedAt,
        stale: Boolean(index.stale),
        warning: index.warning || null,
      };
    } catch (error) {
      storeInfo = { error: error.message };
    }
    res.json({
      host,
      docker: {
        ...dockerInfo,
        containers: {
          total: containers.length,
          running: containers.filter((c) => c.state === 'running').length,
        },
      },
      apps: {
        counts,
        recent: list.apps.slice(-6).reverse(),
      },
      orphans: list.orphans,
      store: storeInfo,
      settings: settings.get(),
      version: config.version,
      dataDir: config.dataDir,
      hostArch: process.arch === 'x64' ? 'amd64' : process.arch,
    });
  }));

  return router;
}
