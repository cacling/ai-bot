/**
 * Staff Auth E2E 测试
 *
 * 基于 seed 数据（6 个员工账号）验证：
 * - 登录页 UI 与表单交互
 * - 正确/错误凭证登录
 * - 角色路由（agent → /staff/workbench, operations → /staff/operations）
 * - 菜单可见性（agent 无运营管理，operations/demo 可见）
 * - 路由守卫（未登录重定向、角色不足重定向）
 * - 退出登录
 * - /agent/* 兼容跳转
 * - Session 持久化
 *
 * Seed 账号：
 *   demo    / Demo@123   — agent+operations, admin (演示主管)
 *   zhang.qi / Agent@123  — agent, auditor
 *   li.na   / Agent@123  — agent, auditor
 *   wang.lei / Agent@123  — agent, auditor
 *   chen.min / Ops@123   — operations, flow_manager
 *   zhao.ning / Ops@123  — operations, flow_manager
 */
import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:5173';

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/staff/login`);
  await page.getByLabel('账号').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
}

async function expectLoggedInAs(page: Page, displayName: string) {
  await expect(page.getByText(displayName)).toBeVisible({ timeout: 10_000 });
}

// ── 1. 登录页 UI ─────────────────────────────────────────────────────────────

test.describe('登录页 UI', () => {
  test('AUTH-UI-01: /staff/login 显示登录表单', async ({ page }) => {
    await page.goto(`${BASE}/staff/login`);
    await expect(page.getByText('员工登录')).toBeVisible();
    await expect(page.getByLabel('账号')).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });

  test('AUTH-UI-02: 演示账号快捷入口可见', async ({ page }) => {
    await page.goto(`${BASE}/staff/login`);
    await expect(page.getByText('演示账号')).toBeVisible();
    await expect(page.getByText('demo')).toBeVisible();
    await expect(page.getByText('zhang.qi')).toBeVisible();
    await expect(page.getByText('chen.min')).toBeVisible();
  });

  test('AUTH-UI-03: 点击演示账号快捷按钮填充表单', async ({ page }) => {
    await page.goto(`${BASE}/staff/login`);
    // 点击 demo 快捷按钮
    await page.locator('button', { hasText: 'demo' }).filter({ hasText: '演示主管' }).click();
    await expect(page.getByLabel('账号')).toHaveValue('demo');
    await expect(page.getByLabel('密码')).toHaveValue('123456');
  });

  test('AUTH-UI-04: 账号或密码为空时登录按钮禁用', async ({ page }) => {
    await page.goto(`${BASE}/staff/login`);
    await expect(page.getByRole('button', { name: '登录' })).toBeDisabled();
    await page.getByLabel('账号').fill('demo');
    await expect(page.getByRole('button', { name: '登录' })).toBeDisabled();
    await page.getByLabel('密码').fill('x');
    await expect(page.getByRole('button', { name: '登录' })).toBeEnabled();
  });
});

// ── 2. 登录流程 ──────────────────────────────────────────────────────────────

test.describe('登录流程', () => {
  test('AUTH-LOGIN-01: demo 登录成功 → 跳转 /staff/workbench', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expectLoggedInAs(page, '演示主管');
  });

  test('AUTH-LOGIN-02: zhang.qi (agent) 登录 → /staff/workbench', async ({ page }) => {
    await login(page, 'zhang.qi', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expectLoggedInAs(page, '张琦');
  });

  test('AUTH-LOGIN-03: chen.min (operations) 登录 → /staff/operations', async ({ page }) => {
    await login(page, 'chen.min', '123456');
    await page.waitForURL('**/staff/operations/**', { timeout: 10_000 });
    await expectLoggedInAs(page, '陈敏');
  });

  test('AUTH-LOGIN-04: zhao.ning (operations) 登录 → /staff/operations', async ({ page }) => {
    await login(page, 'zhao.ning', '123456');
    await page.waitForURL('**/staff/operations/**', { timeout: 10_000 });
    await expectLoggedInAs(page, '赵宁');
  });

  test('AUTH-LOGIN-05: 错误密码 → 显示错误提示', async ({ page }) => {
    await login(page, 'demo', 'wrongpassword');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    // 不应跳转
    expect(page.url()).toContain('/staff/login');
  });

  test('AUTH-LOGIN-06: 不存在的用户 → 显示错误提示', async ({ page }) => {
    await login(page, 'nonexistent', 'Test@123');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain('/staff/login');
  });
});

// ── 3. 角色菜单可见性 ────────────────────────────────────────────────────────

test.describe('角色菜单可见性', () => {
  test('AUTH-MENU-01: agent 角色只看到"坐席工作台"，看不到"运营管理"', async ({ page }) => {
    await login(page, 'zhang.qi', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: '坐席工作台' })).toBeVisible();
    // 运营管理不可见（sidebar 中无此按钮）
    await expect(page.getByRole('button', { name: '运营管理' })).not.toBeVisible();
  });

  test('AUTH-MENU-02: operations 角色可看到"运营管理"', async ({ page }) => {
    await login(page, 'chen.min', '123456');
    await page.waitForURL('**/staff/operations/**', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: '运营管理' })).toBeVisible();
  });

  test('AUTH-MENU-03: demo (agent+operations) 可同时看到"坐席工作台"和"运营管理"', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: '坐席工作台' })).toBeVisible();
    await expect(page.getByRole('button', { name: '运营管理' })).toBeVisible();
  });
});

// ── 4. TopBar 用户信息与角色标签 ──────────────────────────────────────────────

test.describe('TopBar 用户信息', () => {
  test('AUTH-TOPBAR-01: demo 登录后 TopBar 显示"演示主管" + 角色 badge', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    const topbar = page.locator('nav').first();
    await expect(topbar.getByText('演示主管')).toBeVisible();
    // demo 有 agent + operations 两个角色 badge（用 [data-slot="badge"] 定位）
    const badges = topbar.locator('[data-slot="badge"]');
    await expect(badges.getByText('坐席', { exact: true })).toBeVisible();
    await expect(badges.getByText('运营', { exact: true })).toBeVisible();
  });

  test('AUTH-TOPBAR-02: zhang.qi TopBar 只显示"坐席" badge', async ({ page }) => {
    await login(page, 'zhang.qi', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    const topbar = page.locator('nav').first();
    await expect(topbar.getByText('张琦')).toBeVisible();
    const badges = topbar.locator('[data-slot="badge"]');
    await expect(badges.getByText('坐席', { exact: true })).toBeVisible();
  });
});

// ── 5. 路由守卫 ──────────────────────────────────────────────────────────────

test.describe('路由守卫', () => {
  test('AUTH-GUARD-01: 未登录访问 /staff/workbench → 重定向到 /staff/login', async ({ page }) => {
    // 先清 cookie
    await page.context().clearCookies();
    await page.goto(`${BASE}/staff/workbench`);
    await page.waitForURL('**/staff/login', { timeout: 10_000 });
    await expect(page.getByText('员工登录')).toBeVisible();
  });

  test('AUTH-GUARD-02: 未登录访问 /staff/operations → 重定向到 /staff/login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/staff/operations`);
    await page.waitForURL('**/staff/login', { timeout: 10_000 });
  });

  test('AUTH-GUARD-03: agent 直接访问 /staff/operations → 重定向到 /staff/workbench', async ({ page }) => {
    await login(page, 'zhang.qi', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    // 尝试手动导航到 operations
    await page.goto(`${BASE}/staff/operations`);
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
  });

  test('AUTH-GUARD-04: 已登录访问 /staff/login → 按角色重定向', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    // 访问 login 页应被重定向回去
    await page.goto(`${BASE}/staff/login`);
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
  });
});

