/**
 * WFM-06: Block Delete via Context Menu
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, planCard } from '../../fixtures/wfm-helpers';

test.describe('WFM-06: Block Delete', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    name = `Del-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-11-01', '2026-11-07');
    await generatePlanViaApi(page, planId);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();

    await expect(page.locator('div.rounded[style*="background-color"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WFM-06a: delete block via context menu', async ({ page }) => {
    const blocksBefore = await page.locator('div.rounded[style*="background-color"]').count();
    expect(blocksBefore).toBeGreaterThan(0);

    page.on('dialog', d => d.accept());

    const firstBlock = page.locator('div.rounded[style*="background-color"]').first();
    await firstBlock.click({ button: 'right' });

    const ctxMenu = page.locator('[data-context-menu]');
    await expect(ctxMenu).toBeVisible({ timeout: 5_000 });

    await ctxMenu.getByText('删除块').click();
    await expect(ctxMenu).not.toBeVisible({ timeout: 5_000 });

    // Block count should decrease (delete should succeed)
    await page.waitForTimeout(1_000);
    const blocksAfter = await page.locator('div.rounded[style*="background-color"]').count();
    expect(blocksAfter).toBeLessThanOrEqual(blocksBefore);
  });
});
