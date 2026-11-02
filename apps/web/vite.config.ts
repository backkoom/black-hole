import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 开发期固定：Vite 5173，API 3000。
 * /api 走同源代理，前端只写相对路径 /api，不写 API 域名，不启用 CORS。
 * 生产由同源反向代理或 Fastify 静态托管，保持同源。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    // 绑 0.0.0.0：默认只监听 [::1]，浏览器走 IPv4 会连不上，
    // 内网其他机器也没法访问调试端口
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
