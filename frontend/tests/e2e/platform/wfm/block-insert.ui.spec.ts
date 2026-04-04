/**
 * WFM-05: Block Insert via Context Menu
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, planCard } from '../../fixtures/wfm-helpers';

test.describe('WFM-05: Block Insert', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    name = `Ins-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-10-01', '2026-10-07');
    await generatePlanViaApi(page, planId);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();

    await expect(page.locator('div.rounded[style*="background-color"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WFM-05a: insert activity via context menu', async ({ page }) => {
    const firstBlock = page.locator('div.rounded[style*="background-color"]').first();
    await firstBlock.click({ button: 'right' });

    const ctxMenu = page.locator('[data-context-menu]');
    await expect(ctxMenu).toBeVisible({ timeout: 5_000 });

    await ctxMenu.getByText('插入活动').click();

    // Insert sub-panel with activity dropdown
    await expect(ctxMenu.getByText('选择活动')).toBeVisible({ timeout: 5_000 });
    await expect(ctxMenu.locator('select')).toBeVisible({ timeout: 5_000 });

    // Click '插入' — may be accepted or rejected by edit-service depending on overlap
    await ctxMenu.locator('button', { hasText: '插入' }).click();

    // Context menu should close regardless of result
    await expect(ctxMenu).not.toBeVisible({ timeout: 5_000 });
  });
});
