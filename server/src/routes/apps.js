import express from 'express';
import { asyncHandler } from '../errors.js';

export function appRoutes({ apps }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await apps.list({ force: req.query.force === '1' }));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    res.json(await apps.get(req.params.id));
  }));

  router.post('/analyze', asyncHandler(async (req, res) => {
    res.json(await apps.analyzeCustom(req.body || {}));
  }));

  router.post('/custom', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await apps.installCustom({
      compose: body.compose,
      title: body.title,
      confirmRisk: body.confirmRisk === true,
      id: body.id || null,
    });
    res.status(201).json(result);
  }));

  router.post('/store/:id/install', asyncHandler(async (req, res) => {
    const result = await apps.installStore(req.params.id, { force: req.body?.force === true });
    res.status(201).json(result);
  }));

  router.post('/:id/start', asyncHandler(async (req, res) => {
    res.json(await apps.start(req.params.id));
  }));

  router.post('/:id/stop', asyncHandler(async (req, res) => {
    res.json(await apps.stop(req.params.id));
  }));

  router.post('/:id/uninstall', asyncHandler(async (req, res) => {
    const deleteData = req.body?.deleteData === true;
    res.json(await apps.uninstall(req.params.id, { deleteData }));
  }));

  return router;
}
