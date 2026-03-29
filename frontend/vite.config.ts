import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // KM/MCP/Skills routes → km_service (18010)
      '/api/km': 'http://localhost:18010',
      '/api/mcp': 'http://localhost:18010',
      '/api/files': 'http://localhost:18010',
      '/api/skills': 'http://localhost:18010',
      '/api/skill-versions': 'http://localhost:18010',
      '/api/sandbox': 'http://localhost:18010',
      '/api/skill-edit': 'http://localhost:18010',
      '/api/canary': 'http://localhost:18010',
      '/api/change-requests': 'http://localhost:18010',
      '/api/test-cases': 'http://localhost:18010',
      '/api/skill-creator': 'http://localhost:18010',
      // All other API routes → backend (18472)
      '/api': 'http://localhost:18472',
      '/ws': {
        target: 'ws://localhost:18472',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
