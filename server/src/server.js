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

  // Without this, a busy port surfaces as an unhandled 'error' event and a
  // 20-line V8 stack trace that says nothing useful. Name the problem instead.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[api] Port ${env.port} is already in use.\n` +
          `      Something else is listening there — most often a second copy of this\n` +
          `      server (check for another "npm run dev" in another terminal tab).\n\n` +
          `      Find it:  lsof -nP -iTCP:${env.port} -sTCP:LISTEN\n` +
          `      Or pick a different port by setting PORT in server/.env\n` +
          `      (and VITE_API_PROXY in client/.env to match).\n`
      );
    } else if (err.code === 'EACCES') {
      console.error(`\n[api] Not allowed to bind port ${env.port}. Ports below 1024 need elevated rights.\n`);
    } else {
      console.error('\n[api] Server error:', err.message, '\n');
    }
    process.exit(1);
  });

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
