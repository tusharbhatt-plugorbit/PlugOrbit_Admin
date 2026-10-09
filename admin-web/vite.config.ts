import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The Admin API lives under /admin/v1. In development the dev server proxies it so the browser
// sees one origin (no CORS). In production, put both behind one host (Firebase Hosting rewrite
// to Cloud Run) or set VITE_API_BASE_URL and CORS_ORIGINS on the API.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/admin/v1': { target: process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
