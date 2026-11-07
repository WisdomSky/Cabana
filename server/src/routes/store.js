import express from 'express';
import { asyncHandler } from '../errors.js';
import { listApps } from '../db.js';

const HOST_ARCH = process.arch === 'x64' ? 'amd64' : process.arch;

export function storeRoutes({ store, settings, db, apps }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const index = await store.getIndex({ force: req.query.refresh === '1' });
    const arch = typeof req.query.arch === 'string' && req.query.arch ? req.query.arch : HOST_ARCH;
    const includeIncompatible = req.query.includeIncompatible === '1';
    const dbApps = listApps(db);
    const installedIds = new Set(dbApps.filter((a) => a.storeId).map((a) => a.storeId));
    const apps = store.listApps(index, {
      query: String(req.query.q ?? ''),
      category: String(req.query.category ?? ''),
      arch,
      includeIncompatible,
    }).map((app) => ({ ...app, installed: installedIds.has(app.id) }));
    res.json({
      ...index,
      apps,
      total: apps.length,
      hostArch: HOST_ARCH,
      arch,
      categories: store.categories(index, { arch }),
      installed: [...installedIds],
      installedCount: dbApps.length,
    });
  }));

  router.get('/apps/:id', asyncHandler(async (req, res) => {
    const app = await apps.previewStore(req.params.id);
    const installed = listApps(db).find((a) => a.storeId === app.id) || null;
    res.json({
      app,
      installed: installed
        ? {
            id: installed.id,
            title: installed.title,
            port: installed.portMap,
            status: null,
          }
        : null,
    });
  }));

  router.post('/refresh', asyncHandler(async (req, res) => {
    const index = await store.refresh();
    settings.markStoreFetched(index.fetchedAt || new Date().toISOString());
    res.json({
      ok: true,
      fetchedAt: index.fetchedAt,
      updatedAt: index.updatedAt,
      appCount: index.appCount,
      stale: Boolean(index.stale),
    });
  }));

  router.get('/asset', asyncHandler(async (req, res) => {
    const { body, contentType } = await store.fetchAsset(String(req.query.path ?? ''));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(body);
  }));

  return router;
}
