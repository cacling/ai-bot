/**
 * testcase-ui-helpers.ts — 通过 UI 操作生成和运行自动测试用例
 *
 * 供各业务技能 .sop.spec.ts 复用。
 * 所有操作通过 Playwright Page 对象操控浏览器完成，不直接调用后端 API。
 *
 * 运行用例时会逐条点击 Play 按钮，自动切到对话 tab 实时显示消息流，
 * 执行完成后切回用例 tab 读取断言结果。
 */
import { expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';

/** 设置更大的浏览器窗口，确保页面内容完整可见 */
export async function setLargeViewport(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
}

// ── 导航 helpers ────────────────────────────────────────────────────────────

export async function login(page: Page) {
  await setLargeViewport(page);
  await page.goto(`${BASE}/staff/login`);
  await page.getByLabel('账号').fill('demo');
  await page.getByLabel('密码').fill('123456');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
  // 收起左侧菜单栏，腾出更多空间给技能管理区域
  await page.evaluate(() => localStorage.setItem('agent.sidebar.collapsed', 'true'));
}

export async function navigateToSkillManager(page: Page) {
  await page.goto(`${BASE}/staff/operations/knowledge/skills`);
  await page.waitForTimeout(2000);
}

export async function selectSkill(page: Page, skillId: string) {
  const skillLink = page.getByText(skillId).first();
  await expect(skillLink).toBeVisible({ timeout: 10_000 });
  await skillLink.click();
  await page.waitForTimeout(2000);
}

export async function switchToTestTab(page: Page) {
  const testBtn = page.getByRole('button', { name: /测试/ });
  await expect(testBtn).toBeVisible({ timeout: 5_000 });
  await testBtn.click();
  await page.waitForTimeout(500);
}

export async function switchToTestCasesSubTab(page: Page) {
  // sub-tab 按钮在 bg-muted 容器中，带 text-xs class
  const casesBtn = page.locator('button.text-xs').filter({ hasText: '用例' }).first();
  await expect(casesBtn).toBeVisible({ timeout: 3_000 });
  await casesBtn.click();
  await page.waitForTimeout(300);
}

export async function switchToChatSubTab(page: Page) {
  const chatBtn = page.locator('button.text-xs').filter({ hasText: '对话' }).first();
  await expect(chatBtn).toBeVisible({ timeout: 3_000 });
  await chatBtn.click();
  await page.waitForTimeout(300);
}

// ── 测试用例操作 ────────────────────────────────────────────────────────────

/**
 * 进入技能测试用例页：login → skill manager → select skill → test tab → cases sub-tab
 */
export async function navigateToTestCases(page: Page, skillId: string) {
  await login(page);
  await navigateToSkillManager(page);
  await selectSkill(page, skillId);
  await switchToTestTab(page);
  await switchToTestCasesSubTab(page);
}

/**
 * 点击「重新生成」或「生成用例」按钮，等待用例列表出现。
 * 返回生成的用例数量。
 */
export async function regenerateTestCases(page: Page): Promise<number> {
  const regenBtn = page.getByRole('button', { name: /重新生成/ });
  const genBtn = page.getByRole('button', { name: /生成用例/ });

  if (await regenBtn.isVisible().catch(() => false)) {
    await regenBtn.click();
  } else {
    await expect(genBtn).toBeVisible({ timeout: 5_000 });
    await genBtn.click();
  }

  // 等待用例列表出现（LLM 生成需要 30-120s）
  await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 180_000 });

  // 切到全部分类
  const allFilter = page.locator('button.rounded-full').getByText('全部');
  if (await allFilter.isVisible().catch(() => false)) {
    await allFilter.click();
    await page.waitForTimeout(300);
  }

  return await page.getByText(/TC-\d{3}/).count();
}

/**
 * 获取用例列表中所有不重复的 TC-xxx ID
 */
export async function getVisibleCaseIds(page: Page): Promise<string[]> {
  // 用例列表行格式: "TC-XXX · title"（带中点），详情区格式: "TC-XXX: title"（带冒号）
  // 只匹配列表行，避免详情区的 TC-xxx 被误收集
  const elements = page.getByText(/TC-\d{3}\s*·/);
  const count = await elements.count();
  const ids = new Set<string>();
  for (let i = 0; i < count; i++) {
    const text = await elements.nth(i).textContent();
    const match = text?.match(/TC-\d{3}/);
    if (match) ids.add(match[0]);
  }
  return [...ids].sort();
}

/**
 * 运行单条用例：点击 Play → 自动切到对话 tab 实时显示 → 完成后切回用例 tab 读取结果。
 * 返回 'passed' | 'failed' | 'infra_error' | 'unknown'
 */
export async function runCaseInChat(
  page: Page,
  caseId: string,
): Promise<'passed' | 'failed' | 'infra_error' | 'unknown'> {
  // 确保在用例 sub-tab
  await switchToTestCasesSubTab(page);
  await page.waitForTimeout(300);

  // 点选用例行（可能需要滚动）
  const caseRow = page.getByText(new RegExp(`${caseId}\\s*·`)).first();
  await caseRow.scrollIntoViewIfNeeded();
  await expect(caseRow).toBeVisible({ timeout: 5_000 });
  await caseRow.click();
  await page.waitForTimeout(300);

  // 找到选中行的运行按钮并点击
  const selectedRow = page.locator('.ring-1').first();
  const playBtn = selectedRow.locator('button').last();
  await playBtn.click();

  // 点击运行后会自动切到对话 tab，等待切换完成
  await page.waitForTimeout(1000);

  // 等待对话 tab 中出现助手回复（bot 气泡 .rounded-tl-none）
  await expect(page.locator('.rounded-2xl.rounded-tl-none').first()).toBeVisible({ timeout: 90_000 });

  // 等待 typing dots 消失（表示所有 turn 执行完）
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1000);

  // 切回用例 tab 查看结果
  await switchToTestCasesSubTab(page);
  await page.waitForTimeout(500);

  // 点选同一用例查看状态图标（可能需要滚动）
  const caseRowAgain = page.getByText(new RegExp(`${caseId}\\s*·`)).first();
  await caseRowAgain.scrollIntoViewIfNeeded();
  await caseRowAgain.click();
  await page.waitForTimeout(300);

  // 读取状态：绿色=passed, 红色=failed, 黄色=infra_error
  const row = page.locator('.ring-1').first();
  if (await row.locator('.text-green-500').first().isVisible().catch(() => false)) return 'passed';
  if (await row.locator('.text-red-500').first().isVisible().catch(() => false)) return 'failed';
  if (await row.locator('.text-amber-500').first().isVisible().catch(() => false)) return 'infra_error';
  return 'unknown';
}

/**
 * 逐条在对话 tab 中运行全部用例，每条都通过 Play 按钮触发实时对话。
 * 返回 { passed, failed, total, results }
 */
export async function runAllCasesInChat(page: Page): Promise<{
  passed: number;
  failed: number;
  total: number;
  results: Array<{ caseId: string; status: string }>;
}> {
  const caseIds = await getVisibleCaseIds(page);
  const results: Array<{ caseId: string; status: string }> = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < caseIds.length; i++) {
    // 每条用例间隔 5 秒，避免触发 LLM API rate limit
    if (i > 0) await page.waitForTimeout(5000);
    const status = await runCaseInChat(page, caseIds[i]);
    results.push({ caseId: caseIds[i], status });
    if (status === 'passed') passed++;
    else failed++;
  }

  return { passed, failed, total: caseIds.length, results };
}
