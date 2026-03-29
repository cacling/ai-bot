import { defineConfig, devices } from '@playwright/test';

delete process.env.ALL_PROXY;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

/**
 * 工单管理前端 E2E 测试配置
 *
 * 前置条件：通过 start.sh --reset 启动全部服务
 * 测试入口：主前端 :5173 → 登录 → 运营管理 → 工单管理
 *
 * 运行方式：
 *   cd work_order_service/frontend/tests/e2e
 *   npx playwright test
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
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
    channel: 'chrome',
  },
});
