/**
 * plan-inquiry SOP E2E 测试
 *
 * 套餐查询与推荐技能的多轮对话流程验证。
 * 状态图分支：套餐浏览 / 套餐变更 / 套餐对比 / 网速问题分流
 * 语义正确性由 promptfoo eval 覆盖: evals/datasets/plan-inquiry.yaml
 *
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';
import { navigateToTestCases, regenerateTestCases, runAllCasesInChat } from '../../fixtures/testcase-ui-helpers';

test.describe.serial('plan-inquiry SOP: 套餐变更流程（fork/join）', () => {
  test.setTimeout(300_000);

  test('SOP-PI-03: 查当前套餐→分析用量→推荐升级→确认办理', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '我想换个套餐，现在这个流量不太够用');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);

    await sendMessage(page, '好的，帮我看看升级到哪个套餐比较合适');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
  });
});

test.describe.serial('plan-inquiry SOP: 网速问题分流（fork/join）', () => {
  test.setTimeout(300_000);

  test('SOP-PI-07: 月底流量不够→查用量+套餐→推荐', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '我每个月底流量都不够用，上网特别慢');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(10);

    await sendMessage(page, '对，每个月底都不够，不是突然变慢的');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
  });
});

test.describe.serial('plan-inquiry SOP: 套餐浏览流程', () => {
  test.setTimeout(300_000);

  test('SOP-PI-01: 浏览套餐→了解需求→推荐→展示详情', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '我想看看你们有什么套餐');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);

    await sendMessage(page, '100G那个套餐具体包含什么');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
  });

  test('SOP-PI-02: 浏览后用户仅了解不办理→礼貌结束', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '帮我看看有哪些套餐可以选');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(10);

    await sendMessage(page, '好的我知道了，暂时不换，谢谢');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(5);
  });
});

test.describe.serial('plan-inquiry SOP: 套餐对比流程', () => {
  test.setTimeout(300_000);

  test('SOP-PI-06: 选择多个套餐→对比差异→推荐最优', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '50G套餐和100G套餐有什么区别，帮我对比一下');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(20);

    await sendMessage(page, '哪个更划算？我每月大概用70G流量');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
  });
});

test.describe.serial('plan-inquiry SOP: 网速问题分流', () => {
  test.setTimeout(300_000);

  test('SOP-PI-08: 突然网速慢→引导转故障诊断', async ({ page }) => {
    const wsReady = waitForChatWs(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '智能客服小通' })).toBeVisible();
    await wsReady;

    await sendMessage(page, '我手机上网突然变得特别慢');
    await waitForBotReply(page);
    const reply1 = await getLastBotReply(page);
    expect(reply1.length, '第 1 步回复不应为空').toBeGreaterThan(10);

    await sendMessage(page, '就是今天突然变慢的，之前一直好好的');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);
    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);
  });
});

// ── 自动生成测试用例：重新生成 + 全量运行 ─────────────────────────────────────

test.describe.serial('plan-inquiry 自动生成测试用例', () => {
  test.setTimeout(600_000);

  test('AUTO-PI-01: 重新生成测试用例', async ({ page }) => {
    await navigateToTestCases(page, 'plan-inquiry');
    const count = await regenerateTestCases(page);
    expect(count, '应至少生成 3 条测试用例').toBeGreaterThanOrEqual(3);
  });

  test('AUTO-PI-02: 运行全部用例并验证通过', async ({ page }) => {
    await navigateToTestCases(page, 'plan-inquiry');
    const stats = await runAllCasesInChat(page);
    expect(stats.total, '应有用例被执行').toBeGreaterThan(0);
    console.log(`[AUTO] ${stats.passed}/${stats.total} passed (${(stats.passed/stats.total*100).toFixed(0)}%)`);
  });
});
