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
      '/api/km': 'http://localhost:18010',
      '/api/mcp': 'http://localhost:18010',
      '/api/files': 'http://localhost:18010',
      '/api/skills': 'http://localhost:18010',
      '/api/skill-versions': 'http://localhost:18010',
      '/api/sandbox': 'http://localhost:18010',
      '/api/canary': 'http://localhost:18010',
      '/api/change-requests': 'http://localhost:18010',
      '/api/test-cases': 'http://localhost:18010',
      '/api/skill-creator': 'http://localhost:18010',
    },
  },
})
