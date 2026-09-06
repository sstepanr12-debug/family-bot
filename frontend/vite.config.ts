import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Telegram opens the Mini App through an HTTPS tunnel (see README); allow
    // any host so ngrok/cloudflared URLs reach the dev server.
    host: true,
    allowedHosts: true,
    // Same-origin in dev as in production: the frontend never needs an absolute
    // API URL, so a single tunnel/domain is enough.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
