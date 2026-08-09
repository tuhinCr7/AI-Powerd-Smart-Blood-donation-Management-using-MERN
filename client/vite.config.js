import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Keep the proxy target in step with the API's PORT via one env var, so the
  // two never drift apart. Default 5001 — macOS Control Center (AirPlay
  // Receiver) squats on 5000, which makes it a poor default on this platform.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY || 'http://localhost:5001';

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
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
  };
});
