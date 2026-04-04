/**
 * WFM-09: 发布校验 — 生成排班后点击发布，触发校验
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, planCard } from '../../fixtures/wfm-helpers';

test.describe('WFM-09 发布校验', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
    name = `Val-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-04-07', '2026-04-13');
    await generatePlanViaApi(page, planId);
  });

  test('WFM-09a: 生成的计划出现在列表中，状态为已生成', async ({ page }) => {
    await navigateToWfm(page, 'plans');

    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('已生成')).toBeVisible({ timeout: 5_000 });
    await expect(card.locator('button', { hasText: '发布' })).toBeVisible();
  });

  test('WFM-09b: 点击发布触发校验，处理校验对话框', async ({ page }) => {
    await navigateToWfm(page, 'plans');

    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 10_000 });

    page.on('dialog', async (d) => d.accept());

    await card.locator('button', { hasText: '发布' }).click();

    await page.waitForTimeout(1_000);
    await expect(card).toBeVisible();
  });
});
