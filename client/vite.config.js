import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const apiTarget =
    env.VITE_API_PROXY || 'http://localhost:5001';

  const explainProxyFailure = (proxy) => {
    proxy.on('error', (err, _req, res) => {
      const unreachable = [
        'ECONNREFUSED',
        'ECONNRESET',
        'EHOSTUNREACH',
      ].includes(err.code);

      const message = unreachable
        ? `Cannot reach the API at ${apiTarget}. Is the server running?`
        : `Proxy error talking to ${apiTarget}: ${err.message}`;

      console.error(`\n[vite:proxy] ${message}\n`);

      if (res.writeHead && !res.headersSent) {
        res.writeHead(503, {
          'Content-Type': 'application/json',
        });

        res.end(
          JSON.stringify({
            success: false,
            message,
          })
        );
      } else if (res.end) {
        res.end();
      }
    });
  };

  return {
    plugins: [react()],

    // IMPORTANT FOR GITHUB PAGES
    base: '/lifelink-client/',

    server: {
      port: 5173,
      strictPort: true,

      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: explainProxyFailure,
        },

        '/socket.io': {
          target: apiTarget,
          ws: true,
          configure: explainProxyFailure,
        },
      },
    },
  };
});