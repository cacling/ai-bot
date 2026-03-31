/**
 * 测试用例面板 E2E — 验证版本绑定测试用例的生成、列表展示、单条/全量执行
 *
 * 前置条件：全栈服务已启动（./start.sh --reset）
 * 运行：cd frontend/tests/e2e && npx playwright test platform/skill-mgmt/testcase-panel.ui.spec.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5173';
const SKILL_ID = 'bill-inquiry';

// ── Helpers ────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE}/staff/login`);
  await page.getByLabel('账号').fill('demo');
  await page.getByLabel('密码').fill('123456');
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/staff/workbench', { timeout: 10_000 });
}

async function navigateToSkillManager(page: Page) {
  await page.goto(`${BASE}/staff/operations/knowledge/skills`);
  await page.waitForTimeout(2000);
}

async function selectSkill(page: Page, skillId: string) {
  const skillLink = page.getByText(skillId).first();
  await expect(skillLink).toBeVisible({ timeout: 10_000 });
  await skillLink.click();
  await page.waitForTimeout(2000);
}

/** 切换右侧到「测试」Tab */
async function switchToTestTab(page: Page) {
  const testBtn = page.getByRole('button', { name: /测试/ });
  await expect(testBtn).toBeVisible({ timeout: 5_000 });
  await testBtn.click();
  await page.waitForTimeout(500);
}

/** 切换测试 Sub-tab 到「用例」 */
async function switchToTestCasesSubTab(page: Page) {
  const casesBtn = page.getByText('用例', { exact: true });
  await expect(casesBtn).toBeVisible({ timeout: 3_000 });
  await casesBtn.click();
  await page.waitForTimeout(300);
}

