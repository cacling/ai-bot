/**
 * WFM-10: 发布与回滚
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, publishPlanViaApi, planCard, BASE } from '../../fixtures/wfm-helpers';

test.describe('WFM-10 发布与回滚', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsDemo(page);
    name = `PR-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-04-07', '2026-04-13');
    await generatePlanViaApi(page, planId);
  });

  test('WFM-10a: 发布计划后状态变为已发布', async ({ page }) => {
    page.on('dialog', async (d) => d.accept());

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await card.locator('button', { hasText: '发布' }).click();

    await expect(card.getByText('已发布')).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('button', { hasText: '回滚' })).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-10b: 已发布计划回滚后状态恢复', async ({ page }) => {
    // Publish via API to skip UI validation
    await publishPlanViaApi(page, planId);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('已发布')).toBeVisible({ timeout: 5_000 });

    await card.locator('button', { hasText: '回滚' }).click();

    await expect(card.getByText('编辑中')).toBeVisible({ timeout: 10_000 });
    await expect(card.locator('button', { hasText: '发布' })).toBeVisible({ timeout: 5_000 });
  });
});
