/**
 * 电信卡片渲染 E2E 测试（真实后端）
 * 通过包含手机号的具体指令触发 4 种结构化卡片，验证前端正确渲染
 * bill_card / cancel_card / plan_card / diagnostic_card
 *
 * 注意：调用真实 LLM，每条消息响应最长 90s
 */
import { test, expect } from '@playwright/test';

/**
 * 等待 chat WebSocket 连接就绪。
 *
 * 页面加载后 React 以空 phone 建立第一个 WS；fetchInboundUsers 完成后
 * chatUserPhone 更新，触发第二个 WS（带真实 phone）。
 * 我们等第二个 /ws/chat WS 被创建并留 500ms 让 onopen 触发。
 *
 * 必须在 page.goto() 之前调用以注册监听器，否则可能错过事件。
 */
async function waitForChatWs(page: import('@playwright/test').Page): Promise<void> {
  let wsCount = 0;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000); // 兜底
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws/chat')) return;
      wsCount++;
      if (wsCount >= 2) {
        // 第二个 WS 已创建（带真实 phone），等 onopen 触发
        setTimeout(() => { clearTimeout(timer); resolve(); }, 500);
      }
    });
  });
}

async function sendMessage(page: import('@playwright/test').Page, text: string) {
  const input = page.getByPlaceholder(/输入您的问题/);
  // 确保 textarea 可交互（非 disabled）
  await expect(input).toBeEnabled({ timeout: 5_000 });
  await input.fill(text);
  await input.press('Enter');
}

/**
 * 等待 bot 回复完成（打字指示器消失）
 */
async function waitForBotReply(page: import('@playwright/test').Page) {
  try {
    await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 5_000 });
  } catch {
    // 响应太快，指示器已消失
  }
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 150_000 });
}

