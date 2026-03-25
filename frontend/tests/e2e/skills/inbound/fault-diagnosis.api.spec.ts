/**
 * fault-diagnosis API 工具调用测试
 *
 * 验证 diagnose_network 工具在不同故障类型下的调用和响应。
 *
 * 依赖：服务已启动（./start.sh 或 ./start.sh --reset）
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:18472';

test.describe('fault-diagnosis API: diagnose_network 工具调用', () => {
  test.setTimeout(120_000);

  test('TC-FD-01 用户报告无信号，LLM 调用 diagnose_network(no_signal)', async ({ request }) => {
    const sessionId = `fd-no-signal-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: '我的手机号是 13800000001，手机完全没有信号，帮我诊断一下',
        session_id: sessionId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string };
    expect(typeof body.response).toBe('string');
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.response).toMatch(/信号|基站|SIM|APN|诊断/);
  });

  test('TC-FD-02 用户报告网速慢，LLM 调用 diagnose_network(slow_data)', async ({ request }) => {
    const sessionId = `fd-slow-data-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: '我是 13800000001，最近网速非常慢，帮我查一下是什么原因',
        session_id: sessionId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string };
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.response).toMatch(/流量|网络|网速|拥塞|诊断/);
  });

  test('TC-FD-03 用户报告通话中断，LLM 调用 diagnose_network(call_drop)', async ({ request }) => {
    const sessionId = `fd-call-drop-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: '我手机号 13800000001，打电话经常断线，请帮我诊断',
        session_id: sessionId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string };
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.response).toMatch(/通话|VoLTE|基站|中断|诊断/);
  });

  test('TC-FD-04 停机账号诊断结果包含停机提示', async ({ request }) => {
    const sessionId = `fd-suspended-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: '手机号 13800000003，无法上网，帮我做网络诊断',
        session_id: sessionId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string };
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.response).toMatch(/停机|欠费|暂停|诊断/);
  });

  test('TC-FD-05 不存在的手机号诊断返回未找到提示', async ({ request }) => {
    const sessionId = `fd-notfound-${Date.now()}`;
    const res = await request.post(`${BACKEND}/api/chat`, {
      data: {
        message: '手机号 19900000099 无法上网，帮我诊断',
        session_id: sessionId,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { response: string };
    expect(body.response.length).toBeGreaterThan(0);
    expect(body.response).toMatch(/未找到|不存在|查询不到|没有.*记录|无法|诊断|检查|号码/);
  });
});
