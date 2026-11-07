import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { asyncHandler, AppError } from '../errors.js';
import { safeName } from '../services/files.js';

export function fileRoutes({ files, config }) {
  const router = express.Router();
  fs.mkdirSync(config.tmpDir, { recursive: true, mode: 0o700 });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.tmpDir),
    filename: (_req, _file, cb) => cb(null, files.tempName()),
  });
  const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1, fields: 10 },
  });

  router.get('/roots', (req, res) => {
    res.json({ roots: files.roots(), dataDir: config.dataDir });
  });

  router.get('/', asyncHandler(async (req, res) => {
    const rootId = req.query.root ?? '0';
    res.json(await files.list(rootId, String(req.query.path ?? '')));
  }));

  router.get('/download', asyncHandler(async (req, res) => {
    const rootId = req.query.root ?? '0';
    const { abs, name } = await files.downloadPath(rootId, String(req.query.path ?? ''));
    res.download(abs, name, (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: { code: 'download_failed', message: 'Could not download that file.' } });
      }
    });
  }));

  router.post(
    '/upload',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      try {
        if (!req.file) throw new AppError(400, 'file_required', 'Choose a file to upload.');
        const result = await files.upload(req.query.root ?? '0', String(req.query.path ?? ''), req.file);
        res.status(201).json(result);
      } catch (error) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        throw error;
      }
    }),
  );

  router.post('/mkdir', asyncHandler(async (req, res) => {
    const { root = '0', path: rel = '', name } = req.body || {};
    res.status(201).json(await files.mkdir(root, String(rel), name));
  }));

  router.post('/rename', asyncHandler(async (req, res) => {
    const { root = '0', path: rel, name } = req.body || {};
    if (typeof rel !== 'string' || !rel) throw new AppError(400, 'invalid_path', 'Choose a file or folder to rename.');
    res.json(await files.rename(root, rel, name));
  }));

  router.post('/delete', asyncHandler(async (req, res) => {
    const { root = '0', path: rel, recursive = false } = req.body || {};
    if (typeof rel !== 'string' || !rel) throw new AppError(400, 'invalid_path', 'Choose a file or folder to delete.');
    res.json(await files.remove(root, rel, recursive === true));
  }));

  router.use((error, _req, res, next) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'That file is larger than the 2 GB upload limit.'
          : `Upload failed: ${error.message}`;
      return res.status(400).json({ error: { code: 'upload_error', message } });
    }
    next(error);
  });

  return router;
}
