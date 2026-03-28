/**
 * plan-inquiry SOP E2E 测试
 *
 * 套餐查询与推荐技能的多轮对话流程验证。
 * 状态图分支：套餐浏览 / 套餐变更 / 套餐对比 / 网速问题分流
 *
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';

test.describe.serial('plan-inquiry SOP: 套餐变更流程（fork/join）', () => {
  test.setTimeout(300_000);

  test('SOP-PI-03: 查当前套餐→分析用量→推荐升级→确认办理', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户想换套餐 → bot 应并行调用 query_subscriber + query_plans，返回用量分析和推荐
    await sendMessage(page, '我想换个套餐，现在这个流量不太够用');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);
    // 应包含用户当前套餐信息或套餐推荐
    const hasInfo = /套餐|流量|用量|GB|月费|元|升级|推荐/.test(reply1);
    expect(hasInfo, '第 1 步应展示套餐或用量信息').toBe(true);

    // Step 2: 用户确认想升级 → bot 应展示对比并引导办理
    await sendMessage(page, '好的，帮我看看升级到哪个套餐比较合适');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasRecommend = /推荐|建议|升级|对比|套餐|月费|流量/.test(reply2);
    expect(hasRecommend, '第 2 步应有套餐推荐或对比').toBe(true);
  });
});

test.describe.serial('plan-inquiry SOP: 网速问题分流（fork/join）', () => {
  test.setTimeout(300_000);

  test('SOP-PI-07: 月底流量不够→查用量+套餐→推荐', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    // Step 1: 用户反映流量不够 → bot 应先区分故障vs流量不足
    await sendMessage(page, '我每个月底流量都不够用，上网特别慢');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);

    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(10);
    // bot 可能直接进入流量不够用流程，或先澄清
    const hasResponse = /流量|用量|套餐|不够|升级|加油包|月底|GB|慢/.test(reply1);
    expect(hasResponse, '第 1 步应有流量相关回复').toBe(true);

    // Step 2: 确认是长期流量不足 → bot 应并行查询用量和套餐列表，给出推荐
    await sendMessage(page, '对，每个月底都不够，不是突然变慢的');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
    const hasPlanInfo = /流量|套餐|用量|GB|升级|加油包|推荐|月费/.test(reply2);
    expect(hasPlanInfo, '第 2 步应展示用量或套餐推荐').toBe(true);
  });
});

test.describe.serial('plan-inquiry SOP: 套餐浏览流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-01: 浏览套餐→了解需求→推荐→展示详情', async ({ page }) => {});
  test.skip('SOP-PI-02: 浏览后用户仅了解不办理→礼貌结束', async ({ page }) => {});
});

test.describe.serial('plan-inquiry SOP: 套餐对比流程', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-06: 选择多个套餐→对比差异→推荐最优', async ({ page }) => {});
});

test.describe.serial('plan-inquiry SOP: 网速问题分流', () => {
  test.setTimeout(300_000);
  test.skip('SOP-PI-08: 突然网速慢→引导转故障诊断', async ({ page }) => {});
});
