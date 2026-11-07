import express from 'express';
import { asyncHandler, AppError } from '../errors.js';
import { changePassword, verifyPassword } from '../auth.js';
import { deleteUserSessions, getUserById } from '../db.js';

export function settingsRoutes({ settings, docker, config, db }) {
  const router = express.Router();

  router.get('/', asyncHandler(async (req, res) => {
    const dockerInfo = await docker.info();
    res.json({
      settings: settings.get(),
      system: {
        version: config.version,
        dataDir: config.dataDir,
        stateDir: config.stateDir,
        port: config.port,
        hostArch: process.arch === 'x64' ? 'amd64' : process.arch,
        docker: dockerInfo,
      },
    });
  }));

  router.patch('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (body.fileRoots !== undefined) {
      if (typeof body.currentPassword !== 'string') {
        throw new AppError(400, 'password_required', 'Enter your current password to change file manager roots.');
      }
      const user = getUserById(db, req.userId);
      if (!user || !(await verifyPassword(body.currentPassword, user.password_hash))) {
        throw new AppError(403, 'invalid_password', 'The current password is incorrect.');
      }
    }
    const updated = settings.update({
      puid: body.puid,
      pgid: body.pgid,
      tz: body.tz,
      fileRoots: body.fileRoots,
    });
    res.json({ settings: updated });
  }));

  router.post('/password', asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      throw new AppError(400, 'invalid_password', 'Current and new passwords are required.');
    }
    const result = await changePassword(db, req.userId, currentPassword, newPassword);
    if (!result.ok) {
      if (result.code === 'invalid_password') throw new AppError(403, 'invalid_password', 'The current password is incorrect.');
      if (result.code === 'weak_password') throw new AppError(400, 'weak_password', 'New password must be 8-200 characters.');
      throw new AppError(400, 'password_change_failed', 'Could not change the password.');
    }
    deleteUserSessions(db, req.userId, req.session.id);
    res.json({ ok: true });
  }));

  return router;
}