// ── 6. /agent/* 兼容跳转 ─────────────────────────────────────────────────────

test.describe('/agent 兼容跳转', () => {
  test('AUTH-COMPAT-01: /agent → /staff/login（未登录）', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/agent`);
    await page.waitForURL('**/staff/login', { timeout: 10_000 });
  });

  test('AUTH-COMPAT-02: /agent/workbench → /staff/workbench（已登录）', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await page.goto(`${BASE}/agent/workbench`);
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
  });
});

// ── 7. 退出登录 ──────────────────────────────────────────────────────────────

test.describe('退出登录', () => {
  test('AUTH-LOGOUT-01: 点击退出 → 回到登录页', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expectLoggedInAs(page, '演示主管');

    // 点击退出按钮（LogOut icon button）
    await page.getByTitle('退出登录').click();
    await page.waitForURL('**/staff/login', { timeout: 10_000 });
    await expect(page.getByText('员工登录')).toBeVisible();
  });

  test('AUTH-LOGOUT-02: 退出后访问受保护页被拦截', async ({ page }) => {
    await login(page, 'zhang.qi', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });

    // 退出
    await page.getByTitle('退出登录').click();
    await page.waitForURL('**/staff/login', { timeout: 10_000 });

    // 尝试直接访问 workbench
    await page.goto(`${BASE}/staff/workbench`);
    await page.waitForURL('**/staff/login', { timeout: 10_000 });
  });
});

// ── 8. Session 持久化 ────────────────────────────────────────────────────────

test.describe('Session 持久化', () => {
  test('AUTH-SESSION-01: 登录后刷新页面保持登录状态', async ({ page }) => {
    await login(page, 'li.na', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expectLoggedInAs(page, '李娜');

    // 刷新
    await page.reload();
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
    await expectLoggedInAs(page, '李娜');
  });

  test('AUTH-SESSION-02: 登录后直接导航到受保护页面', async ({ page }) => {
    await login(page, 'demo', '123456');
    await page.waitForURL('**/staff/workbench', { timeout: 10_000 });

    // 直接访问 operations
    await page.goto(`${BASE}/staff/operations/knowledge`);
    await page.waitForURL('**/staff/operations/knowledge**', { timeout: 10_000 });
    await expectLoggedInAs(page, '演示主管');
  });
});

// ── 9. 多账号登录覆盖 ────────────────────────────────────────────────────────

test.describe('全账号登录覆盖', () => {
  const ACCOUNTS = [
    { username: 'demo',      password: '123456', name: '演示主管', role: 'agent',      url: '/staff/workbench' },
    { username: 'zhang.qi',  password: '123456', name: '张琦',     role: 'agent',      url: '/staff/workbench' },
    { username: 'li.na',     password: '123456', name: '李娜',     role: 'agent',      url: '/staff/workbench' },
    { username: 'wang.lei',  password: '123456', name: '王蕾',     role: 'agent',      url: '/staff/workbench' },
    { username: 'chen.min',  password: '123456', name: '陈敏',     role: 'operations', url: '/staff/operations' },
    { username: 'zhao.ning', password: '123456', name: '赵宁',     role: 'operations', url: '/staff/operations' },
  ];

  for (const acct of ACCOUNTS) {
    test(`AUTH-ALL-${acct.username}: 登录 ${acct.username} → ${acct.url}`, async ({ page }) => {
      await login(page, acct.username, acct.password);
      await page.waitForURL(`**${acct.url}**`, { timeout: 10_000 });
      await expectLoggedInAs(page, acct.name);
    });
  }
});
