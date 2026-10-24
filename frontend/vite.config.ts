import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Go backend does not implement CORS, so the browser talks to Vite (dev)
// or `vite preview` and /api requests are forwarded to the backend.
const apiProxy = {
  '/api': { target: 'http://localhost:8080', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
