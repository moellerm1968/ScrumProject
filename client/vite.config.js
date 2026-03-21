import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv reads client/.env (and .env.local etc.) without requiring VITE_ prefix
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_PORT || '5173');
  const backendPort = parseInt(env.VITE_BACKEND_PORT || '3001');

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          configure: (proxy) => {
            // Disable response buffering so SSE events arrive immediately
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['x-accel-buffering'] = 'no';
            });
          },
        },
      },
    },
  };
});
