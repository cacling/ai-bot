/**
 * MCP 管理 e2e 测试 — 统一 Server 架构
 *
 * 验证统一 MCP Server 的注册、发现、调用、Mock、禁用、概览。
 * 前置条件：backend(:18472) + MCP server(:18003) 已启动，DB 已 seed。
 */
import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18472/api/mcp';

// Unified internal server (from seed.ts)
const INTERNAL_SERVER = {
  id: 'mcp-internal',
  port: 18003,
  tools: [
    'query_subscriber', 'query_bill', 'query_plans', 'analyze_bill_anomaly',
    'cancel_service', 'issue_invoice',
    'diagnose_network', 'diagnose_app',
    'record_call_result', 'send_followup_sms', 'create_callback_task', 'record_marketing_result',
    'verify_identity', 'check_account_balance', 'check_contracts', 'apply_service_suspension',
  ],
};

const SRV_ID = INTERNAL_SERVER.id;
const ALL_TOOLS = INTERNAL_SERVER.tools;

// ── 1. 列表与发现 ────────────────────────────────────────────────────────────

test.describe('Server 列表与发现', () => {
  test('TC-MCP-01 列表包含统一 internal Server', async ({ request }) => {
    const res = await request.get(`${API}/servers`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.items.some((item: { id: string }) => item.id === SRV_ID)).toBeTruthy();
  });

  test('TC-MCP-02 discover internal-service 返回全部工具', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/discover`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.tools.length).toBeGreaterThanOrEqual(INTERNAL_SERVER.tools.length);
    const names = body.tools.map((t: { name: string }) => t.name);
    for (const tool of INTERNAL_SERVER.tools) {
      expect(names).toContain(tool);
    }
  });
});

// ── 2. 逐工具 Real 调用 ─────────────────────────────────────────────────────

test.describe('工具 Real 调用', () => {
  test('TC-MCP-10 query_subscriber', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'query_subscriber', arguments: { phone: '13800000001' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.found).toBe(true);
    expect(data.subscriber.name).toBe('张三');
  });

  test('TC-MCP-11 query_bill', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'query_bill', arguments: { phone: '13800000001' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.found).toBe(true);
  });

  test('TC-MCP-12 query_plans', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'query_plans', arguments: {} },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.found).toBe(true);
    expect(data.plans.length).toBeGreaterThanOrEqual(4);
  });

  test('TC-MCP-13 cancel_service', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'cancel_service', arguments: { phone: '13800000001', service_id: 'video_pkg' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });

  test('TC-MCP-14 issue_invoice', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'issue_invoice', arguments: { phone: '13800000001', month: '2026-03', email: 'test@example.com' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.invoice_no).toBeTruthy();
  });

  test('TC-MCP-15 diagnose_network', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'diagnose_network', arguments: { phone: '13800000001', issue_type: 'slow_data' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.diagnostic_steps).toBeTruthy();
  });

  test('TC-MCP-16 diagnose_app', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'diagnose_app', arguments: { phone: '13800000001', issue_type: 'app_locked' } },
    });
    expect(res.ok()).toBeTruthy();
    const content = (await res.json()).result.content;
    expect(content.length).toBeGreaterThan(0);
  });

  test('TC-MCP-17 record_call_result', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'record_call_result', arguments: { result: 'ptp', ptp_date: '2026-03-25' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });

  test('TC-MCP-18 send_followup_sms', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'send_followup_sms', arguments: { phone: '13900000001', sms_type: 'payment_link' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });

  test('TC-MCP-19 create_callback_task', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'create_callback_task', arguments: { original_task_id: 'C001', callback_phone: '13900000001', preferred_time: '明天上午10点' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });

  test('TC-MCP-20 record_marketing_result', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'record_marketing_result', arguments: { campaign_id: 'M001', phone: '13900000004', result: 'converted' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });

  test('TC-MCP-21 verify_identity', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'verify_identity', arguments: { phone: '13800000001', otp: '1234' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.verified).toBe(true);
  });

  test('TC-MCP-22 check_account_balance', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'check_account_balance', arguments: { phone: '13800000003' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.has_arrears).toBe(true);
  });

  test('TC-MCP-23 check_contracts', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'check_contracts', arguments: { phone: '13800000001' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.has_high_risk).toBe(true);
  });

  test('TC-MCP-24 check_contracts', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/invoke`, {
      data: { tool_name: 'check_contracts', arguments: { phone: '13800000002' } },
    });
    expect(res.ok()).toBeTruthy();
    const data = JSON.parse((await res.json()).result.content[0].text);
    expect(data.success).toBe(true);
  });
});

// ── 3. Mock 规则 ─────────────────────────────────────────────────────────────

