/**
 * WFM-02: Schedule Plan Creation & Generation
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, planCard, BASE } from '../../fixtures/wfm-helpers';

test.describe('WFM-02: Schedule Plan Create & Generate', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await navigateToWfm(page, 'plans');
  });

  test('WFM-02a: create a new plan via dialog', async ({ page }) => {
    const uniqueName = `新建-${Date.now()}`;
    await page.locator('button:visible', { hasText: '新建计划' }).click();

    const dialog = page.locator('.fixed.inset-0');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator('input[type="text"]').fill(uniqueName);
    await dialog.locator('input[type="date"]').first().fill('2026-05-01');
    await dialog.locator('input[type="date"]').last().fill('2026-05-07');

    await dialog.locator('button', { hasText: '创建' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    const card = planCard(page, uniqueName);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText('草稿')).toBeVisible();
  });

  test('WFM-02b: generate a draft plan changes status to 已生成', async ({ page }) => {
    const name = `Gen-${Date.now()}`;
    await page.request.post(`${BASE}/api/wfm/plans`, {
      data: { name, startDate: '2026-06-01', endDate: '2026-06-07' },
    });

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });

    await card.locator('button', { hasText: '生成' }).click();
    await expect(card.getByText('已生成')).toBeVisible({ timeout: 10_000 });
  });

  test('WFM-02c: selecting a generated plan shows timeline with staff rows', async ({ page }) => {
    const name = `TL-${Date.now()}`;
    const res = await page.request.post(`${BASE}/api/wfm/plans`, {
      data: { name, startDate: '2026-07-01', endDate: '2026-07-07' },
    });
    const plan = await res.json();
    await page.request.post(`${BASE}/api/wfm/plans/${plan.id}/generate`);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();

    const staffCells = page.locator('.w-\\[100px\\]');
    await expect(staffCells.first()).toBeVisible({ timeout: 10_000 });
    expect(await staffCells.count()).toBeGreaterThan(0);

    const blocks = page.locator('div.rounded[style*="background-color"]');
    await expect(blocks.first()).toBeVisible({ timeout: 10_000 });
  });
});
