import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Keep the proxy target in step with the API's PORT via one env var, so the
  // two never drift apart. Default 5001 — macOS Control Center (AirPlay
  // Receiver) squats on 5000, which makes it a poor default on this platform.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:5001';

  /**
   * Without this, an unreachable API (server not started, or started on another
   * port) surfaces in the browser as a bare `500` with an empty body — which
   * axios reports as the useless "Request failed with status code 500".
   * Turn it into a 503 that names the actual problem.
   */
  const explainProxyFailure = (proxy) => {
    proxy.on('error', (err, _req, res) => {
      const unreachable = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(err.code);
      const message = unreachable
        ? `Cannot reach the API at ${apiTarget}. Is the server running? Try \`npm run dev\` from the project root, and check PORT in server/.env matches VITE_API_PROXY.`
        : `Proxy error talking to ${apiTarget}: ${err.message}`;

      console.error(`\n[vite:proxy] ${message}\n`);
      if (res.writeHead && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message }));
      } else if (res.end) {
        res.end();
      }
    });
  };

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Fail loudly instead of silently sliding to 5174 — a moved port breaks
      // the CORS origin the API was configured with.
      strictPort: true,
      proxy: {
        // Keeps the browser on one origin in dev: no CORS preflight, and the
        // websocket upgrade rides through the same proxy.
        '/api': { target: apiTarget, changeOrigin: true, configure: explainProxyFailure },
        '/socket.io': { target: apiTarget, ws: true, configure: explainProxyFailure },
      },
    },
  };
});