/** 切换测试 Sub-tab 到「对话」 */
async function switchToChatSubTab(page: Page) {
  const chatBtn = page.getByText('对话', { exact: true });
  await expect(chatBtn).toBeVisible({ timeout: 3_000 });
  await chatBtn.click();
  await page.waitForTimeout(300);
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe.serial('测试用例面板', () => {
  test.setTimeout(300_000);

  test('TC-PANEL-01: 测试 Tab 显示用例/对话 sub-tab 切换', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);

    // 两个 sub-tab 都应可见
    await expect(page.getByText('用例', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('对话', { exact: true })).toBeVisible();
  });

  test('TC-PANEL-02: 用例 sub-tab 默认显示空状态或已有用例', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 应显示「生成用例」按钮（无论有无 manifest）
    const generateBtn = page.getByRole('button', { name: /生成用例/ });
    const regenBtn = page.getByRole('button', { name: /重新生成/ });
    const hasGenerate = await generateBtn.isVisible().catch(() => false);
    const hasRegen = await regenBtn.isVisible().catch(() => false);

    // 至少一个按钮可见：未生成时显示「生成用例」，已生成时显示「重新生成」
    expect(hasGenerate || hasRegen, '应显示生成或重新生成按钮').toBe(true);
  });

  test('TC-PANEL-03: 点击生成用例后显示用例列表', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 点击生成（可能是「生成用例」或「重新生成」）
    const generateBtn = page.getByRole('button', { name: /生成用例/ });
    const regenBtn = page.getByRole('button', { name: /重新生成/ });
    const hasGenerate = await generateBtn.isVisible().catch(() => false);

    if (hasGenerate) {
      await generateBtn.click();
    } else {
      await regenBtn.click();
    }

    // 生成中应显示 loading 状态
    await expect(page.getByText(/生成中/)).toBeVisible({ timeout: 5_000 });

    // 等待生成完成并出现用例列表（2 阶段 LLM pipeline 约需 2 分钟）
    await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 180_000 });
  });

  test('TC-PANEL-04: 分类筛选 pills 可见且可交互', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 等待 manifest 加载（假设前一个 test 已生成）
    await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 15_000 });

    // 分类 pill 按钮应可见（用 role 精确匹配避免 strict mode）
    const pills = page.locator('button.rounded-full');
    await expect(pills.getByText('全部')).toBeVisible();
    await expect(pills.getByText('功能')).toBeVisible();
    await expect(pills.getByText('边界')).toBeVisible();
    await expect(pills.getByText('异常')).toBeVisible();
    await expect(pills.getByText('状态')).toBeVisible();

    // 点击「功能」筛选
    await pills.getByText('功能').click();
    await page.waitForTimeout(300);

    // 列表中应只剩 functional 分组标题
    const functionalHeader = page.getByText('functional').first();
    await expect(functionalHeader).toBeVisible({ timeout: 3_000 });
  });

  test('TC-PANEL-05: 点击用例行显示底部详情区', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 等待用例列表
    const firstCase = page.getByText(/TC-\d{3}/).first();
    await expect(firstCase).toBeVisible({ timeout: 15_000 });

    // 点选第一条
    await firstCase.click();
    await page.waitForTimeout(500);

    // 底部详情区应显示用例定义（Turns / Assertions）
    await expect(page.getByText('Turns:')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Assertions:')).toBeVisible();
  });

  test('TC-PANEL-06: 运行单条用例并显示结果', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 确保先切到「全部」分类
    await page.locator('button.rounded-full').getByText('全部').click();
    await page.waitForTimeout(300);

    // 等待用例列表
    const firstCase = page.getByText(/TC-\d{3}/).first();
    await expect(firstCase).toBeVisible({ timeout: 15_000 });

    // 点选用例
    await firstCase.click();
    await page.waitForTimeout(300);

    // 找到该行的运行按钮（Play 图标 SVG）
    // 运行按钮在选中行上才显示（opacity 控制）
    // 使用 locator 链找到选中行内的 Play 按钮
    const selectedRow = page.locator('.ring-1').first();
    const playBtn = selectedRow.locator('button').last();
    await playBtn.click();

    // 等待执行完成（Agent 调用可能需要 30-60s）
    // 执行完成后详情区应出现「断言结果」和「对话记录」
    await expect(page.getByText('断言结果')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('对话记录')).toBeVisible();

    // 应显示通过/失败的断言结果
    const passOrFail = page.locator('text=/passed|failed|pass|fail/i').first();
    await expect(passOrFail).toBeVisible({ timeout: 5_000 });
  });

  test('TC-PANEL-07: 运行全部用例并显示统计', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 等待用例列表
    await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 15_000 });

    // 点击「运行全部」
    const runAllBtn = page.getByRole('button', { name: /运行全部/ });
    await expect(runAllBtn).toBeVisible({ timeout: 5_000 });
    await runAllBtn.click();

    // 执行中应显示 loading 状态
    await expect(page.getByText(/执行中/)).toBeVisible({ timeout: 5_000 });

    // 等待全部执行完成（多条用例 × Agent 调用，超时拉长）
    await expect(page.getByText(/执行中/)).not.toBeVisible({ timeout: 300_000 });

    // 应显示统计信息（pass / fail）
    await expect(page.getByText(/\d+ pass/)).toBeVisible({ timeout: 10_000 });
  });

  test('TC-PANEL-08: 切换到对话 sub-tab 后聊天式测试 UI 可用', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToChatSubTab(page);

    // 对话 sub-tab 应显示聊天式测试的提示（点击顶部运行测试开始 或 输入消息开始测试）
    const chatPrompt = page.getByText(/开始测试|开始/).first();
    await expect(chatPrompt).toBeVisible({ timeout: 5_000 });
  });

  test('TC-PANEL-09: 用例/对话 sub-tab 切换不丢失用例列表数据', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 等待用例列表
    await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 15_000 });

    // 记录用例数
    const caseCount = await page.getByText(/TC-\d{3}/).count();
    expect(caseCount).toBeGreaterThan(0);

    // 切换到对话再切回用例
    await switchToChatSubTab(page);
    await page.waitForTimeout(500);
    await switchToTestCasesSubTab(page);
    await page.waitForTimeout(500);

    // 用例列表应保持不变（用 >= 因为详情区可能也显示 TC-xxx）
    const caseCountAfter = await page.getByText(/TC-\d{3}/).count();
    expect(caseCountAfter).toBeGreaterThanOrEqual(caseCount);
  });

  test('TC-PANEL-10: 详情区可收起/展开', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToTestTab(page);
    await switchToTestCasesSubTab(page);

    // 等待用例列表
    await expect(page.getByText(/TC-\d{3}/).first()).toBeVisible({ timeout: 15_000 });

    // 详情区 toggle 按钮（<button> 包含 <span>详情</span>）
    const detailToggle = page.getByRole('button', { name: '详情', exact: true });
    await expect(detailToggle).toBeVisible({ timeout: 5_000 });

    // 默认展开 — 应显示「选择一条用例查看详情」
    const detailHint = page.getByText('选择一条用例查看详情');
    await expect(detailHint).toBeVisible({ timeout: 3_000 });

    // 点击收起
    await detailToggle.click();
    await page.waitForTimeout(300);

    // 收起后提示文案应消失
    await expect(detailHint).not.toBeVisible({ timeout: 2_000 });

    // 再次点击展开
    await detailToggle.click();
    await page.waitForTimeout(300);
    await expect(detailHint).toBeVisible({ timeout: 2_000 });
  });
});
