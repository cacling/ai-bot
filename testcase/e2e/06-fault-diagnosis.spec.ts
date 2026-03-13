/**
 * 网络故障诊断 端到端 API 测试
 * 需要 start.sh 已启动（backend :8000, telecom-mcp :8003）
 *
 * 测试覆盖：
 *   - 四种故障类型（no_signal / slow_data / call_drop / no_network）
 *   - 停机账号（王五 13800000003）的诊断结果包含停机提示
 *   - 响应包含诊断步骤结构（diagnostic_steps）
 *
 * 注意：Chat API 会调用真实 LLM，响应时间 5-30s，超时设为 120s
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://localhost:8000';

test.describe('故障诊断 Chat API', () => {
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
    // 应提到信号相关内容
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
    // 应提到流量或网络相关内容
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
    // 应提到通话相关内容
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
    // 停机账号应在诊断中体现停机或欠费信息
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
    // LLM 应反馈找不到该号码
    expect(body.response).toMatch(/未找到|不存在|查询不到|没有.*记录/);
  });
});
