/**
 * WFM-01: Master Data CRUD — 活动类型 sub-tab
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, visibleTable } from '../../fixtures/wfm-helpers';

test.describe('WFM-01: Master Data CRUD (Activities)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await navigateToWfm(page, 'master');
  });

  test('WFM-01a: activities table loads with seed data', async ({ page }) => {
    await page.locator('button:visible', { hasText: '活动类型' }).click();

    const table = visibleTable(page).first();
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.locator('th', { hasText: '编码' })).toBeVisible({ timeout: 5_000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('WFM-01b: create a new activity via dialog', async ({ page }) => {
    await page.locator('button:visible', { hasText: '活动类型' }).click();

    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 5_000 });
    const beforeCount = await table.locator('tbody tr').count();

    await page.locator('button:visible', { hasText: '+ 新建' }).click();

    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('input').first().fill('E2E_TEST');
    await dialog.locator('input').nth(1).fill('E2E测试活动');

    await dialog.locator('button', { hasText: '保存' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await expect(table.locator('tbody tr')).toHaveCount(beforeCount + 1, { timeout: 5_000 });
    await expect(table.getByText('E2E_TEST')).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-01c: edit an activity name', async ({ page }) => {
    await page.locator('button:visible', { hasText: '活动类型' }).click();

    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 5_000 });

    const firstRow = table.locator('tbody tr').first();
    await firstRow.locator('button', { hasText: '编辑' }).click();

    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const nameInput = dialog.locator('input').nth(1);
    await nameInput.clear();
    await nameInput.fill('已修改名称');

    await dialog.locator('button', { hasText: '保存' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await expect(table.getByText('已修改名称')).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-01d: delete an activity with confirm dialog', async ({ page }) => {
    await page.locator('button:visible', { hasText: '活动类型' }).click();

    const table = visibleTable(page).first();
    await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 5_000 });
    const beforeCount = await table.locator('tbody tr').count();

    page.on('dialog', d => d.accept());

    const lastRow = table.locator('tbody tr').last();
    await lastRow.locator('button', { hasText: '删除' }).click();

    await expect(table.locator('tbody tr')).toHaveCount(beforeCount - 1, { timeout: 5_000 });
  });
});