test.describe.serial('Mock 规则', () => {
  test('TC-MCP-30 保存 Mock 规则到 user-info-service', async ({ request }) => {
    const mockRules = [
      { tool_name: 'query_subscriber', match: 'phone == "13800000001"', response: '{"found":true,"subscriber":{"name":"Mock张三"}}' },
      { tool_name: 'query_subscriber', match: '', response: '{"found":false,"message":"Mock: 未找到"}' },
    ];
    const res = await request.put(`${API}/servers/${SRV_ID}`, {
      data: { mock_rules: JSON.stringify(mockRules) },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('TC-MCP-31 Mock 调用匹配特定规则', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/mock-invoke`, {
      data: { tool_name: 'query_subscriber', arguments: { phone: '13800000001' } },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.mock).toBe(true);
    expect(body.result.content[0].text).toContain('Mock张三');
  });

  test('TC-MCP-32 Mock 调用命中默认兜底', async ({ request }) => {
    const res = await request.post(`${API}/servers/${SRV_ID}/mock-invoke`, {
      data: { tool_name: 'query_subscriber', arguments: { phone: '99999999999' } },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).result.content[0].text).toContain('未找到');
  });

  test('TC-MCP-33 清理测试 Mock 规则（还原 seed 数据）', async ({ request }) => {
    // 还原：移除测试添加的规则，保留 seed 原始规则
    // 通过重新 seed 实现（由下次 global-setup 完成），这里只验证 API 可用
    const res = await request.get(`${API}/servers/${SRV_ID}`);
    expect(res.ok()).toBeTruthy();
  });
});

// ── 4. 工具禁用 ─────────────────────────────────────────────────────────────

test.describe.serial('工具禁用', () => {
  test('TC-MCP-40 禁用 issue_invoice', async ({ request }) => {
    const res = await request.put(`${API}/servers/${SRV_ID}`, {
      data: { disabled_tools: JSON.stringify(['issue_invoice']) },
    });
    expect(res.ok()).toBeTruthy();
    const detail = await (await request.get(`${API}/servers/${SRV_ID}`)).json();
    expect(JSON.parse(detail.disabled_tools)).toContain('issue_invoice');
  });

  test('TC-MCP-41 恢复启用', async ({ request }) => {
    const res = await request.put(`${API}/servers/${SRV_ID}`, {
      data: { disabled_tools: JSON.stringify([]) },
    });
    expect(res.ok()).toBeTruthy();
  });
});

// ── 5. 工具概览 ─────────────────────────────────────────────────────────────

test.describe('工具概览', () => {
  test('TC-MCP-50 概览包含 15 个 MCP 工具', async ({ request }) => {
    const res = await request.get(`${API}/tools`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const mcpTools = body.items.filter((t: { source_type: string }) => t.source_type === 'mcp');
    expect(mcpTools.length).toBeGreaterThanOrEqual(15);
  });

  test('TC-MCP-51 概览包含内建工具', async ({ request }) => {
    const res = await request.get(`${API}/tools`);
    const body = await res.json();
    const builtins = body.items.filter((t: { source_type: string }) => t.source_type === 'builtin');
    const names = builtins.map((t: { name: string }) => t.name);
    expect(names).toContain('get_skill_instructions');
    expect(names).toContain('transfer_to_human');
  });

  test('TC-MCP-52 工具来源对应统一 internal-service', async ({ request }) => {
    const res = await request.get(`${API}/tools`);
    const items = (await res.json()).items as Array<{ name: string; source: string }>;

    for (const toolName of ['query_subscriber', 'cancel_service', 'diagnose_network', 'record_call_result', 'verify_identity']) {
      expect(items.find(t => t.name === toolName)?.source).toBe('internal-service');
    }
  });

  test('TC-MCP-53 工具关联到正确的 Skill', async ({ request }) => {
    const res = await request.get(`${API}/tools`);
    const items = (await res.json()).items as Array<{ name: string; skills: string[] }>;

    const qs = items.find(t => t.name === 'query_subscriber');
    expect(qs!.skills).toContain('bill-inquiry');
    expect(qs!.skills).toContain('service-cancel');

    const dn = items.find(t => t.name === 'diagnose_network');
    expect(dn!.skills).toContain('fault-diagnosis');

    const rcr = items.find(t => t.name === 'record_call_result');
    expect(rcr!.skills).toContain('outbound-collection');
  });
});

// ── 6. CRUD（新建/编辑/删除） ────────────────────────────────────────────────

test.describe.serial('Server CRUD', () => {
  const TS = Date.now();
  let testId: string;

  test('TC-MCP-60 新建 Server', async ({ request }) => {
    const res = await request.post(`${API}/servers`, {
      data: { name: `e2e-test-${TS}`, description: 'e2e', transport: 'http', status: 'planned' },
    });
    expect(res.ok()).toBeTruthy();
    testId = (await res.json()).id;
  });

  test('TC-MCP-61 编辑 Server', async ({ request }) => {
    const res = await request.put(`${API}/servers/${testId}`, { data: { description: '已编辑' } });
    expect(res.ok()).toBeTruthy();
    const detail = await (await request.get(`${API}/servers/${testId}`)).json();
    expect(detail.description).toBe('已编辑');
  });

  test('TC-MCP-62 删除 Server', async ({ request }) => {
    const res = await request.delete(`${API}/servers/${testId}`);
    expect(res.ok()).toBeTruthy();
    const detail = await request.get(`${API}/servers/${testId}`);
    expect(detail.status()).toBe(404);
  });
});
