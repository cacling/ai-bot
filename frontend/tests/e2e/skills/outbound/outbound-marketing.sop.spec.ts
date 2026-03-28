/**
 * outbound-marketing SOP E2E 测试
 *
 * 外呼营销技能的流程验证（text mode）。
 * 状态图分支：合规检查 → 呼叫 → 身份确认 → 意愿探测 → 方案介绍 → 意向判断
 *
 * 工具：record_call_result, send_followup_sms, create_callback_task
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';
import { connectOutbound, type OutboundWsClient } from '../../fixtures/outbound-helpers';

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

      const allResponses = client.getBotResponses();
      expect(allResponses.length).toBeGreaterThanOrEqual(4);
    } finally {
      client?.close();
    }
  });

  test.skip('SOP-MKT-02: 用户犹豫→异议处理（价格/合约）→说服→同意', async () => {});
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

  test.skip('SOP-MKT-04: 用户要求加入免打扰名单→记录DND→结束', async () => {});
});

test.describe.serial('outbound-marketing SOP: 特殊分支', () => {
  test.setTimeout(300_000);
  test.skip('SOP-MKT-05: 用户对其他套餐感兴趣→切换推荐方案→介绍新方案', async () => {});
  test.skip('SOP-MKT-06: 合规检查不通过（DND 名单/呼叫限制）→任务跳过', async () => {});
  test.skip('SOP-MKT-07: 未接/忙线→record_marketing_result(no_answer)→结束', async () => {});
});
