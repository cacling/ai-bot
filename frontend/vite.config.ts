import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 5173);
const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? 18472);
const INTERACTION_PLATFORM_PORT = Number(process.env.INTERACTION_PLATFORM_PORT ?? 18022);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: FRONTEND_PORT,
    allowedHosts: true,
    proxy: {
      // 所有 API 统一走 backend（session 中间件 → 代理注入 header → 子服务）
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
        rewriteWsOrigin: true,
      },
      // Interaction Platform API proxy
      '/ix-api': {
        target: `http://localhost:${INTERACTION_PLATFORM_PORT}`,
        rewrite: (p) => p.replace(/^\/ix-api/, ''),
      },
      // Interaction Platform WebSocket proxy
      '/ix-ws': {
        target: `ws://localhost:${INTERACTION_PLATFORM_PORT}`,
        ws: true,
        rewriteWsOrigin: true,
        rewrite: (p) => p.replace(/^\/ix-ws/, ''),
      },
    },
  },
})
