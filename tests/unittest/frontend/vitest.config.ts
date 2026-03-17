import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const frontendSrc = '/Users/chenjun/Documents/obsidian/workspace/ai-bot/frontend/src';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './setup.ts',
    coverage: {
      provider: 'v8',
      include: ['../../../frontend/src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/*.d.ts', '**/main.tsx'],
      reportsDirectory: './coverage',
      all: true,
    },
  },
  resolve: {
    alias: {
      '@': frontendSrc,
    },
  },
});