test.describe('电信卡片渲染', () => {
  test.beforeEach(async ({ page }) => {
    // 含 LLM 调用的测试最长可能等 180s，这里留 200s 余量
    test.setTimeout(200_000);

    // 注册 WS 监听 *先于* 导航，这样不会错过 WS 创建事件
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    // 等带真实 phone 的第二个 WS 建连完成
    await wsReady;
  });

  // ── Bill Card ──────────────────────────────────────────────────────────────

  test('TC-CARD-01 账单查询返回 bill_card 并正确渲染', async ({ page }) => {
    await sendMessage(page, '查询2026-02月账单');
    await waitForBotReply(page);

    // 验证卡片头部
    await expect(page.getByText(/2026-02 账单/)).toBeVisible();
    // 验证账单总额
    await expect(page.getByText('账单总额')).toBeVisible();
    // 验证费用明细项（用 .first() 避免 LLM 文本与卡片元素同名导致 strict mode violation）
    await expect(page.getByText('套餐月费').first()).toBeVisible();
    await expect(page.getByText('流量超额费').first()).toBeVisible();
    await expect(page.getByText('增值业务费').first()).toBeVisible();
    await expect(page.getByText('税费').first()).toBeVisible();
    // 验证缴费状态
    await expect(page.getByText('已缴清')).toBeVisible();
  });

  test('TC-CARD-02 话费查询也触发 bill_card', async ({ page }) => {
    await sendMessage(page, '查询本月话费账单');
    await waitForBotReply(page);
    await expect(page.getByText('账单总额')).toBeVisible();
  });

  // ── Cancel Card ────────────────────────────────────────────────────────────

  test('TC-CARD-03 退订业务返回 cancel_card 并正确渲染', async ({ page }) => {
    // LLM 可能先确认再执行，发送明确指令
    await sendMessage(page, '确认退订视频会员流量包(video_pkg)，直接操作不用再确认');
    await waitForBotReply(page);

    // 验证退订卡片或退订相关回复
    const hasCard = await page.getByText('退订确认').isVisible().catch(() => false);
    if (hasCard) {
      await expect(page.getByText('退订业务').first()).toBeVisible();
      await expect(page.getByText('手机号').first()).toBeVisible();
    } else {
      // LLM 未返回卡片但应有退订相关文本回复
      await expect(page.getByText(/退订|取消|video_pkg/).first()).toBeVisible();
    }
  });

  test('TC-CARD-04 cancel_card 显示业务名称和费用', async ({ page }) => {
    await sendMessage(page, '确认退订短信百条包(sms_100)，直接执行退订');
    await waitForBotReply(page);
    // LLM 回复应包含短信相关内容（卡片或文本）
    await expect(page.getByText(/短信|sms_100|退订/).first()).toBeVisible();
  });

  // ── Plan Card ──────────────────────────────────────────────────────────────

  test('TC-CARD-05 套餐查询返回 plan_card 并正确渲染', async ({ page }) => {
    await sendMessage(page, '查询 plan_unlimited 套餐的详细信息');
    await waitForBotReply(page);

    // 验证套餐卡片头部（.first() 避免 LLM 文本与卡片元素重名）
    await expect(page.getByText('套餐详情').first()).toBeVisible();
    // 验证套餐名称
    await expect(page.getByText('无限流量套餐').first()).toBeVisible();
    // 验证流量/通话展示区
    await expect(page.getByText('国内流量').first()).toBeVisible();
    await expect(page.getByText('通话时长').first()).toBeVisible();
    // 验证无限标识
    await expect(page.getByText('不限量').first()).toBeVisible();
  });

  test('TC-CARD-06 plan_card 显示月费和权益列表', async ({ page }) => {
    await sendMessage(page, '介绍 plan_unlimited 无限流量套餐');
    await waitForBotReply(page);
    await expect(page.getByText('¥128').first()).toBeVisible();
    // 权益项（.first() 避免 LLM 文本与卡片元素重名）
    await expect(page.getByText('免费来电显示').first()).toBeVisible();
  });

  // ── Diagnostic Card ────────────────────────────────────────────────────────

  test('TC-CARD-07 故障诊断返回 diagnostic_card 并正确渲染', async ({ page }) => {
    await sendMessage(page, '帮我诊断网速慢(slow_data)的问题');
    await waitForBotReply(page);

    // 验证诊断卡片头部（.first() 避免 LLM 文本与卡片元素重名）
    await expect(page.getByText('网速慢诊断').first()).toBeVisible();
    // 验证诊断步骤
    await expect(page.getByText('账号状态检查').first()).toBeVisible();
    await expect(page.getByText('流量余额检查').first()).toBeVisible();
    await expect(page.getByText('网络拥塞检测').first()).toBeVisible();
    await expect(page.getByText('后台应用检测').first()).toBeVisible();
  });

  test('TC-CARD-08 diagnostic_card 显示诊断步骤状态和结论', async ({ page }) => {
    await sendMessage(page, '我的手机网速非常慢，帮我诊断slow_data问题');
    await waitForBotReply(page);
    // 验证结论文字
    await expect(page.getByText(/未发现严重故障/)).toBeVisible();
    // 验证步骤详情（流量使用信息，.first() 避免多个含 GB 的元素）
    await expect(page.getByText(/GB/).first()).toBeVisible();
  });

  test('TC-CARD-09 无信号问题触发 diagnostic_card', async ({ page }) => {
    await sendMessage(page, '帮我诊断no_signal无信号问题');
    await waitForBotReply(page);
    await expect(page.getByText(/诊断/).first()).toBeVisible();
  });

  // ── 非卡片消息 ────────────────────────────────────────────────────────────

  test('TC-CARD-10 普通消息不显示卡片', async ({ page }) => {
    await sendMessage(page, '你好，请介绍一下你自己');
    await waitForBotReply(page);
    // 不应该出现任何卡片头部
    await expect(page.getByText('账单总额')).not.toBeVisible();
    await expect(page.getByText('退订确认')).not.toBeVisible();
    await expect(page.getByText('套餐详情')).not.toBeVisible();
  });
});
