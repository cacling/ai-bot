/**
 * 技能管理 — 测试面板多轮对话 E2E 测试
 *
 * 完整流程：登录 → 技能管理 → 选择 bill-inquiry → 测试 tab → 多轮对话 → 验证流程完成
 *
 * Seed 账号: demo / 123456 (全角色)
 * 依赖: 服务已启动 (./start.sh --reset)
 */
import { test, expect, type Page } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:18472';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loginAsDemo(page: Page) {
  await page.goto('/staff/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('账号').fill('demo');
  await page.getByLabel('密码').fill('123456');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

/** 发送一条测试消息并等待 Agent 回复 */
async function sendAndWaitReply(page: Page, message: string, turnNo: number) {
  const textarea = page.locator('textarea[placeholder*="输入测试消息"]');
  await textarea.fill(message);
  await textarea.press('Enter');
  console.log(`[Turn ${turnNo}] 发送: ${message}`);

  // 等待 loading 指示器出现再消失（Agent 正在处理）
  const loadingDots = page.locator('.animate-bounce').first();
  await expect(loadingDots).toBeVisible({ timeout: 5_000 }).catch(() => {
    // loading 可能很快消失，catch 掉
  });
  await expect(loadingDots).not.toBeVisible({ timeout: 90_000 });

  // 获取最新的 Agent 回复
  const botMessages = page.locator('div').filter({ has: page.locator('.lucide-bot') })
    .locator('~ div');
  const lastBotMsg = botMessages.last();
  const replyText = await lastBotMsg.textContent({ timeout: 5_000 }).catch(() => '');
  console.log(`[Turn ${turnNo}] 回复: ${replyText?.slice(0, 100)}...`);
  return replyText ?? '';
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('技能测试面板 — 多轮对话', () => {
  test.setTimeout(300_000); // 多轮对话，每轮 LLM 调用 ~10-30s

  test('SKILL-TEST-01: bill-inquiry 多轮对话 — 查账单→追问→结束', async ({ page }) => {
    // ── 1. 登录 ──
    await loginAsDemo(page);
    console.log('[SKILL-TEST-01] 登录成功');

    // ── 2. 进入技能管理 ──
    await page.goto('/staff/operations/knowledge/skills');
    await page.waitForLoadState('networkidle');

    // ── 3. 选择 bill-inquiry ──
    const skillItem = page.locator('.font-mono:text("bill-inquiry")').first();
    await expect(skillItem).toBeVisible({ timeout: 15_000 });
    await skillItem.click();
    await page.waitForTimeout(1000);
    console.log('[SKILL-TEST-01] 进入 bill-inquiry');

    // ── 4. 点击"测试 v1" tab ──
    const testTab = page.locator('button').filter({ hasText: /测试/ }).first();
    await expect(testTab).toBeVisible({ timeout: 10_000 });
    await testTab.click();
    await page.waitForTimeout(500);

    // 确认测试输入框可见
    const textarea = page.locator('textarea[placeholder*="输入测试消息"]');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    console.log('[SKILL-TEST-01] 测试面板就绪');

    // ── 5. 多轮对话 ──

    // Turn 1: 查询本月账单
    const reply1 = await sendAndWaitReply(page, '我想查一下这个月的话费', 1);
    expect(reply1.length).toBeGreaterThan(10);
    // 应该包含账单相关信息
    const hasBillInfo = reply1.includes('账单') || reply1.includes('费') || reply1.includes('元')
      || reply1.includes('套餐') || reply1.includes('月');
    expect(hasBillInfo, `Turn 1 回复应包含账单信息，实际: ${reply1.slice(0, 80)}`).toBe(true);

    await page.screenshot({ path: 'test-results/skill-test-turn1.png', fullPage: true });

    // Turn 2: 追问费用明细
    const reply2 = await sendAndWaitReply(page, '为什么这个月比上个月贵了', 2);
    expect(reply2.length).toBeGreaterThan(10);

    await page.screenshot({ path: 'test-results/skill-test-turn2.png', fullPage: true });

    // Turn 3: 结束对话
    const reply3 = await sendAndWaitReply(page, '好的我知道了，没有其他问题了', 3);
    expect(reply3.length).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/skill-test-turn3.png', fullPage: true });

    // ── 6. 验证多轮对话完整性 ──
    const bodyText = await page.textContent('body') ?? '';

    // 不应该有连接错误
    expect(bodyText).not.toContain('Unable to connect');
    expect(bodyText).not.toContain('proxy failed');
    expect(bodyText).not.toContain('404 Not Found');
    expect(bodyText).not.toContain('Backend error');

    // 所有三条用户消息和三条 Agent 回复都应该在页面上
    expect(bodyText).toContain('这个月的话费');
    expect(bodyText).toContain('比上个月贵');
    expect(bodyText).toContain('没有其他问题');

    console.log('[SKILL-TEST-01] 3 轮对话全部完成');
  });

  test('SKILL-TEST-02: /api/test/run-agent 多轮对话 API 验证', async ({ request }) => {
    const history: Array<{ role: string; content: string }> = [];

    // Turn 1: 查账单
    const res1 = await request.post(`${BACKEND}/api/test/run-agent`, {
      data: { message: '我要查这个月的账单', phone: '13800000001', lang: 'zh', useMock: true, skillName: 'bill-inquiry', history },
      timeout: 60_000,
    });
    expect(res1.ok()).toBeTruthy();
    const body1 = await res1.json();
    expect(body1.text.length).toBeGreaterThan(10);
    expect(body1.toolRecords?.length).toBeGreaterThan(0);
    console.log('[Turn 1]', { text_len: body1.text.length, tools: body1.toolRecords?.map((t: { tool: string }) => t.tool) });

    // 更新 history
    history.push({ role: 'user', content: '我要查这个月的账单' });
    history.push({ role: 'assistant', content: body1.text });

    // Turn 2: 追问
    const res2 = await request.post(`${BACKEND}/api/test/run-agent`, {
      data: { message: '能不能帮我对比上个月的', phone: '13800000001', lang: 'zh', useMock: true, skillName: 'bill-inquiry', history },
      timeout: 60_000,
    });
    expect(res2.ok()).toBeTruthy();
    const body2 = await res2.json();
    expect(body2.text.length).toBeGreaterThan(10);
    console.log('[Turn 2]', { text_len: body2.text.length, tools: body2.toolRecords?.map((t: { tool: string }) => t.tool) });

    history.push({ role: 'user', content: '能不能帮我对比上个月的' });
    history.push({ role: 'assistant', content: body2.text });

    // Turn 3: 结束
    const res3 = await request.post(`${BACKEND}/api/test/run-agent`, {
      data: { message: '好的谢谢，没别的事了', phone: '13800000001', lang: 'zh', useMock: true, skillName: 'bill-inquiry', history },
      timeout: 60_000,
    });
    expect(res3.ok()).toBeTruthy();
    const body3 = await res3.json();
    expect(body3.text.length).toBeGreaterThan(0);
    console.log('[Turn 3]', { text_len: body3.text.length, tools: body3.toolRecords?.map((t: { tool: string }) => t.tool) });

    console.log('[SKILL-TEST-02] 3 轮 API 对话完成');
  });
});
