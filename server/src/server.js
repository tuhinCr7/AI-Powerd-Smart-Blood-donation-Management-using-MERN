import http from 'node:http';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { initSocket } from './sockets/index.js';

async function start() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    console.log(`[api] http://localhost:${env.port}/api  (${env.nodeEnv})`);
    console.log(`[cors] allowing ${env.clientUrl}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[api] ${signal} received — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection', err);
  process.exit(1);
});

start().catch((err) => {
  console.error('[fatal] failed to start', err);
  process.exit(1);
});
