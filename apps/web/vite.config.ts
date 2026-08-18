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
    // M-8 in AUDIT_REPORT.md: `true` shipped full readable source maps in the
    // production bundle — a pre-indexed map of the client for free, and dead
    // weight in the deployed image either way. `'hidden'` (maps built but not
    // referenced from the served JS) is the audit's other suggested option and
    // is right once something uploads them to an error tracker; nothing here
    // does that yet — see the deliberately-not-built note in
    // `docs/decisions.md` for why — so shipping the maps at all would just be
    // unused files with no consumer. `false` is what actually matches what
    // this deployment does today.
    sourcemap: false,
  },
});
