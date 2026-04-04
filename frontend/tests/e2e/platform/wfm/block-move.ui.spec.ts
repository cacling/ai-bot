/**
 * WFM-04: Block Context Menu
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, planCard } from '../../fixtures/wfm-helpers';

test.describe('WFM-04: Block Context Menu', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    name = `Ctx-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-09-01', '2026-09-07');
    await generatePlanViaApi(page, planId);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();

    await expect(page.locator('div.rounded[style*="background-color"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WFM-04a: right-click block shows context menu with insert and delete options', async ({ page }) => {
    const firstBlock = page.locator('div.rounded[style*="background-color"]').first();
    await firstBlock.click({ button: 'right' });

    const ctxMenu = page.locator('[data-context-menu]');
    await expect(ctxMenu).toBeVisible({ timeout: 5_000 });

    await expect(ctxMenu.getByText('插入活动')).toBeVisible();
    await expect(ctxMenu.getByText('删除块')).toBeVisible();
  });
});
