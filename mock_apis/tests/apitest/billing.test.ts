/**
 * API tests for: src/routes/billing.ts
 * Mount: /api/billing
 * Routes: GET accounts/:msisdn/bills, GET bills/:month, GET bills/:month/items, GET payments, POST anomaly/analyze, GET disputes
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function get(path: string) {
  const res = await app.request(path);
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// ── GET /api/billing/accounts/:msisdn/bills ─────────────────────────────────

describe('GET /api/billing/accounts/:msisdn/bills', () => {
  test('returns recent bills for existing phone (default limit 6)', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(Array.isArray(data.bills)).toBe(true);
    expect((data.bills as unknown[]).length).toBeGreaterThan(0);
    expect((data.bills as unknown[]).length).toBeLessThanOrEqual(6);
    // Each bill should have items
    const bill = (data.bills as Record<string, unknown>[])[0];
    expect(bill).toHaveProperty('month');
    expect(bill).toHaveProperty('total');
    expect(Array.isArray(bill.items)).toBe(true);
  });

  test('respects limit query param', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills?limit=2');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.bills as unknown[]).length).toBeLessThanOrEqual(2);
  });

  test('returns bills sorted descending by month', async () => {
    const { data } = await get('/api/billing/accounts/13800000001/bills');
    const bills = data.bills as Record<string, unknown>[];
    if (bills.length >= 2) {
      expect(String(bills[0].month).localeCompare(String(bills[1].month))).toBeGreaterThanOrEqual(0);
    }
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/billing/accounts/19900000099/bills');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// ── GET /api/billing/accounts/:msisdn/bills/:month ──────────────────────────

describe('GET /api/billing/accounts/:msisdn/bills/:month', () => {
  test('returns specific month bill with items', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills/2026-01');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.month).toBe('2026-01');
    const bill = data.bill as Record<string, unknown>;
    expect(bill).toHaveProperty('total');
    expect(Array.isArray(bill.items)).toBe(true);
  });

  test('returns 404 when no bill for that month', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills/2020-01');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// ── GET /api/billing/accounts/:msisdn/bills/:month/items ────────────────────

describe('GET /api/billing/accounts/:msisdn/bills/:month/items', () => {
  test('returns bill line items for month', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills/2026-01/items');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.month).toBe('2026-01');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.items)).toBe(true);
    const items = data.items as Record<string, unknown>[];
    expect(items.length).toBeGreaterThan(0);
    // Each item should have standard fields
    const item = items[0];
    expect(item).toHaveProperty('item_type');
    expect(item).toHaveProperty('amount');
  });

  test('returns 404 for non-existent month', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/bills/2020-01/items');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// ── GET /api/billing/accounts/:msisdn/payments ──────────────────────────────

describe('GET /api/billing/accounts/:msisdn/payments', () => {
  test('returns payment history for existing phone', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/payments');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(Array.isArray(data.payments)).toBe(true);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/billing/accounts/19900000099/payments');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// ── POST /api/billing/anomaly/analyze ───────────────────────────────────────

describe('POST /api/billing/anomaly/analyze', () => {
  test('returns anomaly analysis with diff/change_ratio/primary_cause', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', {
      msisdn: '13800000001',
      month: '2026-02',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.month).toBe('2026-02');
    expect(data).toHaveProperty('diff');
    expect(data).toHaveProperty('change_ratio');
    expect(data).toHaveProperty('primary_cause');
    expect(data).toHaveProperty('current_total');
    expect(data).toHaveProperty('previous_total');
    expect(data).toHaveProperty('previous_month');
    expect(data.previous_month).toBe('2026-01');
    expect(data).toHaveProperty('causes');
    expect(Array.isArray(data.causes)).toBe(true);
    expect(data).toHaveProperty('summary');
    expect(typeof data.summary).toBe('string');
  });

  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', { month: '2026-02' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when month is missing', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', { msisdn: '13800000001' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 when bill does not exist for given month', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', {
      msisdn: '13800000001',
      month: '2020-01',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('handles first month with no previous bill gracefully', async () => {
    const { status, data } = await post('/api/billing/anomaly/analyze', {
      msisdn: '13800000001',
      month: '2026-01',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // previous_total should be 0 when no previous month exists
    expect(typeof data.previous_total).toBe('number');
  });
});

// ── GET /api/billing/accounts/:msisdn/disputes ──────────────────────────────

describe('GET /api/billing/accounts/:msisdn/disputes', () => {
  test('returns dispute cases list for existing phone', async () => {
    const { status, data } = await get('/api/billing/accounts/13800000001/disputes');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(typeof data.count).toBe('number');
    expect(Array.isArray(data.disputes)).toBe(true);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/billing/accounts/19900000099/disputes');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
