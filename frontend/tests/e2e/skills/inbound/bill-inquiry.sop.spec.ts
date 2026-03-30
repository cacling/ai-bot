/**
 * bill-inquiry SOP E2E 测试
 *
 * 账单查询技能的多轮对话流程验证。
 * 合并来源：12-sop-ui-verification（场景二、四）
 *
 * 语义正确性由 promptfoo eval 覆盖: evals/datasets/bill-inquiry.yaml
 *
 * 依赖：
 *   - 服务已启动（./start.sh 或 ./start.sh --reset）
 *   - 测试用户 13800000001（张三）有 video_pkg 和 sms_100 两个增值业务
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';

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

    // Step 2: bot 解释了费用来源 → 用户要求退订 → bot 应确认
    await sendMessage(page, '这个视频会员流量包我不需要，帮我退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);

    // Step 3: 用户确认 → bot 执行退订 → 反馈结果
    await sendMessage(page, '确认，帮我退了');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
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
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(10);

    // Step 2: 用户追问某项费用 → bot 应解读
    await sendMessage(page, '增值业务费是什么？为什么扣了这么多');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(20);

    // Step 3: 用户问话费异常 → bot 应分析
    await sendMessage(page, '和上个月比是不是多了？');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);
    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);
  });
});
