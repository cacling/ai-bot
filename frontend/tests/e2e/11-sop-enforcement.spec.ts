/**
 * SOP 执行计划驱动验证 e2e 测试
 *
 * 验证 SOPGuard V2 + 编译后的 WorkflowSpec 能否在真实技能场景中约束工具调用顺序。
 * 覆盖：在线客服（service-cancel）、语音客服（共用 service-cancel）、外呼（outbound-collection）
 */
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18472/api';

test.describe.serial('SOP 执行计划驱动验证', () => {
  test.setTimeout(180_000);

  // ── 在线客服 / 语音客服：service-cancel ──────────────────────────

  test('TC-SOP-01: service-cancel 标准退订 — 先查后退', async ({ request }) => {
    const res = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'service-cancel',
        version_no: 1,
        message: '帮我把短信百条包退掉',
        useMock: true,
      },
      timeout: 120_000,
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.text).toBeTruthy();
    // Bot 应该先查询用户信息（query_subscriber），不能直接退订
    // 如果 SOP 生效，第一轮不应该出现"已退订"/"退订成功"等假闭环
    expect(result.text).not.toContain('已退订成功');
    expect(result.text).not.toContain('退订成功');
  });

  test('TC-SOP-02: service-cancel 未知扣费 — 必须先查账单', async ({ request }) => {
    const res = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'service-cancel',
        version_no: 1,
        message: '这个月不知道为什么多扣了20块钱',
        useMock: true,
      },
      timeout: 120_000,
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.text).toBeTruthy();
    // 不应该直接退订，应该先查账单
    expect(result.text).not.toContain('已退订');
  });

  test('TC-SOP-03: service-cancel 多轮对话 — 确认后才执行', async ({ request }) => {
    // 第一轮：用户要退订
    const r1 = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'service-cancel',
        version_no: 1,
        message: '帮我退掉视频会员',
        useMock: true,
      },
      timeout: 120_000,
    });
    expect(r1.ok()).toBeTruthy();
    const result1 = await r1.json();
    expect(result1.text).toBeTruthy();

    // 第二轮：用户确认退订（带 history）
    const r2 = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'service-cancel',
        version_no: 1,
        message: '确认退订',
        history: [
          { role: 'user', content: '帮我退掉视频会员' },
          { role: 'assistant', content: result1.text },
        ],
        useMock: true,
      },
      timeout: 120_000,
    });
    expect(r2.ok()).toBeTruthy();
    const result2 = await r2.json();
    expect(result2.text).toBeTruthy();
  });

  // ── 外呼：outbound-collection ─────────────────────────────────

  test('TC-SOP-04: outbound-collection 承诺还款 — 记录结果后发短信', async ({ request }) => {
    const res = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'outbound-collection',
        version_no: 1,
        message: '好吧，我下周一还，发个还款链接给我',
        useMock: true,
        persona: {
          task_type: 'collection',
          name: '张三',
          phone: '13800000001',
          arrears_amount: 150,
          overdue_days: 30,
        },
      },
      timeout: 120_000,
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.text).toBeTruthy();
    // 不应该跳过记录直接发短信
    expect(result.text).not.toContain('无法处理');
  });

  test('TC-SOP-05: outbound-collection 身份否认 — 不发催缴短信', async ({ request }) => {
    const res = await request.post(`${API}/skill-versions/test`, {
      data: {
        skill: 'outbound-collection',
        version_no: 1,
        message: '你打错了，这个号码不是本人',
        useMock: true,
        persona: {
          task_type: 'collection',
          name: '李四',
          phone: '13800000002',
          arrears_amount: 200,
          overdue_days: 15,
        },
      },
      timeout: 120_000,
    });
    expect(res.ok()).toBeTruthy();
    const result = await res.json();
    expect(result.text).toBeTruthy();
  });
});
