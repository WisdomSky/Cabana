import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase, purgeExpiredSessions } from './db.js';
import { AppError, errorBody } from './errors.js';
import { attachSession, LoginRateLimiter, requireAuth, requireCsrf, sameOriginGuard, securityHeaders } from './security.js';
import { authRoutes } from './routes/auth.js';
import { appRoutes } from './routes/apps.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { fileRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';
import { storageRoutes } from './routes/storage.js';
import { storeRoutes } from './routes/store.js';
import { DockerService } from './services/docker.js';
import { HostMetrics } from './services/host.js';
import { FileService } from './services/files.js';
import { SettingsService } from './services/settings.js';
import { StorageService } from './services/storage.js';
import { StoreService } from './services/store.js';
import { AppService } from './services/apps.js';

export function createApplication(options = {}) {
  const config = loadConfig(options);
  const logger = options.logger || console;
  fs.mkdirSync(config.stateDir, { recursive: true, mode: 0o750 });
  fs.mkdirSync(config.appsDir, { recursive: true, mode: 0o750 });
  fs.mkdirSync(config.storeDir, { recursive: true, mode: 0o750 });
  fs.mkdirSync(config.tmpDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o755 });

  const db = openDatabase(config.dbPath);
  const settings = new SettingsService({ db, dataDir: config.dataDir });
  const docker = options.dockerService || new DockerService({ runner: options.dockerRunner, logger });
  const store = new StoreService({
    storeUrl: config.storeUrl,
    storeDir: config.storeDir,
    ttlMs: config.storeCacheTtlMs,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    logger,
  });
  const apps = new AppService({ db, docker, store, settings, config, logger });
  const hostMetrics = new HostMetrics({ dataDir: config.dataDir, intervalMs: options.metricsIntervalMs || 2000 });
  const files = new FileService({ settings, tmpDir: config.tmpDir });
  const storage = new StorageService({ settings, dataDir: config.dataDir, hostMetrics });

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: '1024kb' }));
  app.use(attachSession(db));
  app.use(sameOriginGuard(config.trustProxy));
  app.use('/api', requireCsrf);

  const limiter = new LoginRateLimiter();
  app.get('/api/health', async (req, res) => {
    const dockerInfo = await docker.info();
    res.json({
      status: 'ok',
      version: config.version,
      needsSetup: db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0,
      arch: process.arch === 'x64' ? 'amd64' : process.arch,
      docker: { available: dockerInfo.available, version: dockerInfo.version },
      time: new Date().toISOString(),
    });
  });

  app.use('/api', authRoutes({ db, config, limiter }));
  app.use('/api/apps', requireAuth, appRoutes({ apps }));
  app.use(
    '/api/dashboard',
    requireAuth,
    dashboardRoutes({ hostMetrics, docker, apps, store, settings, config }),
  );
  app.use('/api/store', requireAuth, storeRoutes({ store, settings, db, apps }));
  app.use('/api/files', requireAuth, fileRoutes({ files, config }));
  app.use('/api/storage', requireAuth, storageRoutes({ storage }));
  app.use('/api/settings', requireAuth, settingsRoutes({ settings, docker, config, db }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'API endpoint not found.' } });
  });

  const indexFile = path.join(config.webDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(config.webDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  } else {
    app.get('/', (req, res) => {
      res.status(503).type('text/plain').send('Cabana UI is not built. Run npm run build.');
    });
  }

  app.use((error, req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
    }
    const status = error instanceof AppError ? error.status : Number(error.status) || 500;
    if (status >= 500) logger.error?.(`request failed: ${error.code || error.name}: ${error.message}`);
    res.status(status).json(errorBody(error instanceof AppError ? error : new AppError(status, 'internal_error', status >= 500 ? 'Internal server error.' : error.message)));
  });

  hostMetrics.start();
  const sessionSweep = setInterval(() => {
    try {
      purgeExpiredSessions(db);
    } catch (error) {
      logger.warn?.(`session cleanup failed: ${error.message}`);
    }
  }, 60 * 60 * 1000);
  sessionSweep.unref?.();

  return {
    app,
    config,
    logger,
    db,
    services: { settings, docker, store, apps, hostMetrics, files, storage, limiter },
    close() {
      clearInterval(sessionSweep);
      hostMetrics.stop();
      db.close();
    },
  };
}
