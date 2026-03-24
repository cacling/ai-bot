import { defineConfig, devices } from '@playwright/test';

// Bypass proxy for localhost connections — proxy process may be dead
// but env vars (ALL_PROXY, HTTP_PROXY) remain, causing timeouts
delete process.env.ALL_PROXY;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

/**
 * 测试配置
 * - 需要先通过 tests/scripts/start.sh 启动服务
 * - backend(:18472) + telecom-mcp(:8003) + frontend(:5173)
 * - Chat API 调用真实 LLM，单次响应最长 90s
 */
export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: 1,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
});
