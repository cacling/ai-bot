import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './setup.ts',
  },
  resolve: {
    alias: {
      '@': '/Users/chenjun/Documents/obsidian/workspace/ai-bot/frontend/src',
    },
  },
});
