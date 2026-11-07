import express from 'express';
import { asyncHandler } from '../errors.js';

export function storageRoutes({ storage }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.json(storage.overview());
  });
  router.get('/host', (req, res) => {
    res.json(storage.hostMetrics.snapshot());
  });
  return router;
}
