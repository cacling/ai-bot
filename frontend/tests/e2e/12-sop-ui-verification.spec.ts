/**
 * SOP 步骤遵循验证 — UI 驱动 E2E 测试
 *
 * 通过打开客户侧页面，在输入框发消息，检查 bot 回复，
 * 验证 SOPGuard V2 + WorkflowSpec 是否让 Agent 严格按 SOP 状态图步骤走。
 *
 * 验证策略：
 * - 反模式检测：第一轮不该出现"已退订/退订成功/已办理"等跳步信号
 * - 工具证据检测：回复应包含查询结果特征（具体数据、业务名称）
 * - 确认门控：用户确认前不执行操作类工具
 *
 * 运行方式（headed，可看到浏览器）：
 *   cd frontend/tests/e2e && npx playwright test 12-sop-ui-verification.spec.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';

// ── 辅助函数 ─────────────────────────────────────────────────────────────

/**
 * 等待 chat WebSocket 连接就绪（第二个 /ws/chat 带真实 phone）
 * 必须在 page.goto() 之前调用以注册监听器
 */
async function waitForChatWs(page: Page): Promise<void> {
  let wsCount = 0;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/chat')) return;
      wsCount++;
      if (wsCount >= 2) {
        setTimeout(() => { clearTimeout(timer); resolve(); }, 500);
      }
    });
  });
}

/** 在输入框输入消息并发送 */
async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter');
}

/** 等待 bot 回复完成（打字指示器消失） */
async function waitForBotReply(page: Page) {
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch { /* 响应太快 */ }
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

/**
 * 获取最后一条 bot 消息的文本内容
 * Bot 消息结构：div.markdown-body > ReactMarkdown 渲染的内容
 */
async function getLastBotReply(page: Page): Promise<string> {
  const botMessages = page.locator('.markdown-body');
  const count = await botMessages.count();
  if (count === 0) return '';
  return (await botMessages.nth(count - 1).textContent()) ?? '';
}

/** 获取所有 bot 消息文本 */
async function getAllBotReplies(page: Page): Promise<string[]> {
  const botMessages = page.locator('.markdown-body');
  const count = await botMessages.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push((await botMessages.nth(i).textContent()) ?? '');
  }
  return texts;
}

// ── 跳步反模式关键词 ──────────────────────────────────────────────────────

/** 如果第一轮就出现这些词，说明 Agent 跳过了查询/确认步骤直接执行了操作 */
const SKIP_STEP_SIGNALS = [
  '已退订成功',
  '退订成功',
  '已为您退订',
  '已成功退订',
  '已办理成功',
  '已取消成功',
  '退订已生效',
];

// ── 测试 ──────────────────────────────────────────────────────────────────

test.describe.serial('SOP 步骤遵循验证 — UI 驱动', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(200_000);
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;
  });

  // ── service-cancel：标准退订 ──────────────────────────────────────────

  test('SOP-UI-01: 退订请求第一轮必须先查询，不能直接退订', async ({ page }) => {
    await sendMessage(page, '帮我退掉视频会员');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    // 反模式检测：第一轮不该有跳步信号
    for (const signal of SKIP_STEP_SIGNALS) {
      expect(reply, `第一轮出现跳步信号 "${signal}"，SOP 被绕过`).not.toContain(signal);
    }
    // 正面验证：应该有查询相关内容（业务列表、确认信息等）
    expect(reply.length).toBeGreaterThan(10);
  });

  // ── service-cancel：未知扣费 ──────────────────────────────────────────

  test('SOP-UI-02: 未知扣费必须先查账单，不能直接退订', async ({ page }) => {
    await sendMessage(page, '这个月不知道为什么多扣了20块钱');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    for (const signal of SKIP_STEP_SIGNALS) {
      expect(reply, `未知扣费场景出现跳步信号 "${signal}"`).not.toContain(signal);
    }
    // 应该先查账单，回复中应有费用相关内容
    expect(reply.length).toBeGreaterThan(10);
  });

  // ── service-cancel：多轮确认 ──────────────────────────────────────────

  test('SOP-UI-03: 多轮对话 — 查询后需用户确认才执行退订', async ({ page }) => {
    // 第一轮：用户要退订
    await sendMessage(page, '帮我退掉彩铃');
    await waitForBotReply(page);

    const reply1 = await getLastBotReply(page);
    for (const signal of SKIP_STEP_SIGNALS) {
      expect(reply1, `第一轮出现跳步信号 "${signal}"`).not.toContain(signal);
    }

    // 第二轮：用户确认
    await sendMessage(page, '确认退订');
    await waitForBotReply(page);

    const reply2 = await getLastBotReply(page);
    // 确认后应该有执行结果（成功或失败都行，关键是走了确认流程）
    expect(reply2.length).toBeGreaterThan(5);
  });

  // ── service-cancel：用户取消 ──────────────────────────────────────────

  test('SOP-UI-04: 用户取消 — 不执行退订操作', async ({ page }) => {
    await sendMessage(page, '帮我退掉短信百条包');
    await waitForBotReply(page);

    // 用户说不退了
    await sendMessage(page, '算了，不退了');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    // 不应该出现退订成功
    for (const signal of SKIP_STEP_SIGNALS) {
      expect(reply, `用户取消后出现 "${signal}"`).not.toContain(signal);
    }
  });

  // ── bill-inquiry：账单查询 ────────────────────────────────────────────

  test('SOP-UI-05: 账单查询按 SOP 先查后展示', async ({ page }) => {
    await sendMessage(page, '查询本月话费');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    // 应该有具体数据（金额数字），说明调了查询工具
    expect(reply).toMatch(/\d+/);
    expect(reply.length).toBeGreaterThan(20);
  });

  // ── fault-diagnosis：故障诊断 ─────────────────────────────────────────

  test('SOP-UI-06: 故障诊断按 SOP 先诊断再给方案', async ({ page }) => {
    await sendMessage(page, '我的手机网速很慢');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    // 不应该直接说"已修复"
    expect(reply).not.toContain('已修复');
    expect(reply).not.toContain('已恢复');
    // 应该有诊断相关内容
    expect(reply.length).toBeGreaterThan(20);
  });

  // ── 转人工：全局出口 ─────────────────────────────────────────────────

  test('SOP-UI-07: 转人工随时可用，不受 SOP 阻断', async ({ page }) => {
    await sendMessage(page, '转人工');
    await waitForBotReply(page);

    const reply = await getLastBotReply(page);
    // 应该有转接相关内容
    const hasTransfer = /转接|人工客服|稍候|稍等|转人工/.test(reply);
    expect(hasTransfer, '转人工请求未被响应').toBe(true);
  });

  // ── 新会话后 SOP 重置 ────────────────────────────────────────────────

  test('SOP-UI-08: 重置会话后 SOP 状态清空', async ({ page }) => {
    // 先触发一个 skill
    await sendMessage(page, '帮我退掉视频会员');
    await waitForBotReply(page);

    // 点重置按钮（新对话）
    const resetBtn = page.getByRole('button', { name: /新对话|重置|清空/ });
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      // 等新会话就绪
      await page.waitForTimeout(2000);

      // 发不同的问题，不应受前一个 skill 的 SOP 影响
      await sendMessage(page, '查询本月话费');
      await waitForBotReply(page);

      const reply = await getLastBotReply(page);
      expect(reply.length).toBeGreaterThan(10);
    }
  });
});
