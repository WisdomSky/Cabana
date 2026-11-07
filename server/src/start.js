import { createApplication } from './app.js';

const { app, config, services, close } = createApplication();
const server = app.listen(config.port, config.host, () => {
  const address = server.address();
  const shownPort = typeof address === 'object' && address ? address.port : config.port;
  console.log(`Cabana ${config.version} listening on http://${config.host}:${shownPort}`);
  console.log(`State: ${config.stateDir}  Data: ${config.dataDir}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Cabana received ${signal}, shutting down`);
  const timer = setTimeout(() => process.exit(1), 8000);
  timer.unref?.();
  server.close(() => {
    clearTimeout(timer);
    try {
      close();
    } finally {
      process.exit(0);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

services.hostMetrics.start();
