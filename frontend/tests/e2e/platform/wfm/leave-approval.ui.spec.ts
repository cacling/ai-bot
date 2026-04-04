/**
 * WFM-11: 假勤审批流 — 批准/拒绝假勤申请，验证状态变更
 *
 * 测试审批操作：
 *   - 通过 API 创建 pending 假勤
 *   - 在 UI 中点击 '批准'，验证状态变为 approved
 *   - 通过 API 创建另一条 pending 假勤
 *   - 在 UI 中点击 '拒绝'，验证状态变为 rejected
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, visibleTable, BASE } from '../../fixtures/wfm-helpers';

/** Create a leave via API, return its id */
async function createLeaveViaApi(page: import('@playwright/test').Page, staffId: string): Promise<number> {
  const res = await page.request.post(`${BASE}/api/wfm/leaves`, {
    data: {
      staffId,
      leaveTypeId: 1, // First leave type from seed (年假)
      startTime: '2026-04-14T00:00:00Z',
      endTime: '2026-04-14T23:59:59Z',
      isFullDay: true,
      isPrePlanned: false,
    },
  });
  const body = await res.json();
  return body.id;
}

test.describe('WFM-11 假勤审批', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
  });

  test('WFM-11a: 点击批准，假勤状态变为 approved', async ({ page }) => {
    // Create a pending leave via API
    const leaveId = await createLeaveViaApi(page, 'agent_004');

    await navigateToWfm(page, 'leaves');
    const table = visibleTable(page);
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Find the row for agent_004 with pending status
    const targetRow = page.locator('tbody tr').filter({ hasText: 'agent_004' }).filter({ hasText: 'pending' });
    await expect(targetRow.first()).toBeVisible({ timeout: 5_000 });

    // Click '批准'
    await targetRow.first().getByText('批准').click();

    // Verify status changes to 'approved'
    const approvedRow = page.locator('tbody tr').filter({ hasText: 'agent_004' }).filter({ hasText: 'approved' });
    await expect(approvedRow.first()).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-11b: 点击拒绝，假勤状态变为 rejected', async ({ page }) => {
    // Create a pending leave via API
    const leaveId = await createLeaveViaApi(page, 'agent_006');

    await navigateToWfm(page, 'leaves');
    const table = visibleTable(page);
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Find the row for agent_006 with pending status
    const targetRow = page.locator('tbody tr').filter({ hasText: 'agent_006' }).filter({ hasText: 'pending' });
    await expect(targetRow.first()).toBeVisible({ timeout: 5_000 });

    // Click '拒绝'
    await targetRow.first().getByText('拒绝').click();

    // Verify status changes to 'rejected'
    const rejectedRow = page.locator('tbody tr').filter({ hasText: 'agent_006' }).filter({ hasText: 'rejected' });
    await expect(rejectedRow.first()).toBeVisible({ timeout: 5_000 });
  });
});
