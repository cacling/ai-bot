/**
 * api-endpoints.test.ts — Mock APIs 端点测试
 *
 * 需要 mock_apis 服务已启动（port 18008）。
 * 服务未运行时自动跳过。
 */
import { describe, test, expect, beforeAll } from 'bun:test';

const BASE = 'http://127.0.0.1:18008';

// 绕过代理
delete process.env.ALL_PROXY;
delete process.env.all_proxy;
delete process.env.HTTP_PROXY;
delete process.env.http_proxy;

let available = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
    available = res.ok;
  } catch { available = false; }
  if (!available) console.log('[mock-apis] Service not running — skipping. Start with: cd mock_apis && npm run dev');
});

function skip() {
  if (!available) { console.log('  [skip]'); return true; }
  return false;
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// ── /api/identity/verify ─────────────────────────────────────────────────────

describe('POST /api/identity/verify', () => {
  test('valid OTP returns verified=true', async () => {
    if (skip()) return;
    const { status, data } = await post('/api/identity/verify', { phone: '13800000001', otp: '1234' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.verified).toBe(true);
    expect(data.customer_name).toBe('张三');
  });

  test('invalid OTP returns verified=false', async () => {
    if (skip()) return;
    const { data } = await post('/api/identity/verify', { phone: '13800000001', otp: '9999' });
    expect(data.success).toBe(false);
    expect(data.verified).toBe(false);
  });

  test('6-digit OTP accepted', async () => {
    if (skip()) return;
    const { data } = await post('/api/identity/verify', { phone: '13800000001', otp: '123456' });
    expect(data.success).toBe(true);
    expect(data.verified).toBe(true);
  });

  test('unknown phone returns not found', async () => {
    if (skip()) return;
    const { data } = await post('/api/identity/verify', { phone: '19999999999', otp: '1234' });
    expect(data.success).toBe(false);
  });

  test('missing params returns 400', async () => {
    if (skip()) return;
    const { status } = await post('/api/identity/verify', {});
    expect(status).toBe(400);
  });
});

// ── /api/invoice/issue ───────────────────────────────────────────────────────

describe('POST /api/invoice/issue', () => {
  test('valid request returns invoice number', async () => {
    if (skip()) return;
    const { data } = await post('/api/invoice/issue', { phone: '13800000001', month: '2026-03', email: 'test@example.com' });
    expect(data.success).toBe(true);
    expect(data.invoice_no).toBeDefined();
    expect((data.email as string)).toContain('*'); // masked
  });

  test('unknown phone returns error', async () => {
    if (skip()) return;
    const { data } = await post('/api/invoice/issue', { phone: '19999999999', month: '2026-03', email: 'a@b.com' });
    expect(data.success).toBe(false);
  });

  test('unknown month returns error', async () => {
    if (skip()) return;
    const { data } = await post('/api/invoice/issue', { phone: '13800000001', month: '2099-01', email: 'a@b.com' });
    expect(data.success).toBe(false);
  });

  test('missing params returns 400', async () => {
    if (skip()) return;
    const { status } = await post('/api/invoice/issue', { phone: '13800000001' });
    expect(status).toBe(400);
  });
});

// ── /api/callback/create ─────────────────────────────────────────────────────

describe('POST /api/callback/create', () => {
  test('valid request creates task', async () => {
    if (skip()) return;
    const { data } = await post('/api/callback/create', {
      original_task_id: 'T001', callback_phone: '13800000001', preferred_time: '2026-03-25 14:00',
    });
    expect(data.success).toBe(true);
    expect(data.callback_task_id).toBeDefined();
    expect((data.callback_task_id as string)).toMatch(/^CB-/);
  });

  test('with optional fields', async () => {
    if (skip()) return;
    const { data } = await post('/api/callback/create', {
      original_task_id: 'T002', callback_phone: '13800000001', preferred_time: '2026-03-26 10:00',
      customer_name: '张三', product_name: '宽带套餐',
    });
    expect(data.success).toBe(true);
  });

  test('missing required params returns 400', async () => {
    if (skip()) return;
    const { status } = await post('/api/callback/create', { original_task_id: 'T003' });
    expect(status).toBe(400);
  });
});
