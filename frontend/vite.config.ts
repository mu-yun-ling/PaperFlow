import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (!path.includes('/node_modules/')) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react-vendor';
          return 'ui-vendor';
        },
      },
    },
  },
});
