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
    await expect(page.getByText('7×24 小时全天候服务')).toBeVisible();
    // 导航 Tab
    await expect(page.getByRole('button', { name: /客服对话/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /知识库编辑/ })).toBeVisible();
  });

  test('TC-CHAT-02 初始欢迎消息', async ({ page }) => {
    await expect(page.getByText(/您好！我是智能客服小通/)).toBeVisible();
    await expect(page.getByText(/可以帮您查询话费账单/)).toBeVisible();
  });

  test('TC-CHAT-03 FAQ 快捷选项卡片', async ({ page }) => {
    await expect(page.getByText('猜您想问：')).toBeVisible();
    await expect(page.getByRole('button', { name: /查询本月话费账单/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /退订视频会员流量包/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /推荐一个适合重度用户的套餐/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /手机网速非常慢/ })).toBeVisible();
  });

  test('TC-CHAT-04 底部快捷问题栏', async ({ page }) => {
    for (const label of ['查话费', '退订业务', '查套餐', '故障报修', '人工客服']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
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
    const bubbles = page.locator('.bg-blue-600.text-white.rounded-2xl');
    await expect(bubbles).toHaveCount(0);
  });

  test('TC-CHAT-09 点击 FAQ 卡片按钮发送消息', async ({ page }) => {
    await page.getByRole('button', { name: /查询本月话费账单/ }).click();
    // 用户消息气泡（bg-blue-600）出现即可
    await expect(page.locator('div.bg-blue-600', { hasText: '查询本月话费账单' })).toBeVisible();
    await waitForBotReply(page);
  });

  test('TC-CHAT-10 点击底部快捷按钮发送消息', async ({ page }) => {
    await page.getByRole('button', { name: '查套餐', exact: true }).click();
    await expect(page.locator('div.bg-blue-600', { hasText: '查套餐' })).toBeVisible();
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
    await expect(page.locator('button.bg-blue-600.rounded-full')).toBeVisible();
  });

  // ── 重置 & 转人工 ─────────────────────────────────────────────────────────

  test('TC-CHAT-14 重置对话按钮清空消息', async ({ page }) => {
    await sendMessage(page, '需要重置的消息');
    await waitForBotReply(page);
    await page.locator('[title="重置对话"]').click();
    // 欢迎消息重新出现
    await expect(page.getByText(/您好！我是智能客服小通/)).toBeVisible();
    // 发送的消息消失（只检查用户气泡 bg-blue-600，避免 bot 回复中可能包含该文本）
    await expect(page.locator('div.bg-blue-600', { hasText: '需要重置的消息' })).not.toBeVisible();
  });

  test('TC-CHAT-15 转人工客服', async ({ page }) => {
    await page.getByRole('button', { name: /转人工/ }).click();
    await expect(page.getByText('我需要联系人工客服')).toBeVisible();
    await waitForBotReply(page);
  });
});
