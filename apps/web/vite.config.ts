import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The dev server proxies `/api` to the API process so the browser talks to a
 * single origin. That matters for auth: the refresh token is an HttpOnly cookie
 * scoped to `/api/v1/auth`, and keeping one origin means it is sent on every
 * refresh without relying on cross-site cookie rules.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
