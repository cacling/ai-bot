/**
 * outbound-marketing SOP E2E 测试
 *
 * 外呼营销技能的流程验证（text mode）。
 * 状态图分支：合规检查 → 呼叫 → 身份确认 → 意愿探测 → 方案介绍 → 意向判断
 *
 * 工具：record_marketing_result, send_followup_sms, transfer_to_human
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { connectOutbound, type OutboundWsClient } from '../../fixtures/outbound-helpers';
import { navigateToTestCases, regenerateTestCases, runAllCasesInChat } from '../../fixtures/testcase-ui-helpers';

test.describe.serial('outbound-marketing SOP: 标准营销流程', () => {
  test.setTimeout(300_000);

  test('SOP-MKT-01: 接通→身份确认→套餐介绍→用户同意→记录结果', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'marketing', id: 'M001' });

      const opening = client.getBotResponses()[0];
      expect(opening).toBeTruthy();

      // User confirms identity
      const r1 = await client.sendAndWait('是的，我是');
      expect(r1).toBeTruthy();

      // User shows interest
      const r2 = await client.sendAndWait('听起来不错，具体怎么办理？');
      expect(r2).toBeTruthy();

      // User agrees
      const r3 = await client.sendAndWait('好的，我办理');
      expect(r3).toBeTruthy();

      // Opening + at least one reply per user message; LLM may merge turns
      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  test('SOP-MKT-02: 用户犹豫→异议处理（价格/合约）→说服→同意', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'marketing', id: 'M001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User raises price objection
      const r1 = await client.sendAndWait('这个套餐太贵了，我现在的够用了');
      expect(r1).toBeTruthy();

      // Bot should address the objection; user is persuaded
      const r2 = await client.sendAndWait('这样说的话好像确实划算，那我办吧');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });
});

test.describe.serial('outbound-marketing SOP: 拒绝与 DND', () => {
  test.setTimeout(300_000);

  test('SOP-MKT-03: 用户不感兴趣→记录结果→礼貌结束', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'marketing', id: 'M001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      const r1 = await client.sendAndWait('不需要，谢谢');
      expect(r1).toBeTruthy();

      const r2 = await client.sendAndWait('真的不需要');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  test('SOP-MKT-04: 用户要求加入免打扰名单→记录DND→结束', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'marketing', id: 'M001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User explicitly requests DND
      const r1 = await client.sendAndWait('不需要，以后也别再打了，把我从你们名单里删掉');
      expect(r1).toBeTruthy();

      // Bot should acknowledge DND request and end politely
      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(2);
    } finally {
      client?.close();
    }
  });
});

test.describe.serial('outbound-marketing SOP: 特殊分支', () => {
  test.setTimeout(300_000);

  test('SOP-MKT-05: 用户对其他套餐感兴趣→切换推荐方案→介绍新方案', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'marketing', id: 'M001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User interested but in a different plan
      const r1 = await client.sendAndWait('这个套餐不太适合我，你们有没有流量更多的？');
      expect(r1).toBeTruthy();

      // Bot should switch recommendation; user responds
      const r2 = await client.sendAndWait('这个听起来还行，多少钱一个月？');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  // ── 以下场景为拨前门控（pre-dial gate），text mode 连接即代表接通，无法模拟 ──
  test.skip('SOP-MKT-06: 合规检查不通过（DND 名单/呼叫限制）→任务跳过（拨前门控，需语音模式或单元测试）', async () => {});
  test.skip('SOP-MKT-07: 未接/忙线→record_marketing_result(no_answer)→结束（拨前门控，需语音模式或单元测试）', async () => {});
});

// ── 自动生成测试用例：重新生成 + 全量运行 ─────────────────────────────────────

test.describe.serial('outbound-marketing 自动生成测试用例', () => {
  test.setTimeout(600_000);

  test('AUTO-MKT-01: 重新生成测试用例', async ({ page }) => {
    await navigateToTestCases(page, 'outbound-marketing');
    const count = await regenerateTestCases(page);
    expect(count, '应至少生成 3 条测试用例').toBeGreaterThanOrEqual(3);
  });

  test('AUTO-MKT-02: 运行全部用例并验证通过', async ({ page }) => {
    await navigateToTestCases(page, 'outbound-marketing');
    const stats = await runAllCasesInChat(page);
    expect(stats.total, '应有用例被执行').toBeGreaterThan(0);
    expect(stats.passed, '通过数应大于 0').toBeGreaterThan(0);
    expect(stats.passed / stats.total, `通过率 ${stats.passed}/${stats.total} 应 >= 50%`).toBeGreaterThanOrEqual(0.5);
  });
});
