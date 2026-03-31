import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unittest/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      // skill-creator/chat 返回 SSE 长连接，需要禁止 proxy 缓冲
      '/api/skill-creator': {
        target: 'http://localhost:18010',
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // SSE 响应：强制禁用压缩和缓冲，确保事件实时透传
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
              delete proxyRes.headers['content-encoding'];
              delete proxyRes.headers['content-length'];
            }
          });
        },
      },
      '/api/km': 'http://localhost:18010',
      '/api/mcp': 'http://localhost:18010',
      '/api/files': 'http://localhost:18010',
      '/api/skills': 'http://localhost:18010',
      '/api/skill-versions': 'http://localhost:18010',
      '/api/sandbox': 'http://localhost:18010',
      '/api/canary': 'http://localhost:18010',
      '/api/change-requests': 'http://localhost:18010',
      '/api/test-cases': 'http://localhost:18010',
    },
  },
})
