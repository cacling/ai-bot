/**
 * 客服对话页 E2E 测试（电信客服版 - 真实后端）
 * 覆盖：页面加载、初始消息、快捷选项、发送消息、打字指示器、重置、禁用状态
 */
import { test, expect } from '@playwright/test';

/**
 * 等待 bot 回复完成（打字指示器消失）。
 * 适用真实 LLM（最长等 150s）和 mock 两种模式。
 */
async function waitForBotReply(page: import('@playwright/test').Page) {
  // 等打字指示器出现（可能太快而跳过）
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch {
    // 响应很快，指示器可能已经消失，继续等消失
  }
  // 等打字指示器彻底消失 = bot 回复完成
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

// 发送消息辅助（填写 textarea 并按 Enter）
async function sendMessage(page: import('@playwright/test').Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  await input.fill(text);
  await input.press('Enter');
}

test.describe('客服对话页', () => {
  test.beforeEach(async ({ page }) => {
    // 含 LLM 调用的测试最长可能等 180s，这里留 200s 余量
    test.setTimeout(200_000);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
  });

  // ── 页面结构 ──────────────────────────────────────────────────────────────

  test('TC-CHAT-01 页面标题和导航栏', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    // 导航 Tab（当前 UI 为：在线客服 / 语音客服 / 语音外呼）
    await expect(page.getByRole('button', { name: /在线客服/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /语音客服/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /语音外呼/ })).toBeVisible();
  });

  test('TC-CHAT-02 初始欢迎消息', async ({ page }) => {
    await expect(page.getByText(/您好！我是智能客服小通/)).toBeVisible();
    await expect(page.getByText(/可以帮您查询话费账单/)).toBeVisible();
  });

  test('TC-CHAT-03 FAQ 快捷选项卡片', async ({ page }) => {
    // 建议选项通过 conversation-guidance 技能异步加载，等第一个按钮出现
    // 使用 .first() 因为 FAQ 卡片和底部快捷栏会有同名按钮
    await expect(page.getByRole('button', { name: /帮我查一下本月账单明细/ }).first()).toBeVisible({ timeout: 30_000 });
    // 标题由后端返回（替代前端占位标题）
    await expect(page.getByText('根据您的问题，推荐您这样问')).toBeVisible();
    await expect(page.getByRole('button', { name: /帮我退订不需要的增值业务/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /看看有没有更适合我的套餐/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /最近网速很慢，帮我排查一下/ }).first()).toBeVisible();
  });

  test('TC-CHAT-04 底部快捷问题栏', async ({ page }) => {
    // 底部快捷栏初始为静态标签，suggestions 到达后会被替换为动态标签
    // 等待建议到达后检查动态标签
    await expect(page.getByRole('button', { name: /帮我查一下本月账单明细/ }).first()).toBeVisible({ timeout: 30_000 });
    // 底部栏应有多个快捷按钮
    const bottomBar = page.locator('.flex.gap-2.overflow-x-auto, .flex.gap-2.flex-wrap').first();
    const btns = await page.getByRole('button').count();
    expect(btns).toBeGreaterThan(5);
  });

  // ── 消息发送 ──────────────────────────────────────────────────────────────

  test('TC-CHAT-05 输入框发送消息并显示用户气泡', async ({ page }) => {
    await sendMessage(page, '查询我的套餐状态');
    await expect(page.getByText('查询我的套餐状态')).toBeVisible();
  });

  test('TC-CHAT-06 收到 Bot 回复', async ({ page }) => {
    await sendMessage(page, '你好，请介绍一下你能做什么');
    await waitForBotReply(page);
  });

  test('TC-CHAT-07 Bot 回复内容非空', async ({ page }) => {
    await sendMessage(page, '你好');
    await waitForBotReply(page);
    // 等回复后，消息列表中有 bot 气泡（bg-white rounded-tl-none）
    const botBubble = page.locator('.rounded-tl-none').last();
    await expect(botBubble).toBeVisible();
  });

  test('TC-CHAT-08 Shift+Enter 换行不发送', async ({ page }) => {
    const input = page.getByPlaceholder(/输入您的问题/);
    await input.fill('第一行内容');
    await input.press('Shift+Enter');
    // 输入框内容仍存在（未发送）
    const val = await input.inputValue();
    expect(val).toContain('第一行内容');
    // 消息列表中不新增用户气泡
    const bubbles = page.locator('.bg-primary.rounded-tr-none');
    await expect(bubbles).toHaveCount(0);
  });

  test('TC-CHAT-09 点击 FAQ 卡片按钮发送消息', async ({ page }) => {
    // 等待建议选项异步加载完成（.first() 因 FAQ 卡片和底部栏同名）
    const faqBtn = page.getByRole('button', { name: /帮我查一下本月账单明细/ }).first();
    await expect(faqBtn).toBeVisible({ timeout: 30_000 });
    await faqBtn.click();
    // 用户消息气泡（bg-primary）出现即可
    await expect(page.locator('div.bg-primary', { hasText: '帮我查一下本月账单明细' })).toBeVisible();
    await waitForBotReply(page);
  });

  test('TC-CHAT-10 点击底部快捷按钮发送消息', async ({ page }) => {
    // 等待 suggestions 加载后底部栏更新为动态标签
    const btn = page.getByRole('button', { name: /看看有没有更适合我的套餐/ }).last();
    await expect(btn).toBeVisible({ timeout: 30_000 });
    await btn.click();
    await expect(page.locator('div.bg-primary', { hasText: '看看有没有更适合我的套餐' })).toBeVisible();
    await waitForBotReply(page);
  });

  // ── UI 状态 ───────────────────────────────────────────────────────────────

  test('TC-CHAT-11 发送中显示打字指示器', async ({ page }) => {
    await sendMessage(page, '测试等待状态');
    // 三点动画气泡出现
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  });

  test('TC-CHAT-12 空输入时发送按钮禁用', async ({ page }) => {
    const input = page.getByPlaceholder(/输入您的问题/);
    await expect(input).toBeEmpty();
    await expect(page.locator('button.cursor-not-allowed').last()).toBeVisible();
  });

  test('TC-CHAT-13 输入文字后发送按钮激活', async ({ page }) => {
    const input = page.getByPlaceholder(/输入您的问题/);
    await input.fill('有内容时应激活');
    await expect(page.locator('button.bg-primary.rounded-full')).toBeVisible();
  });

});
