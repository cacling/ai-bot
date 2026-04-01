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
import { waitForChatWs, sendMessage, waitForBotReply, getLastBotReply } from '../../fixtures/chat-helpers';
import { navigateToTestCases, regenerateTestCases, runAllCasesInChat } from '../../fixtures/testcase-ui-helpers';

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
    // 语义正确性由 promptfoo eval 覆盖: datasets/service-cancel.yaml SC-01

    // Step 2: 用户选择要退订的业务 → bot 应说明退订影响并请求确认
    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);

    // Step 3: 用户确认退订 → bot 应执行 cancel_service 并反馈结果
    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);

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

    expect(reply2.length, '取消后回复不应为空').toBeGreaterThan(5);
    // 语义正确性由 promptfoo eval 覆盖: datasets/service-cancel.yaml SC-02
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

    expect(reply.length, '转人工回复不应为空').toBeGreaterThan(5);
    // 语义正确性由 promptfoo eval 覆盖: datasets/service-cancel.yaml SC-03
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

    await sendMessage(page, '帮我把视频会员流量包退掉');
    await waitForBotReply(page);
    const reply2 = await getLastBotReply(page);

    expect(reply2.length, '第 2 步回复不应为空').toBeGreaterThan(10);

    await sendMessage(page, '确认退订');
    await waitForBotReply(page);
    const reply3 = await getLastBotReply(page);

    expect(reply3.length, '第 3 步回复不应为空').toBeGreaterThan(10);

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

    expect(reply2.length, '取消后回复不应为空').toBeGreaterThan(5);
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
    expect(reply.length, '转人工回复不应为空').toBeGreaterThan(5);
  });
});

// ── 自动生成测试用例：重新生成 + 全量运行 ─────────────────────────────────────

test.describe.serial('service-cancel 自动生成测试用例', () => {
  test.setTimeout(600_000);

  test('AUTO-SC-01: 重新生成测试用例', async ({ page }) => {
    await navigateToTestCases(page, 'service-cancel');
    const count = await regenerateTestCases(page);
    expect(count, '应至少生成 3 条测试用例').toBeGreaterThanOrEqual(3);
  });

  test('AUTO-SC-02: 运行全部用例并验证通过', async ({ page }) => {
    await navigateToTestCases(page, 'service-cancel');
    const stats = await runAllCasesInChat(page);
    expect(stats.total, '应有用例被执行').toBeGreaterThan(0);
    expect(stats.passed, '通过数应大于 0').toBeGreaterThan(0);
    expect(stats.passed / stats.total, `通过率 ${stats.passed}/${stats.total} 应 >= 50%`).toBeGreaterThanOrEqual(0.5);
  });
});
