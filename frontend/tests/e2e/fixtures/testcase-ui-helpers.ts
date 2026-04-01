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

  // 切回用例 tab，等待断言评估完成
  await switchToTestCasesSubTab(page);
  await page.waitForTimeout(500);

  // 找到用例行，等待 spinning 消失 + 状态图标出现（evaluate-assertions 可能需要几秒）
  const caseRowAgain = page.getByText(new RegExp(`${caseId}\\s*·`)).first();
  await caseRowAgain.scrollIntoViewIfNeeded();

  // 等待该行出现绿/红/黄状态图标（最多 30 秒，覆盖 llm_rubric 等异步断言）
  const rowParent = caseRowAgain.locator('..');
  try {
    await expect(rowParent.locator('.text-green-500, .text-red-500, .text-amber-500').first())
      .toBeVisible({ timeout: 30_000 });
  } catch { /* timeout = unknown */ }

  await caseRowAgain.click();
  await page.waitForTimeout(200);

  // 检测状态图标：在整个用例列表区域查找，不限于 .ring-1 行
  const listArea = page.locator('.overflow-y-auto').first();
  const greenCount = await listArea.locator('.text-green-500').count().catch(() => 0);
  const redCount = await listArea.locator('.text-red-500').count().catch(() => 0);
  const amberCount = await listArea.locator('.text-amber-500').count().catch(() => 0);

  // 查找当前用例行的状态：行内包含 caseId 的最近祖先
  const row = page.locator('.ring-1').first();
  if (await row.locator('.text-green-500').first().isVisible().catch(() => false)) return 'passed';
  if (await row.locator('.text-red-500').first().isVisible().catch(() => false)) return 'failed';
  if (await row.locator('.text-amber-500').first().isVisible().catch(() => false)) return 'infra_error';

  // fallback: 如果 .ring-1 内没找到，但页面上有状态图标，用全局计数
  if (greenCount > 0 || redCount > 0 || amberCount > 0) {
    // 有图标但不在 .ring-1 内，说明选择器对不上，用 debug 信息
    console.log(`[runCaseInChat] ${caseId}: icon in list (g=${greenCount} r=${redCount} a=${amberCount}) but not in .ring-1`);
  }
  return 'unknown';
}

/**
 * 逐条在对话 tab 中运行全部用例，每条都通过 Play 按钮触发实时对话。
 * 返回 { passed, failed, total, results }
 */
/**
 * 点击「运行全部」按钮执行全部用例（后端批量模式），等待完成后读取统计。
 * 注意：单条 runCaseInChat 会切到对话 tab（TestCasePanel 卸载导致状态丢失），
 * 因此全量执行用后端批量模式更可靠。
 */
export async function runAllCasesInChat(page: Page): Promise<{
  passed: number;
  failed: number;
  total: number;
  results: Array<{ caseId: string; status: string }>;
}> {
  await switchToTestCasesSubTab(page);
  // cooldown：等前一个技能的 LLM 请求处理完毕，避免资源竞争
  await page.waitForTimeout(3000);

  const runAllBtn = page.getByRole('button', { name: /运行全部/ });
  await expect(runAllBtn).toBeVisible({ timeout: 5_000 });
  await runAllBtn.click();

  // 等待执行完成：先等「执行中」出现，再等它消失
  // 如果「执行中」没出现（用例秒完或出错），直接继续
  const executing = page.getByText(/执行中/);
  const appeared = await executing.isVisible().catch(() => false)
    || await executing.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
  if (appeared) {
    await expect(executing).not.toBeVisible({ timeout: 600_000 });
  }
  await page.waitForTimeout(2000);

  // 读取统计文本（pass / fail）
  const statsText = await page.getByText(/\d+ pass/).first().textContent({ timeout: 15_000 }).catch(() => '');
  const passMatch = statsText.match(/(\d+)\s*pass/);
  const failMatch = statsText.match(/(\d+)\s*fail/);
  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;

  return { passed, failed, total: passed + failed, results: [] };
}
