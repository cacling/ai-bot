/**
 * integration.test.ts — MCP Server 集成测试
 *
 * 需要 MCP Server 已启动（通过 start.sh 或手动）。
 * 如果服务未运行，测试自动跳过。
 */
import { describe, test, expect, beforeAll } from 'bun:test';

// 绕过代理——本地 MCP Server 不走 proxy
delete process.env.ALL_PROXY;
delete process.env.all_proxy;
delete process.env.HTTP_PROXY;
delete process.env.http_proxy;
delete process.env.HTTPS_PROXY;
delete process.env.https_proxy;

const SERVERS = {
  userInfo:  { url: 'http://127.0.0.1:18003/mcp', name: 'user-info-service' },
  business:  { url: 'http://127.0.0.1:18004/mcp', name: 'business-service' },
  diagnosis: { url: 'http://127.0.0.1:18005/mcp', name: 'diagnosis-service' },
  outbound:  { url: 'http://127.0.0.1:18006/mcp', name: 'outbound-service' },
  account:   { url: 'http://127.0.0.1:18007/mcp', name: 'account-service' },
};

let serversAvailable = false;

/** Parse SSE response from MCP StreamableHTTP */
async function parseMcpResponse(res: Response): Promise<any> {
  const raw = await res.text();
  // SSE format: "event: message\ndata: {...json...}\n\n"
  const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
  if (dataLine) return JSON.parse(dataLine.slice(6));
  // Fallback: try direct JSON
  return JSON.parse(raw);
}

async function mcpCall(url: string, toolName: string, args: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  const json = await parseMcpResponse(res);
  if (json.error) throw new Error(JSON.stringify(json.error));
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

async function mcpListTools(url: string): Promise<string[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const json = await parseMcpResponse(res);
  return (json.result?.tools ?? []).map((t: any) => t.name);
}

beforeAll(async () => {
  try {
    const res = await fetch(SERVERS.userInfo.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(3000),
    });
    // MCP StreamableHTTP may return 200 with SSE or JSON
    serversAvailable = res.status === 200;
  } catch {
    serversAvailable = false;
  }
  if (!serversAvailable) {
    console.log('[integration] MCP Servers not running — skipping integration tests. Start services with ./start.sh first.');
  }
});

function skipIfUnavailable() {
  if (!serversAvailable) {
    console.log('  [skip] servers not available');
    return true;
  }
  return false;
}

// ── user-info-service ────────────────────────────────────────────────────────

describe('user-info-service integration', () => {
  test('tools/list returns 4 tools including analyze_bill_anomaly', async () => {
    if (skipIfUnavailable()) return;
    const tools = await mcpListTools(SERVERS.userInfo.url);
    expect(tools).toContain('query_subscriber');
    expect(tools).toContain('query_bill');
    expect(tools).toContain('query_plans');
    expect(tools).toContain('analyze_bill_anomaly');
    expect(tools).toHaveLength(4);
  });

  test('query_subscriber returns enriched data with arrears_level', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.userInfo.url, 'query_subscriber', { phone: '13800000001' });
    expect(result.found).toBe(true);
    expect(result.subscriber.arrears_level).toBeDefined();
    expect(result.subscriber.data_usage_ratio).toBeDefined();
    expect(result.subscriber.services).toBeDefined();
    expect(result.subscriber.vas_total_fee).toBeDefined();
  });

  test('query_subscriber unlimited plan returns usage_ratio=null', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.userInfo.url, 'query_subscriber', { phone: '13800000002' });
    expect(result.found).toBe(true);
    expect(result.subscriber.data_usage_ratio).toBeNull();
  });

  test('query_bill returns breakdown and payable', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.userInfo.url, 'query_bill', { phone: '13800000001', month: '2026-03' });
    expect(result.found).toBe(true);
    expect(result.bill.breakdown).toBeDefined();
    expect(result.bill.breakdown.length).toBeGreaterThan(0);
    expect(result.bill.payable).toBeDefined();
  });

  test('analyze_bill_anomaly returns comparison result', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.userInfo.url, 'analyze_bill_anomaly', { phone: '13800000001', month: '2026-03' });
    expect(result.current_month).toBe('2026-03');
    expect(result.previous_month).toBe('2026-02');
    expect(result.primary_cause).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });
});

// ── business-service ─────────────────────────────────────────────────────────

describe('business-service integration', () => {
  test('tools/list returns cancel_service and issue_invoice', async () => {
    if (skipIfUnavailable()) return;
    const tools = await mcpListTools(SERVERS.business.url);
    expect(tools).toContain('cancel_service');
    expect(tools).toContain('issue_invoice');
  });
});

// ── diagnosis-service ────────────────────────────────────────────────────────

describe('diagnosis-service integration', () => {
  test('diagnose_network returns severity and next_action', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.diagnosis.url, 'diagnose_network', {
      phone: '13800000001', issue_type: 'slow_data',
    });
    expect(result.success).toBe(true);
    expect(result.severity).toBeDefined();
    expect(result.should_escalate).toBeDefined();
    expect(result.next_action).toBeDefined();
  });

  test('diagnose_app returns risk_level and next_step', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.diagnosis.url, 'diagnose_app', {
      phone: '13800000001', issue_type: 'login_failed',
    });
    expect(result.success).toBe(true);
    expect(result.risk_level).toBeDefined();
    expect(result.next_step).toBeDefined();
  });
});

// ── outbound-service ─────────────────────────────────────────────────────────

describe('outbound-service integration', () => {
  test('record_call_result rejects ptp without date', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.outbound.url, 'record_call_result', { result: 'ptp' });
    expect(result.success).toBe(false);
    expect(result.validation_error).toBe('ptp_date_required');
  });

  test('record_call_result accepts ptp with valid date', async () => {
    if (skipIfUnavailable()) return;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const result = await mcpCall(SERVERS.outbound.url, 'record_call_result', {
      result: 'ptp', ptp_date: tomorrow,
    });
    expect(result.success).toBe(true);
    expect(result.result_category).toBe('positive');
  });

  test('record_call_result accepts power_off and dnd', async () => {
    if (skipIfUnavailable()) return;
    const r1 = await mcpCall(SERVERS.outbound.url, 'record_call_result', { result: 'power_off' });
    expect(r1.success).toBe(true);
    const r2 = await mcpCall(SERVERS.outbound.url, 'record_call_result', { result: 'dnd' });
    expect(r2.success).toBe(true);
    expect(r2.result_category).toBe('negative');
  });

  test('record_marketing_result returns conversion_tag', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.outbound.url, 'record_marketing_result', {
      campaign_id: 'test', phone: '13800000001', result: 'converted',
    });
    expect(result.success).toBe(true);
    expect(result.conversion_tag).toBe('converted');
  });
});

// ── account-service ──────────────────────────────────────────────────────────

describe('account-service integration', () => {
  test('tools/list does NOT include apply_service_suspension', async () => {
    if (skipIfUnavailable()) return;
    const tools = await mcpListTools(SERVERS.account.url);
    expect(tools).not.toContain('apply_service_suspension');
    expect(tools).toContain('verify_identity');
    expect(tools).toContain('check_account_balance');
    expect(tools).toContain('check_contracts');
  });

  test('check_account_balance returns balance info', async () => {
    if (skipIfUnavailable()) return;
    const result = await mcpCall(SERVERS.account.url, 'check_account_balance', { phone: '13800000001' });
    expect(result.success).toBe(true);
    expect(result.balance).toBeDefined();
    expect(result.has_arrears).toBeDefined();
  });
});
