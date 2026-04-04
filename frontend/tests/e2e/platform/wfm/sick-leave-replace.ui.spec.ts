/**
 * WFM-08: 新建假勤申请 — 通过对话框创建假勤并验证 pending 状态
 *
 * 测试创建假勤的 UI 流程：
 *   - 点击 '+ 新建假勤' 打开表单
 *   - 填写 staffId、leaveType、日期
 *   - 提交后验证新记录出现在表格中
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, visibleTable, BASE } from '../../fixtures/wfm-helpers';

test.describe('WFM-08 新建假勤申请', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
    await navigateToWfm(page, 'leaves');
  });

  test('WFM-08a: 点击新建假勤，填写表单并提交', async ({ page }) => {
    // Record initial row count
    const table = visibleTable(page);
    await expect(table).toBeVisible({ timeout: 10_000 });
    const initialRows = await page.locator('tbody tr').count();

    // Click the '+ 新建假勤' button
    await page.getByText('+ 新建假勤').click();

    // Wait for dialog to appear
    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('新建假勤申请')).toBeVisible();

    // Fill in staffId
    await page.locator('input[placeholder*="坐席ID"]').fill('agent_004');

    // Select leave type (first option is auto-selected from API)
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5_000 });

    // Fill dates
    const startInput = dialog.locator('input[type="datetime-local"]').first();
    const endInput = dialog.locator('input[type="datetime-local"]').last();
    await startInput.fill('2026-04-11T08:00');
    await endInput.fill('2026-04-11T17:00');

    // Submit
    await dialog.getByText('提交').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('WFM-08b: 新建假勤后以 pending 状态出现在表格中', async ({ page }) => {
    // Create a leave with a unique staffId via the UI
    const staffId = 'agent_006';

    await page.getByText('+ 新建假勤').click();
    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page.locator('input[placeholder*="坐席ID"]').fill(staffId);
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5_000 });

    const startInput = dialog.locator('input[type="datetime-local"]').first();
    const endInput = dialog.locator('input[type="datetime-local"]').last();
    await startInput.fill('2026-04-12T08:00');
    await endInput.fill('2026-04-12T17:00');

    await dialog.getByText('提交').click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Verify the new leave appears in the table with 'pending' status
    const newRow = page.locator('tbody tr').filter({ hasText: staffId });
    await expect(newRow.last()).toBeVisible({ timeout: 5_000 });
    await expect(newRow.last().getByText('pending')).toBeVisible();
  });
});
