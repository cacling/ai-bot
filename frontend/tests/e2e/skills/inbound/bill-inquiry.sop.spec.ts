/**
 * bill-inquiry SOP E2E 测试
 *
 * 账单查询技能的多轮对话流程验证。
 * 合并来源：12-sop-ui-verification（场景二、四）
 *
 * 依赖：
 *   - 服务已启动（./start.sh 或 ./start.sh --reset）
 *   - 测试用户 13800000001（张三）有 video_pkg 和 sms_100 两个增值业务
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply, PREMATURE_CANCEL_SIGNALS } from '../../fixtures/chat-helpers';

// ── 场景：未知扣费查询→解释→退订 ──────────────────────────────────────────

test.describe.serial('bill-inquiry SOP: 未知扣费查询→解释→退订', () => {
  test.setTimeout(300_000);

  test('SOP-BI-01: 查账单→解释费用→确认退订→结果', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户说有不明扣费 → bot 应先查账单明细
    await sendMessage(page, '我这个月话费单里有一笔不认识的费用，帮我查查是什么');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    const hasFeeInfo = /费用|账单|扣费|月费|元|¥|\d+/.test(reply1);
    expect(hasFeeInfo, '第 1 步应展示费用信息').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply1, `第 1 步不应出现 "${signal}"`).not.toContain(signal);
    }

    // Step 2: bot 解释了费用来源 → 用户要求退订 → bot 应确认
    await sendMessage(page, '这个视频会员流量包我不需要，帮我退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasConfirmRequest = /确认|影响|生效|是否|退订|取消|费用|月费|退|不再/.test(reply2);
    expect(hasConfirmRequest, '第 2 步应请求确认或说明影响').toBe(true);

    // Step 3: 用户确认 → bot 执行退订 → 反馈结果
    await sendMessage(page, '确认，帮我退了');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
    const hasResult = /退订|取消|生效|成功|处理|次月/.test(reply3);
    expect(hasResult, '第 3 步应有退订结果').toBe(true);
  });
});

// ── 场景：账单查询多步流程 ──────────────────────────────────────────────────

test.describe.serial('bill-inquiry SOP: 账单查询多步流程', () => {
  test.setTimeout(300_000);

  test('SOP-BI-02: 查身份→查账单→解读费用', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 查账单 → bot 应调工具查询并展示结果
    await sendMessage(page, '帮我查一下本月的话费账单明细');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1).toMatch(/\d+/);
    const hasBillInfo = /账单|费用|月费|套餐|元|¥/.test(reply1);
    expect(hasBillInfo, '第 1 步应展示账单信息').toBe(true);

    // Step 2: 用户追问某项费用 → bot 应解读
    await sendMessage(page, '增值业务费是什么？为什么扣了这么多');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length).toBeGreaterThan(20);
    const hasExplanation = /增值|业务|视频|短信|流量|订购|月费|费用/.test(reply2);
    expect(hasExplanation, '第 2 步应解释费用明细').toBe(true);
    for (const signal of PREMATURE_CANCEL_SIGNALS) {
      expect(reply2, `账单查询步骤不应出现 "${signal}"`).not.toContain(signal);
    }

    // Step 3: 用户问话费异常 → bot 应分析
    await sendMessage(page, '和上个月比是不是多了？');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length).toBeGreaterThan(10);
  });
});
