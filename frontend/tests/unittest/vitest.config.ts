import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const frontendSrc = path.resolve(__dirname, '../../src');
const testNodeModules = path.resolve(__dirname, 'node_modules');

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './setup.ts',
    coverage: {
      provider: 'v8',
      include: ['../../src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/*.d.ts', '**/main.tsx'],
      reportsDirectory: './coverage',
      all: true,
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': frontendSrc,
      // Ensure a single React instance — override bun's hoisted copies
      'react': path.resolve(testNodeModules, 'react'),
      'react-dom': path.resolve(testNodeModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(testNodeModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(testNodeModules, 'react/jsx-dev-runtime'),
      // Mock @base-ui/react components that crash in jsdom
      '@base-ui/react/button': path.resolve(__dirname, '__mocks__/@base-ui/react/button.ts'),
      '@base-ui/react/select': path.resolve(__dirname, '__mocks__/@base-ui/react/select.ts'),
      '@base-ui/react/dialog': path.resolve(__dirname, '__mocks__/@base-ui/react/dialog.ts'),
      '@base-ui/react/input': path.resolve(__dirname, '__mocks__/@base-ui/react/input.ts'),
      '@base-ui/react/merge-props': path.resolve(__dirname, '__mocks__/@base-ui/react/merge-props.ts'),
      '@base-ui/react/use-render': path.resolve(__dirname, '__mocks__/@base-ui/react/use-render.ts'),
      '@base-ui/react/checkbox': path.resolve(__dirname, '__mocks__/@base-ui/react/checkbox.ts'),
      '@base-ui/react/radio': path.resolve(__dirname, '__mocks__/@base-ui/react/radio.ts'),
      '@base-ui/react/radio-group': path.resolve(__dirname, '__mocks__/@base-ui/react/radio-group.ts'),
      '@base-ui/react/separator': path.resolve(__dirname, '__mocks__/@base-ui/react/separator.ts'),
      '@base-ui/react/tabs': path.resolve(__dirname, '__mocks__/@base-ui/react/tabs.ts'),
      'react-resizable-panels': path.resolve(__dirname, '__mocks__/react-resizable-panels.ts'),
      'lucide-react': path.resolve(__dirname, '__mocks__/lucide-react.tsx'),
    },
  },
});
