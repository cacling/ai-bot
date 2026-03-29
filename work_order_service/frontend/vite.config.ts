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
    port: 5175,
    proxy: {
      '/api/work-items': 'http://localhost:18009',
      '/api/work-orders': 'http://localhost:18009',
      '/api/appointments': 'http://localhost:18009',
      '/api/templates': 'http://localhost:18009',
      '/api/tickets': 'http://localhost:18009',
      '/api/tasks': 'http://localhost:18009',
      '/api/workflows': 'http://localhost:18009',
      '/api/categories': 'http://localhost:18009',
      '/api/intakes': 'http://localhost:18009',
      '/api/drafts': 'http://localhost:18009',
      '/api/issue-threads': 'http://localhost:18009',
      '/api/merge-reviews': 'http://localhost:18009',
    },
  },
})
