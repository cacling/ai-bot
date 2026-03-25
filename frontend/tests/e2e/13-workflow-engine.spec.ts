/**
 * Complete Workflow Engine E2E 验证
 *
 * 验证 runtime-driven workflow engine 通过 UI 交互的正确性。
 * 流程控制权在 runtime 而非 LLM：runtime 决定当前步骤，LLM 只生成话术。
 *
 * 运行方式：
 *   RUNTIME_ORCHESTRATED_SKILLS=service-cancel ./start.sh --reset
 *   cd frontend/tests/e2e && npx playwright test 13-workflow-engine.spec.ts --headed
 */
import { test, expect, type Page } from '@playwright/test';

// ── 辅助函数 ─────────────────────────────────────────────────────────────

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

async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  await expect(input).toBeEnabled({ timeout: 10_000 });
  await input.fill(text);
  await input.press('Enter');
}

async function waitForBotReply(page: Page) {
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch { /* 响应太快 */ }
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

async function getLastBotReply(page: Page): Promise<string> {
  const botMessages = page.locator('.markdown-body');
  const count = await botMessages.count();
  if (count === 0) return '';
  return (await botMessages.nth(count - 1).textContent()) ?? '';
}

const PREMATURE_CANCEL = ['已退订成功', '退订成功', '已为您退订', '已成功退订', '退订已生效'];

// ── 场景一：标准退订 (runtime 驱动 4 步) ──────────────────────────────────

test.describe.serial('Workflow Engine: 标准退订流程', () => {
  test.setTimeout(300_000);

  test('WF-01: 查询→展示→确认→执行', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户要退订 → bot 应先查询用户信息
    await sendMessage(page, '帮我看看我有哪些增值业务，想退掉一个');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    // 应有业务信息（查询结果）
    const hasServiceInfo = /视频|短信|流量|增值|业务|video|sms/i.test(reply1);
    expect(hasServiceInfo, '第 1 步应展示业务信息（runtime 调了 query_subscriber）').toBe(true);
    for (const signal of PREMATURE_CANCEL) {
      expect(reply1, `第 1 步不应出现 "${signal}"（还没确认）`).not.toContain(signal);
    }

    // Step 2: 用户选择退订 → bot 应说明影响并确认
    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasConfirm = /影响|确认|是否|生效|次月|退订|取消/.test(reply2);
    expect(hasConfirm, '第 2 步应要求确认（runtime 在 confirm 节点暂停）').toBe(true);
    for (const signal of PREMATURE_CANCEL) {
      expect(reply2, `第 2 步不应出现 "${signal}"（用户还没确认）`).not.toContain(signal);
    }

    // Step 3: 用户确认 → bot 执行退订
    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    const hasResult = /退订|取消|生效|成功|失败|处理|办理/.test(reply3);
    expect(hasResult, '第 3 步应有退订结果（runtime 推进到 tool 执行）').toBe(true);

    // Step 4: 后续问题 → 新的会话
    await sendMessage(page, '没有了，谢谢');
    await waitForBotReply(page);
    const reply4 = await getLastBotReply(page);
    expect(reply4.length).toBeGreaterThan(5);
  });
});

// ── 场景二：用户取消分支 ──────────────────────────────────────────────────

test.describe.serial('Workflow Engine: 用户取消退订', () => {
  test.setTimeout(300_000);

  test('WF-02: 查询→展示→取消→不执行', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '帮我退掉短信百条包');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length).toBeGreaterThan(10);

    await sendMessage(page, '算了，不退了，影响太大');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    for (const signal of PREMATURE_CANCEL) {
      expect(reply2, `取消后不应出现 "${signal}"`).not.toContain(signal);
    }
    const hasClosing = /好的|了解|需要|随时|帮助|其他|如有/.test(reply2);
    expect(hasClosing, '取消后应有礼貌回应').toBe(true);
  });
});

// ── 场景三：转人工不受阻断 ────────────────────────────────────────────────

test.describe.serial('Workflow Engine: 全局转人工', () => {
  test.setTimeout(200_000);

  test('WF-03: 流程中途转人工', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '查一下我的话费');
    await waitForBotReply(page);

    await sendMessage(page, '转人工');
    await waitForBotReply(page);
    const reply = await getLastBotReply(page);
    const hasTransfer = /转接|人工|稍候|稍等|正在|客服|转|为您|处理|服务/.test(reply);
    expect(hasTransfer, `转人工应被响应，实际回复: ${reply.slice(0, 80)}`).toBe(true);
  });
});
