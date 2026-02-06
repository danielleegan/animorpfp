import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
  build: {
    assetsInlineLimit: 0,
  },
});
