/**
 * api-endpoints.test.ts — Mock APIs in-process tests
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../src/server.js';

const app = createApp();

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function get(path: string) {
  const res = await app.request(`http://mock.local${path}`);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(`http://mock.local${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('GET /health', () => {
  test('returns service info and systems', async () => {
    const { status, data } = await get('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('ok');
    expect(Array.isArray(data.systems)).toBe(true);
  });
});

describe('identity and risk APIs', () => {
  test('send OTP returns a demo code', async () => {
    const { status, data } = await post('/api/identity/otp/send', { phone: '13800000001' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mock_otp).toBe('000001');
  });

  test('verify accepts last sent OTP', async () => {
    const send = await post('/api/identity/otp/send', { phone: '13800000003' });
    const verify = await post('/api/identity/verify', {
      phone: '13800000003',
      otp: String(send.data.mock_otp),
    });
    expect(verify.status).toBe(200);
    expect(verify.data.verified).toBe(true);
  });

  test('login events endpoint returns latest account state', async () => {
    const { status, data } = await get('/api/identity/accounts/13800000003/login-events');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.events as unknown[]).length).toBeGreaterThan(0);
    expect((data.latest_state as Record<string, unknown>).result).toBeDefined();
  });

  test('risk lookup returns high risk for suspicious account', async () => {
    const { status, data } = await get('/api/risk/accounts/13800000003');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.risk_level).toBe('high');
  });
});

describe('customer APIs', () => {
  test('subscriber profile returns plan and preferences', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.subscriber as Record<string, unknown>).msisdn).toBe('13800000001');
    expect(((data.subscriber as Record<string, unknown>).plan as Record<string, unknown>).plan_id).toBe('plan_50g');
  });

  test('preferences endpoint returns DND customer state', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000002/preferences');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.preferences as Record<string, unknown>).dnd).toBe(true);
  });

  test('contracts endpoint returns active contract list', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000001/contracts');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.contracts as unknown[]).length).toBeGreaterThan(0);
  });

  test('household endpoint returns family members for shared account', async () => {
    const { status, data } = await get('/api/customer/subscribers/13800000002/household');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.members as unknown[]).length).toBeGreaterThan(0);
  });

  test('subscription history includes lifecycle fields', async () => {
    const { status, data } = await get('/api/customer/subscribers/13900000006/subscription-history');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const [first] = data.subscription_history as Array<Record<string, unknown>>;
    expect(first?.subscribed_at).toBeDefined();
    expect(first?.channel).toBeDefined();
  });
});

describe('billing APIs', () => {
  test('list bills for subscriber', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.bills as unknown[]).length).toBeGreaterThan(0);
  });

  test('bill items endpoint returns structured items', async () => {
    const { status, data } = await get(`/api/billing/accounts/13800000001/bills/${currentMonth()}/items`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.items as unknown[]).length).toBeGreaterThan(0);
  });

  test('payments endpoint returns payment history', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000002/payments');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.payments as unknown[]).length).toBeGreaterThan(0);
  });

  test('anomaly analysis returns computed diff', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', { msisdn: '13800000001', month: currentMonth() });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.diff).toBe('number');
  });

  test('billing disputes endpoint returns seeded disputes', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/disputes');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.disputes as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('catalog, offers, orders, and payments APIs', () => {
  test('plan catalog returns seeded plans', async () => {
    const { status, data } = await get('/api/catalog/plans');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.plans as unknown[]).length).toBeGreaterThan(0);
  });

  test('eligible offers returns upgrade campaign for heavy 50G user', async () => {
    const { status, data } = await get('/api/offers/eligible?msisdn=13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.offers as Array<{ campaign_id: string }>).some((offer) => offer.campaign_id === 'CMP-UP-100G')).toBe(true);
  });

  test('eligible offers blocks DND customer', async () => {
    const { status, data } = await get('/api/offers/eligible?msisdn=13800000002');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.reason).toBe('customer_in_dnd');
  });

  test('service cancel creates order and order can be queried', async () => {
    const create = await post('/api/orders/service-cancel', {
      phone: '13800000001',
      service_id: 'video_pkg',
      reason: 'customer_requested_cancel',
    });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    const orderId = String(create.data.order_id);
    expect(orderId).toMatch(/^ORD-/);

    const query = await get(`/api/orders/${orderId}`);
    expect(query.status).toBe(200);
    expect(query.data.success).toBe(true);
    expect((query.data.order as Record<string, unknown>).service_id).toBe('video_pkg');
  });

  test('refund request endpoints return seeded refund workflow', async () => {
    const list = await get('/api/orders/refund-requests?msisdn=13800000001');
    expect(list.status).toBe(200);
    expect(list.data.success).toBe(true);
    const [first] = list.data.refund_requests as Array<{ refund_id: string }>;
    expect(first?.refund_id).toBeDefined();

    const detail = await get(`/api/orders/refund-requests/${first.refund_id}`);
    expect(detail.status).toBe(200);
    expect(detail.data.success).toBe(true);
    expect((detail.data.refund_request as Record<string, unknown>).phone).toBe('13800000001');
  });

  test('payment transactions and payment link return arrears context', async () => {
    const transactions = await get('/api/payments/transactions?msisdn=13800000003');
    expect(transactions.status).toBe(200);
    expect(transactions.data.success).toBe(true);
    const first = (transactions.data.transactions as Array<{ payment_id: string }>)[0];
    expect(first?.payment_id).toBeDefined();

    const detail = await get(`/api/payments/transactions/${first.payment_id}`);
    expect(detail.status).toBe(200);
    expect(detail.data.success).toBe(true);

    const link = await post('/api/payments/payment-link', { msisdn: '13800000003' });
    expect(link.status).toBe(200);
    expect(link.data.success).toBe(true);
    expect(String(link.data.payment_link)).toContain('mock-pay.local');
  });
});

describe('invoice and callback APIs', () => {
  test('issue invoice returns invoice number', async () => {
    const { status, data } = await post('/api/invoice/issue', { phone: '13800000001', month: currentMonth(), email: 'test@example.com' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.invoice_no).toBeDefined();
  });

  test('create callback task returns task id', async () => {
    const { status, data } = await post('/api/callback/create', {
      original_task_id: 'TASK-001',
      callback_phone: '13800000001',
      preferred_time: '2026-03-23T15:00:00+08:00',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(String(data.callback_task_id)).toMatch(/^CB-/);
  });
});

describe('network APIs', () => {
  test('incident list supports region filter', async () => {
    const { status, data } = await get('/api/network/incidents?region=广州');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.incidents as Array<{ region: string }>).every((item) => item.region === '广州' || item.region === '全国')).toBe(true);
  });

  test('subscriber diagnostics returns degradation when incidents exist', async () => {
    const { status, data } = await get('/api/network/subscribers/13800000001/diagnostics?issue_type=slow_data');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.network_status).toBe('degraded');
  });
});

describe('outreach APIs', () => {
  test('record call result', async () => {
    const { status, data } = await post('/api/outreach/calls/result', {
      phone: '13800000003',
      result: 'callback',
      callback_time: '2026-03-23T15:00:00+08:00',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.next_action).toBe('建议创建回拨任务');
  });

  test('quiet-hours SMS is blocked', async () => {
    const { status, data } = await post('/api/outreach/sms/send', {
      phone: '13800000001',
      sms_type: 'payment_link',
      context: 'collection',
      send_at: '2026-03-22T22:30:00+08:00',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.reason).toBe('quiet_hours');
  });

  test('create handoff case', async () => {
    const { status, data } = await post('/api/outreach/handoff/create', {
      phone: '13800000002',
      source_skill: 'outbound-marketing',
      reason: 'customer_requested_human',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(String(data.case_id)).toMatch(/^HOF-/);
  });

  test('record marketing result with dnd', async () => {
    const { status, data } = await post('/api/outreach/marketing/result', {
      campaign_id: 'CMP-001',
      phone: '13800000002',
      result: 'dnd',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.is_dnd).toBe(true);
  });
});
