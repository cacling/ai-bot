/**
 * WFM-03: Timeline Rendering
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateToWfm, createPlanViaApi, generatePlanViaApi, planCard } from '../../fixtures/wfm-helpers';

test.describe('WFM-03: Timeline Rendering', () => {
  let planId: number;
  let name: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    name = `TLR-${Date.now()}`;
    planId = await createPlanViaApi(page, name, '2026-08-01', '2026-08-07');
    await generatePlanViaApi(page, planId);

    await navigateToWfm(page, 'plans');
    const card = planCard(page, name);
    await expect(card).toBeVisible({ timeout: 5_000 });
    await card.click();
    await expect(page.locator('.w-\\[100px\\]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('WFM-03a: hour ruler shows 00:00 to 23:00', async ({ page }) => {
    const ruler = page.locator('.sticky');
    await expect(ruler.getByText('00:00')).toBeVisible({ timeout: 5_000 });
    await expect(ruler.getByText('12:00')).toBeVisible();

    const ruler23 = ruler.getByText('23:00');
    await ruler23.scrollIntoViewIfNeeded();
    await expect(ruler23).toBeVisible({ timeout: 5_000 });
  });

  test('WFM-03b: staff rows have colored activity blocks', async ({ page }) => {
    const staffCells = page.locator('.w-\\[100px\\]');
    expect(await staffCells.count()).toBeGreaterThan(0);

    const allBlocks = page.locator('div.rounded[style*="background-color"]');
    expect(await allBlocks.count()).toBeGreaterThan(0);
  });

  test('WFM-03c: date picker changes the timeline view', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]:visible');
    await expect(datePicker).toBeVisible({ timeout: 5_000 });

    const initialDate = await datePicker.inputValue();
    expect(initialDate).toBe('2026-08-01');

    await datePicker.fill('2026-08-02');
    await expect(page.locator('.w-\\[100px\\]').first()).toBeVisible({ timeout: 10_000 });
    await expect(datePicker).toHaveValue('2026-08-02');
  });
});
