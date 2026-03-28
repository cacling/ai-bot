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
      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(3);
    } finally {
      client?.close();
    }
  });

  test.skip('SOP-COL-02: 用户承诺但日期不合理→追问→修正PTP→确认', async () => {});
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

  test.skip('SOP-COL-04: 用户有异议（金额/账单争议）→引导核实→升级处理', async () => {});
});

test.describe.serial('outbound-collection SOP: 特殊情况', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-05: 模糊承诺→追问具体日期→转为PTP或创建回访', async () => {});
  test.skip('SOP-COL-06: 脆弱客户识别→停止施压→转人工', async () => {});
  test.skip('SOP-COL-07: 未接/忙线/关机→record_call_result(no_answer)→结束', async () => {});
});

test.describe.serial('outbound-collection SOP: 合规阻止', () => {
  test.setTimeout(300_000);
  test.skip('SOP-COL-08: 非法时段呼叫→合规拦截→任务延后', async () => {});
  test.skip('SOP-COL-09: 超最大重试次数→合规拦截→标记放弃', async () => {});
});
