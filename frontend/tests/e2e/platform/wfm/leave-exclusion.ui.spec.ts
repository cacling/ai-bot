/**
 * WFM-07: 假勤排除 — 假勤列表与审批按钮验证
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, visibleTable } from '../../fixtures/wfm-helpers';

test.describe('WFM-07 假勤排除验证', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
    await navigateToWfm(page, 'leaves');
  });

  test('WFM-07a: 假勤管理页展示种子假勤数据', async ({ page }) => {
    const table = visibleTable(page).first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(4);

    await expect(table.locator('tbody').getByText('agent_001')).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-07b: pending 假勤显示批准/拒绝按钮，approved 不显示', async ({ page }) => {
    const table = visibleTable(page).first();
    await expect(table).toBeVisible({ timeout: 10_000 });

    const pendingRow = table.locator('tbody tr').filter({ hasText: 'pending' });
    await expect(pendingRow.first()).toBeVisible({ timeout: 5_000 });
    await expect(pendingRow.first().getByText('批准')).toBeVisible();
    await expect(pendingRow.first().getByText('拒绝')).toBeVisible();

    const approvedRow = table.locator('tbody tr').filter({ hasText: 'approved' }).first();
    await expect(approvedRow).toBeVisible({ timeout: 5_000 });
    await expect(approvedRow.getByText('批准')).not.toBeVisible();
  });
});
