/**
 * WFM-12: 例外安排管理 — 查看种子例外数据 + 新建例外
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, visibleTable } from '../../fixtures/wfm-helpers';

test.describe('WFM-12 例外安排管理', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
    await navigateToWfm(page, 'leaves');
  });

  test('WFM-12a: 切换到例外安排标签，验证种子例外数据', async ({ page }) => {
    await page.locator('button:visible', { hasText: '例外安排' }).click();

    // 等候 DOM 更新 — 例外安排 tab 切换后 visible table 变为例外表
    await page.waitForTimeout(500);
    const table = visibleTable(page).first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    await expect(table.locator('tbody').getByText('agent_005')).toBeVisible({ timeout: 5_000 });
    await expect(table.locator('tbody').getByText('新系统培训')).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-12b: 新建例外安排并验证出现在表格中', async ({ page }) => {
    await page.locator('button:visible', { hasText: '例外安排' }).click();
    await page.waitForTimeout(500);

    await page.locator('button:visible', { hasText: '+ 新建例外' }).click();

    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('input[placeholder*="坐席ID"]').fill('agent_003');

    await expect(dialog.locator('select').first()).toBeVisible({ timeout: 5_000 });

    const startInput = dialog.locator('input[type="datetime-local"]').first();
    const endInput = dialog.locator('input[type="datetime-local"]').last();
    await startInput.fill('2026-04-10T14:00');
    await endInput.fill('2026-04-10T16:00');

    await dialog.locator('input[placeholder*="备注"]').fill('E2E测试例外');

    await dialog.locator('button', { hasText: '提交' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    const table = visibleTable(page).first();
    await expect(table.locator('tbody').getByText('E2E测试例外').first()).toBeVisible({ timeout: 5_000 });
  });
});
