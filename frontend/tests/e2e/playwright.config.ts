import { defineConfig, devices } from '@playwright/test';

// Bypass proxy for localhost connections — proxy process may be dead
// but env vars (ALL_PROXY, HTTP_PROXY) remain, causing timeouts
delete process.env.ALL_PROXY;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

/**
 * 测试配置
 * - 需要先通过项目根目录 ./start.sh 启动全栈服务
 * - backend(:18472) + MCP(:18003) + frontend(:5173) + km_service(:18010)
 * - Chat API 调用真实 LLM，单次响应最长 90s
 *
 * 运行方式：
 *   npx playwright test                           # 全部
 *   npx playwright test --project=skills          # 只跑业务技能
 *   npx playwright test --project=platform        # 只跑平台功能
 *   npx playwright test skills/inbound/bill-inquiry  # 单个技能
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
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'skills',
      testDir: './skills',
      testMatch: '**/*.spec.ts',
    },
    {
      name: 'platform',
      testDir: './platform',
      testMatch: '**/*.spec.ts',
    },
  ],
});
