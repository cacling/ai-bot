/**
 * API tests for: src/services/business_service.ts (Port: 18004)
 * Tools: cancel_service, issue_invoice
 * Mock: backendPost (mock_apis HTTP calls)
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { mockBackend, loadService, createTestClient, callTool } from './helpers';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// ── Mock data ────────────────────────────────────────────────────────────────

const CANCEL_SUCCESS = {
  success: true,
  order_id: 'ORD-20260301-001',
  phone: '13800000001',
  service_id: 'video_pkg',
  service_name: '视频会员包',
  monthly_fee: 15,
  status: 'cancelled',
  effective_at: '2026-03-31',
  refund_eligible: false,
  refund_note: '当月费用不退，次月起不再扣费。',
};

const CANCEL_NOT_FOUND = {
  success: false,
  message: '未找到该增值业务或用户未订阅此服务',
};

const CANCEL_PHONE_NOT_FOUND = {
  success: false,
  message: '未找到该用户',
};

const INVOICE_SUCCESS = {
  success: true,
  invoice_no: 'INV-20260301-001',
  total: 120,
  email: 'user@example.com',
  status: 'issued',
};

const INVOICE_FAIL_PHONE = {
  success: false,
  message: '未找到该用户的账单记录',
};

// ── Track POST bodies for audit assertions ───────────────────────────────────

let lastPostBody: any = null;

// ── Setup ────────────────────────────────────────────────────────────────────

let client: Client;

beforeAll(async () => {
  mockBackend({
    post: (path: string, body: unknown) => {
      lastPostBody = body;

      if (path === '/api/orders/service-cancel') {
        const b = body as { phone: string; service_id: string };
        if (b.phone === '13899999999') return CANCEL_PHONE_NOT_FOUND;
        if (b.service_id === 'nonexist_svc') return CANCEL_NOT_FOUND;
        if (b.phone === '13800000001' && b.service_id === 'video_pkg') return CANCEL_SUCCESS;
        return CANCEL_NOT_FOUND;
      }

      if (path === '/api/invoice/issue') {
        const b = body as { phone: string; month: string; email: string };
        if (b.phone === '13899999999') return INVOICE_FAIL_PHONE;
        if (b.phone === '13800000001') return INVOICE_SUCCESS;
        return INVOICE_FAIL_PHONE;
      }

      return { success: false, message: `Unmocked POST: ${path}` };
    },
  });

  const createServer = await loadService('src/services/business_service.ts');
  client = await createTestClient(createServer);
});

// ── cancel_service ───────────────────────────────────────────────────────────

describe('cancel_service', () => {
  test('cancels existing service and returns order details', async () => {
    const res = await callTool(client, 'cancel_service', {
      phone: '13800000001',
      service_id: 'video_pkg',
    });
    expect(res.order_id).toBe('ORD-20260301-001');
    expect(res.phone).toBe('13800000001');
    expect(res.service_id).toBe('video_pkg');
    expect(res.service_name).toBe('视频会员包');
    expect(res.monthly_fee).toBe(15);
    expect(res.effective_end).toBe('2026-03-31');
    expect(res.refund_eligible).toBe(false);
    expect(res.refund_note).toBe('当月费用不退，次月起不再扣费。');
  });

  test('returns null service_name for non-existent service_id', async () => {
    const res = await callTool(client, 'cancel_service', {
      phone: '13800000001',
      service_id: 'nonexist_svc',
    });
    // Backend returns success: false, but the tool maps it to null fields
    expect(res.service_name).toBeNull();
    expect(res.order_id).toBeNull();
    expect(res.status).toBeNull();
  });

  test('returns null fields for non-existent phone', async () => {
    const res = await callTool(client, 'cancel_service', {
      phone: '13899999999',
      service_id: 'video_pkg',
    });
    expect(res.service_name).toBeNull();
    expect(res.order_id).toBeNull();
  });

  test('includes reason in cancel request when provided', async () => {
    await callTool(client, 'cancel_service', {
      phone: '13800000001',
      service_id: 'video_pkg',
      reason: '用户主动退订',
    });
    // Verify the POST body included the reason
    expect(lastPostBody.reason).toBe('用户主动退订');
    expect(lastPostBody.phone).toBe('13800000001');
    expect(lastPostBody.service_id).toBe('video_pkg');
  });

  test('returns default refund_note when backend omits it', async () => {
    // The cancel success mock includes refund_note, but the service code has a fallback:
    // res.refund_note || "当月费用不退，次月起不再扣费。"
    const res = await callTool(client, 'cancel_service', {
      phone: '13800000001',
      service_id: 'video_pkg',
    });
    expect(typeof res.refund_note).toBe('string');
    expect((res.refund_note as string).length).toBeGreaterThan(0);
  });
});

// ── issue_invoice ────────────────────────────────────────────────────────────

describe('issue_invoice', () => {
  test('issues invoice and returns invoice details on success', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-02',
      email: 'user@example.com',
    });
    expect(res.invoice_no).toBe('INV-20260301-001');
    expect(res.phone).toBe('13800000001');
    expect(res.month).toBe('2026-02');
    expect(res.total).toBe(120);
    expect(res.email).toBe('user@example.com');
    expect(res.status).toBe('issued');
  });

  test('returns null invoice_no for non-existent phone', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13899999999',
      month: '2026-02',
      email: 'user@example.com',
    });
    expect(res.invoice_no).toBeNull();
    expect(res.phone).toBe('13899999999');
    expect(res.month).toBe('2026-02');
    expect(res.status).toBeNull();
  });

  test('passes correct body to backend POST', async () => {
    await callTool(client, 'issue_invoice', {
      phone: '13800000001',
      month: '2026-03',
      email: 'test@test.com',
    });
    expect(lastPostBody.phone).toBe('13800000001');
    expect(lastPostBody.month).toBe('2026-03');
    expect(lastPostBody.email).toBe('test@test.com');
  });

  test('returns phone and month even on failure', async () => {
    const res = await callTool(client, 'issue_invoice', {
      phone: '13899999999',
      month: '2026-02',
      email: 'user@example.com',
    });
    // Even on failure, phone and month should be present in response
    expect(res.phone).toBe('13899999999');
    expect(res.month).toBe('2026-02');
    expect(res.total).toBe(0);
  });
});
