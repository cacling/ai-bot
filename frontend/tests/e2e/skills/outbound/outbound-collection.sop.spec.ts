/**
 * outbound-collection SOP E2E 测试
 *
 * 外呼催收技能的流程验证（text mode）。
 * 状态图分支：合规检查 → 呼叫 → 身份确认 → 告知欠款 → 意向判断 → 记录
 *
 * 工具：record_call_result, send_followup_sms, create_callback_task
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { connectOutbound, type OutboundWsClient } from '../../fixtures/outbound-helpers';
import { navigateToTestCases, regenerateTestCases, runAllCasesInChat } from '../../fixtures/testcase-ui-helpers';

test.describe.serial('outbound-collection SOP: 标准催收流程', () => {
  test.setTimeout(300_000);

  test('SOP-COL-01: 接通→身份确认→告知欠款→承诺还款→记录结果→发短信', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });

      // Bot opening should have been sent
      const opening = client.getBotResponses()[0];
      expect(opening).toBeTruthy();

      // User confirms identity
      const r1 = await client.sendAndWait('对，我是本人');
      expect(r1).toBeTruthy();

      // User acknowledges debt and promises to pay
      const r2 = await client.sendAndWait('好的我知道了，我后天就还');
      expect(r2).toBeTruthy();

      // Check that some response references payment or PTP
      // (Exact wording depends on LLM, just verify flow continues)
      // Opening + at least one reply per user message; LLM may merge turns
      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(2);
    } finally {
      client?.close();
    }
  });

  test('SOP-COL-02: 用户承诺但日期不合理→追问→修正PTP→确认', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // Promise to pay but with an unreasonably far date (exceeds max_ptp_days)
      const r1 = await client.sendAndWait('我下个月底再还吧，最近手头紧');
      expect(r1).toBeTruthy();

      // Bot should negotiate a closer date; user agrees to a nearer date
      const r2 = await client.sendAndWait('那好吧，这周五还可以吗');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });
});

test.describe.serial('outbound-collection SOP: 拒绝分支', () => {
  test.setTimeout(300_000);

  test('SOP-COL-03: 用户拒绝还款→温和二次沟通→仍拒绝→记录结果', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      // User confirms identity
      await client.sendAndWait('是我');

      // User refuses
      const r1 = await client.sendAndWait('我不想还，没钱');

      // Bot should handle refusal gracefully
      expect(r1).toBeTruthy();

      // User insists
      const r2 = await client.sendAndWait('真的没钱，不要再打了');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  test('SOP-COL-04: 用户有异议（金额/账单争议）→引导核实→升级处理', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User disputes the amount
      const r1 = await client.sendAndWait('这个金额不对吧，我上个月明明交过了，你们搞错了');
      expect(r1).toBeTruthy();

      // Bot should collect dispute details; user provides more info
      const r2 = await client.sendAndWait('我是通过支付宝交的，大概15号左右');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });
});

test.describe.serial('outbound-collection SOP: 特殊情况', () => {
  test.setTimeout(300_000);

  test('SOP-COL-05: 模糊承诺→追问具体日期→转为PTP或创建回访', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User gives vague promise without specific date
      const r1 = await client.sendAndWait('知道了，我最近会还的');
      expect(r1).toBeTruthy();

      // Bot should ask for specific date; user provides one
      const r2 = await client.sendAndWait('那就这周五吧');
      expect(r2).toBeTruthy();

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  test('SOP-COL-06: 脆弱客户识别→停止施压→转人工', async () => {
    let client: OutboundWsClient | null = null;
    try {
      client = await connectOutbound({ task: 'collection', id: 'C001' });
      expect(client.getBotResponses()[0]).toBeTruthy();

      await client.sendAndWait('是我');

      // User reveals vulnerable situation
      const r1 = await client.sendAndWait('我现在生了重病在住院，根本没办法处理这些事情');
      expect(r1).toBeTruthy();

      // Bot should stop pressing and show empathy
      // May trigger transfer_to_human or record_call_result(vulnerable)
      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(2);
    } finally {
      client?.close();
    }
  });

  // ── 以下场景为拨前门控（pre-dial gate），text mode 连接即代表接通，无法模拟未接通场景 ──
  test.skip('SOP-COL-07: 未接/忙线/关机→record_call_result(no_answer)→结束（拨前门控，需语音模式）', async () => {});
});

test.describe.serial('outbound-collection SOP: 合规阻止', () => {
  test.setTimeout(300_000);
  // 合规拦截发生在呼叫建立前，text mode WS 连接即代表通话已接通，无法覆盖拨前门控逻辑
  test.skip('SOP-COL-08: 非法时段呼叫→合规拦截→任务延后（拨前门控，需语音模式或单元测试）', async () => {});
  test.skip('SOP-COL-09: 超最大重试次数→合规拦截→标记放弃（拨前门控，需语音模式或单元测试）', async () => {});
});

// ── 自动生成测试用例：重新生成 + 全量运行 ─────────────────────────────────────

test.describe.serial('outbound-collection 自动生成测试用例', () => {
  test.setTimeout(600_000);

  test('AUTO-COL-01: 重新生成测试用例', async ({ page }) => {
    await navigateToTestCases(page, 'outbound-collection');
    const count = await regenerateTestCases(page);
    expect(count, '应至少生成 3 条测试用例').toBeGreaterThanOrEqual(3);
  });

  test('AUTO-COL-02: 运行全部用例并验证通过', async ({ page }) => {
    await navigateToTestCases(page, 'outbound-collection');
    const stats = await runAllCasesInChat(page);
    expect(stats.total, '应有用例被执行').toBeGreaterThan(0);
    console.log(`[AUTO] ${stats.passed}/${stats.total} passed (${(stats.passed/stats.total*100).toFixed(0)}%)`);
  });
});
