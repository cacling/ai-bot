/**
 * 状态图工作台 E2E — 验证双栏布局、Mermaid 编辑器、实时预览、诊断面板、全屏覆盖层
 *
 * 前置条件：全栈服务已启动（./start.sh --reset）
 * 运行：cd frontend/tests/e2e && npx playwright test platform/skill-mgmt/diagram-workbench.ui.spec.ts --headed
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

async function switchToDiagramWorkbench(page: Page) {
  const workbenchBtn = page.getByText('状态图工作台');
  await expect(workbenchBtn).toBeVisible({ timeout: 5_000 });
  await workbenchBtn.click();
  await page.waitForTimeout(1500);
}

async function switchToDocument(page: Page) {
  const docBtn = page.getByRole('button', { name: '文档' });
  await expect(docBtn).toBeVisible({ timeout: 5_000 });
  await docBtn.click();
  await page.waitForTimeout(500);
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe.serial('状态图工作台', () => {
  test.setTimeout(90_000);

  test('WB-01: 登录后进入技能管理，工作台 tab 可见', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);

    // 编辑模式下应该显示「文档 / 状态图工作台」切换
    await expect(page.getByText('状态图工作台')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: '文档' })).toBeVisible();
  });

  test('WB-02: SKILL.md 文档模式下显示双栏（左编辑器 + 右流程图）', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await page.waitForTimeout(3000);

    // 右侧流程图面板
    await expect(page.getByText(/流程图/).first()).toBeVisible({ timeout: 10_000 });
    // SVG 渲染
    const svgCount = await page.locator('svg').count();
    expect(svgCount, '双栏右侧应渲染至少一个 SVG').toBeGreaterThan(0);
  });

  test('WB-03: 切换到工作台后显示源码编辑器和诊断面板', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);

    await expect(page.getByText('状态图源码')).toBeVisible({ timeout: 5_000 });
    // 诊断面板需等待 API 返回
    await expect(page.getByText('结构与诊断')).toBeVisible({ timeout: 15_000 });
  });

  test('WB-04: CodeMirror 编辑器包含 stateDiagram-v2', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);

    const editor = page.locator('.cm-editor');
    await expect(editor).toBeVisible({ timeout: 5_000 });

    const editorText = await editor.textContent();
    expect(editorText).toContain('stateDiagram-v2');
    expect(editorText).toContain('[*]');
  });

  test('WB-05: 工作台模式右侧渲染 SVG 图表', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);

    // 等待后端 preview 返回（debounce 250ms + 网络）
    await page.waitForTimeout(4000);

    const svgCount = await page.locator('svg').count();
    expect(svgCount, '右侧应渲染至少一个 SVG').toBeGreaterThan(0);
  });

  test('WB-06: 诊断面板显示节点/连线统计', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);
    await page.waitForTimeout(4000);

    await expect(page.getByText(/节点 \d+/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/连线 \d+/).first()).toBeVisible();
  });

  test('WB-07: 诊断面板显示错误/警告/提示 badge', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);
    await page.waitForTimeout(4000);

    await expect(page.getByText(/错误 \d+/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/警告 \d+/).first()).toBeVisible();
    await expect(page.getByText(/提示 \d+/).first()).toBeVisible();
  });

  test('WB-08: 结构摘要显示起点/终点已定义', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);
    await page.waitForTimeout(4000);

    await expect(page.getByText('结构摘要')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('起点 已定义')).toBeVisible();
    await expect(page.getByText('终点 已定义')).toBeVisible();
  });

  test('WB-09: 切换回文档 tab 后源码编辑器消失，流程图面板保留', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await switchToDiagramWorkbench(page);

    await expect(page.getByText('状态图源码')).toBeVisible({ timeout: 5_000 });

    await switchToDocument(page);

    // 源码编辑器消失
    await expect(page.getByText('状态图源码')).not.toBeVisible({ timeout: 3_000 });
    // 流程图面板在文档模式下仍可见（双栏布局）
    await expect(page.getByText(/流程图/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('WB-10: 流程图面板始终有内容（SVG 或空状态提示）', async ({ page }) => {
    await login(page);
    await navigateToSkillManager(page);
    await selectSkill(page, SKILL_ID);
    await page.waitForTimeout(4000);

    const hasSvg = await page.locator('svg').count() > 0;
    const hasEmptyHint = await page.getByText('暂无流程图').isVisible().catch(() => false);
    expect(hasSvg || hasEmptyHint, '应有 SVG 渲染或空状态提示').toBe(true);
  });
});
