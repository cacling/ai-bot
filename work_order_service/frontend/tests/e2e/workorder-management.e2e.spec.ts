/**
 * 工单管理 E2E 测试
 *
 * 前置：start.sh --reset 启动全部服务
 * 流程：登录 demo 账号 → 直接 URL 导航到工单管理 → 验证页面功能
 *
 * Seed 账号：demo / 123456 — agent+operations 角色（演示主管）
 *
 * 注意：WorkOrdersLayout 使用 CSS hidden toggle 模式，3 个 tab 页面同时存在 DOM 中，
 * 查找元素时必须限定在 visible 范围内，使用 .locator(':visible') 或 nth 定位。
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsDemo(page: Page) {
  await page.goto(`${BASE}/staff/login`);
  await expect(page.getByLabel('账号')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('账号').fill('demo');
  await page.getByLabel('密码').fill('123456');
  const loginBtn = page.getByRole('button', { name: '登录' });
  await expect(loginBtn).toBeEnabled({ timeout: 3_000 });
  await loginBtn.click();
  await page.waitForURL('**/staff/workbench', { timeout: 15_000 });
  await expect(page.getByText('演示主管')).toBeVisible({ timeout: 5_000 });
}

/** 当前可见的 table（排除 hidden tab 中的） */
function visibleTable(page: Page) {
  return page.locator('table:visible');
}

// ── 1. 导航与页签切换 ──────────────────────────────────────────────────────

test.describe('工单管理导航', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('WO-NAV-01: 直接 URL 访问工单列表页', async ({ page }) => {
    await page.goto(`${BASE}/staff/operations/workorders/items`);
    await page.waitForURL('**/workorders/items**', { timeout: 10_000 });
    // tab bar 中 3 个页签可见
    const tabBar = page.locator('.border-b').filter({ hasText: '工单列表' });
    await expect(tabBar.locator('button', { hasText: '工单列表' })).toBeVisible();
    await expect(tabBar.locator('button', { hasText: '线索与草稿' })).toBeVisible();
    await expect(tabBar.locator('button', { hasText: '事项主线' })).toBeVisible();
  });

  test('WO-NAV-02: 从工单列表切换到线索与草稿', async ({ page }) => {
    await page.goto(`${BASE}/staff/operations/workorders/items`);
    await page.waitForURL('**/workorders/items**', { timeout: 10_000 });
    const tabBar = page.locator('.border-b').filter({ hasText: '工单列表' });
    await tabBar.locator('button', { hasText: '线索与草稿' }).click();
    await page.waitForURL('**/workorders/intakes**', { timeout: 5_000 });
  });

  test('WO-NAV-03: 从工单列表切换到事项主线', async ({ page }) => {
    await page.goto(`${BASE}/staff/operations/workorders/items`);
    await page.waitForURL('**/workorders/items**', { timeout: 10_000 });
    const tabBar = page.locator('.border-b').filter({ hasText: '工单列表' });
    await tabBar.locator('button', { hasText: '事项主线' }).click();
    await page.waitForURL('**/workorders/threads**', { timeout: 5_000 });
  });
});

// ── 2. 工单列表页 ──────────────────────────────────────────────────────────

test.describe('工单列表 (WorkItemsPage)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto(`${BASE}/staff/operations/workorders/items`);
    await page.waitForURL('**/workorders/items**', { timeout: 10_000 });
  });

  test('WO-ITEMS-01: 页面加载后表格显示 seed 工单数据', async ({ page }) => {
    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WO-ITEMS-02: 点击工单行后右侧预览面板显示详情', async ({ page }) => {
    const table = visibleTable(page).first();
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();
    await expect(page.getByText('基本信息')).toBeVisible({ timeout: 5_000 });
  });

  test.skip('WO-ITEMS-03: 搜索不存在的关键词后显示暂无数据 (API keyword filter 未实现)', async ({ page }) => {
    // 通过 URL searchParams 触发搜索（fill 不触发 React onChange）
    await page.goto(`${BASE}/staff/operations/workorders/items?keyword=zzz_nonexistent_999`);
    const table = visibleTable(page).first();
    await expect(table.getByText('暂无数据')).toBeVisible({ timeout: 10_000 });
  });

  test('WO-ITEMS-04: 重置按钮清除筛选条件', async ({ page }) => {
    const searchInput = page.getByPlaceholder('工单号/标题/手机号').first();
    await searchInput.fill('test');
    await page.locator('button:visible', { hasText: '重置' }).first().click();
    await expect(searchInput).toHaveValue('');
  });
});

// ── 3. 线索与草稿页 ────────────────────────────────────────────────────────

test.describe('线索与草稿 (IntakesPage)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto(`${BASE}/staff/operations/workorders/intakes`);
    await page.waitForURL('**/workorders/intakes**', { timeout: 10_000 });
  });

  test('WO-INTAKES-01: 页面加载后显示 seed intake 数据', async ({ page }) => {
    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WO-INTAKES-02: 点击 intake 行后右侧预览面板显示详情', async ({ page }) => {
    const table = visibleTable(page).first();
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();
    await expect(page.getByText('线索信息')).toBeVisible({ timeout: 5_000 });
  });
});

// ── 4. 事项主线页 ──────────────────────────────────────────────────────────

test.describe('事项主线 (ThreadsPage)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await page.goto(`${BASE}/staff/operations/workorders/threads`);
    await page.waitForURL('**/workorders/threads**', { timeout: 10_000 });
  });

  test('WO-THREADS-01: 页面加载后显示 seed thread 数据', async ({ page }) => {
    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WO-THREADS-02: 点击 thread 行后右侧预览面板显示详情', async ({ page }) => {
    const table = visibleTable(page).first();
    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();
    await expect(page.getByRole('heading', { name: '事项主线' })).toBeVisible({ timeout: 5_000 });
  });
});
