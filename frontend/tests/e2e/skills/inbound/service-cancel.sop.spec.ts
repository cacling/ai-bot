/**
 * service-cancel SOP E2E 测试
 *
 * 增值业务退订技能的多轮对话流程验证。
 * 合并来源：12-sop-ui-verification（场景一、三、六）+ 13-workflow-engine（全部）
 *
 * 依赖：
 *   - 服务已启动（./start.sh 或 ./start.sh --reset）
 *   - 测试用户 13800000001（张三）有 video_pkg 和 sms_100 两个增值业务
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply, PREMATURE_CANCEL_SIGNALS } from '../../fixtures/chat-helpers';

// ── SOP 流程验证 ─────────────────────────────────────────────────────────────

test.describe.serial('service-cancel SOP: 标准退订完整流程', () => {
  test.setTimeout(300_000);

  test('SOP-SC-01: 查询→选择→确认→退订→结束', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户说退订 → bot 应该先查询，展示已订业务列表
    await sendMessage(page, '帮我看看我订了哪些增值业务，有不需要的想退掉');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    const hasServiceInfo = /视频|短信|流量包|增值业务|sms|video/.test(reply1);
    expect(hasServiceInfo, '第 1 步应展示已订业务信息').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply1, `第 1 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // Step 2: 用户选择要退订的业务 → bot 应说明退订影响并请求确认
    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasImpactOrConfirm = /影响|生效|确认|是否|次月|本月/.test(reply2);
    expect(hasImpactOrConfirm, '第 2 步应说明影响或请求确认').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `第 2 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // Step 3: 用户确认退订 → bot 应执行 cancel_service 并反馈结果
    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    const hasResult = /退订|取消|生效|成功|失败|处理/.test(reply3);
    expect(hasResult, '第 3 步应有退订执行结果').toBe(true);

    // Step 4: bot 问是否还有其他要退订 → 用户说没有了 → 结束
    await sendMessage(page, '没有了，谢谢');
    await waitForBotReply(page);
    const reply4 = await getLastBotReply(page);
    expect(reply4.length, '第 4 步回复不应为空').toBeGreaterThan(5);
  });
});

test.describe.serial('service-cancel SOP: 查询后用户放弃退订', () => {
  test.setTimeout(300_000);

  test('SOP-SC-02: 查询→说明影响→用户取消→不执行', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '帮我查一下短信百条包的退订影响');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length).toBeGreaterThan(10);

    await sendMessage(page, '算了，影响太大，我先不退了');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `取消后不应出现 "${signal}"`).not.toContain(signal);
    }
    const hasClosing = /好的|了解|如有|需要|随时|帮助|其他/.test(reply2);
    expect(hasClosing, '取消后应有礼貌回应').toBe(true);
  });
});

test.describe.serial('service-cancel SOP: 全局转人工不受 SOP 阻断', () => {
  test.setTimeout(200_000);

  test('SOP-SC-03: 流程中途转人工不受 SOP 阻断', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '帮我查一下话费账单');
    await waitForBotReply(page);

    await sendMessage(page, '我要转人工');
    await waitForBotReply(page);
    const reply = await getLastBotReply(page);

    const hasTransfer = /转接|人工客服|稍候|稍等|转人工|正在/.test(reply);
    expect(hasTransfer, '转人工请求必须被响应').toBe(true);
  });
});

// ── Workflow Engine 验证（runtime 驱动）──────────────────────────────────────
// 需要 RUNTIME_ORCHESTRATED_SKILLS=service-cancel 启动

test.describe.serial('Workflow Engine: 标准退订流程', () => {
  test.setTimeout(300_000);

  test('WF-SC-01: 查询→展示→确认→执行', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '帮我看看我有哪些增值业务，想退掉一个');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    const hasServiceInfo = /视频|短信|流量|增值|业务|video|sms/i.test(reply1);
    expect(hasServiceInfo, '第 1 步应展示业务信息（runtime 调了 query_subscriber）').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply1, `第 1 步不应出现 "${signal}"（还没确认）`).not.toContain(signal);
    }

    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasConfirm = /影响|确认|是否|生效|次月|退订|取消/.test(reply2);
    expect(hasConfirm, '第 2 步应要求确认（runtime 在 confirm 节点暂停）').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `第 2 步不应出现 "${signal}"（用户还没确认）`).not.toContain(signal);
    }

    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    const hasResult = /退订|取消|生效|成功|失败|处理|办理/.test(reply3);
    expect(hasResult, '第 3 步应有退订结果（runtime 推进到 tool 执行）').toBe(true);

    await sendMessage(page, '没有了，谢谢');
    await waitForBotReply(page);
    const reply4 = await getLastBotReply(page);
    expect(reply4.length).toBeGreaterThan(5);
  });
});

test.describe.serial('Workflow Engine: 用户取消退订', () => {
  test.setTimeout(300_000);

  test('WF-SC-02: 查询→展示→取消→不执行', async ({ page }) => {
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

    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `取消后不应出现 "${signal}"`).not.toContain(signal);
    }
    const hasClosing = /好的|了解|需要|随时|帮助|其他|如有/.test(reply2);
    expect(hasClosing, '取消后应有礼貌回应').toBe(true);
  });
});

test.describe.serial('Workflow Engine: 全局转人工', () => {
  test.setTimeout(200_000);

  test('WF-SC-03: 流程中途转人工', async ({ page }) => {
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
