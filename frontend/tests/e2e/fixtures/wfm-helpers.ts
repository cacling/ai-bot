/**
 * wfm-helpers.ts — Shared helpers for WFM E2E tests
 *
 * Used by: platform/wfm/*.spec.ts
 *
 * 注意：WfmLayout 使用 CSS hidden toggle 模式，4 个页面同时存在 DOM 中，
 * 所有选择器必须限定在 visible 范围内。
 */
import { type Page, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

export async function loginAsDemo(page: Page) {
  await page.goto(`${BASE}/staff/login`);
  await expect(page.getByLabel('账号')).toBeVisible({ timeout: 5_000 });
  await page.getByLabel('账号').fill('demo');
  await page.getByLabel('密码').fill('123456');
  const loginBtn = page.getByRole('button', { name: '登录' });
  await expect(loginBtn).toBeEnabled({ timeout: 3_000 });
  await loginBtn.click();
  await page.waitForURL('**/staff/workbench', { timeout: 15_000 });
}

export async function navigateToWfm(page: Page, sub: 'plans' | 'master' | 'leaves' | 'rule-config' = 'plans') {
  await page.goto(`${BASE}/staff/operations/wfm/${sub}`);
  await page.waitForURL(`**/wfm/${sub}**`, { timeout: 10_000 });
}

/** 当前可见的 table（排除 hidden tab 中的） */
export function visibleTable(page: Page) {
  return page.locator('table:visible');
}

/** 排班计划左侧列表容器 */
export function planList(page: Page) {
  return page.locator('.w-80');
}

/** 在左侧列表中查找指定名称的计划卡片 */
export function planCard(page: Page, name: string) {
  return planList(page).locator('.cursor-pointer').filter({ hasText: name });
}

/** Create a plan via API and return its id */
export async function createPlanViaApi(page: Page, name: string, startDate: string, endDate: string): Promise<number> {
  const res = await page.request.post(`${BASE}/api/wfm/plans`, {
    data: { name, startDate, endDate },
  });
  const data = await res.json();
  return data.id;
}

/** Generate schedule for a plan via API */
export async function generatePlanViaApi(page: Page, planId: number) {
  await page.request.post(`${BASE}/api/wfm/plans/${planId}/generate`);
}

/** Publish a plan via API */
export async function publishPlanViaApi(page: Page, planId: number) {
  await page.request.post(`${BASE}/api/wfm/plans/${planId}/publish`, {
    data: { publishedBy: 'admin', publisherName: 'E2E' },
  });
}

export { BASE };
