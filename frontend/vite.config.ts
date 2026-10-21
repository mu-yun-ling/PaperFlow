import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 测试时可指向独立服务；日常启动仍使用 5000 端口。
const proxy = { '/api': { target: process.env.PAPERFLOW_API_TARGET ?? 'http://127.0.0.1:5000', changeOrigin: true } };

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
          // 其余依赖由 Rollup 按页面使用情况拆分，避免所有表单和表格挤进同一个包。
        },
      },
    },
  },
});
