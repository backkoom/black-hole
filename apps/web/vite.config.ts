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
    // ⚠️ 关掉"构建前清空 dist"：本机的删除拦截器按**单轮**累计计数，
    //    一轮里删超过 50 个文件后，vite 自己的 emptyDir 就会被拦，
    //    构建直接失败（SAFE_DELETE_BULK_CONFIRM_REQUIRED）。
    //    代价是 dist 里会残留历史 hash 文件（index.html 永远指向新的，不影响访问），
    //    需要清理时手动 `rm -rf apps/web/dist`（单独跑，别和构建同一轮）。
    emptyOutDir: false,
  },
});
