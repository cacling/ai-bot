import { defineConfig, devices } from '@playwright/test';

/**
 * 测试配置
 * - 连接真实后端（http://localhost:8000）
 * - 需要先通过 start.sh 启动所有服务（PostgreSQL, telecom-mcp, backend, frontend）
 * - Chat API 调用真实 LLM，单次响应最长 90s
 */
export default defineConfig({
  globalSetup: './global-setup.ts',
  testDir: '.',
  timeout: 90_000,        // 真实 LLM 响应最长 90s
  expect: { timeout: 30_000 },
  retries: 1,              // 真实 LLM 响应偶发超时，允许重试一次
  workers: 1,             // 顺序执行，避免并发写文件冲突
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
        channel: 'chrome',   // 使用系统 Chrome，无需下载 Playwright Chromium
      },
    },
  ],
  webServer: {
    command: 'bash ./scripts/start-services.sh',
    url: 'http://localhost:5173',
    reuseExistingServer: true,   // 复用 start.sh 已启动的实例
    timeout: 180_000,            // 含依赖安装+DB初始化最长 3 分钟
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
