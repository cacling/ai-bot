/**
 * API tests for: src/routes/payments.ts
 * Mount: /api/payments
 * Routes: GET transactions, GET transactions/:paymentId, POST payment-link
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

describe('GET /api/payments/transactions', () => {
  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await get('/api/payments/transactions');
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await get('/api/payments/transactions?msisdn=19900000099');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns transactions for 13800000001', async () => {
    const { status, data } = await get('/api/payments/transactions?msisdn=13800000001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000001');
    expect(data.count).toBeGreaterThanOrEqual(2); // PAY-1001, PAY-1002
    const txns = data.transactions as Array<Record<string, unknown>>;
    expect(txns.length).toBeGreaterThanOrEqual(2);
    for (const txn of txns) {
      expect(txn.phone).toBe('13800000001');
    }
  });

  test('returns transactions for 13800000003', async () => {
    const { status, data } = await get('/api/payments/transactions?msisdn=13800000003');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(1); // PAY-3001
  });
});

describe('GET /api/payments/transactions/:paymentId', () => {
  test('returns transaction detail for existing payment', async () => {
    const { status, data } = await get('/api/payments/transactions/PAY-1001');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const txn = data.transaction as Record<string, unknown>;
    expect(txn.payment_id).toBe('PAY-1001');
    expect(txn.phone).toBe('13800000001');
    expect(txn.amount).toBe(88);
    expect(txn.channel).toBe('app');
    expect(txn.status).toBe('success');
  });

  test('returns failed transaction detail', async () => {
    const { status, data } = await get('/api/payments/transactions/PAY-3001');
    expect(status).toBe(200);
    const txn = data.transaction as Record<string, unknown>;
    expect(txn.payment_id).toBe('PAY-3001');
    expect(txn.status).toBe('failed');
  });

  test('returns 404 for non-existent payment', async () => {
    const { status, data } = await get('/api/payments/transactions/PAY-NONEXIST');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

describe('POST /api/payments/payment-link', () => {
  test('returns 400 when msisdn is missing', async () => {
    const { status, data } = await post('/api/payments/payment-link', { amount: 50 });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/payments/payment-link', { msisdn: '19900000099' });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('generates payment link for subscriber with negative balance (13800000003)', async () => {
    // 王五: balance=-23.5, so amount_due=23.5
    const { status, data } = await post('/api/payments/payment-link', { msisdn: '13800000003' });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.msisdn).toBe('13800000003');
    expect(data.amount_due).toBe(23.5);
    expect(data.payment_link).toBe('https://mock-pay.local/pay/13800000003/23.50');
    expect(data.expires_at).toBeTruthy();
  });

  test('generates payment link with explicit amount', async () => {
    const { status, data } = await post('/api/payments/payment-link', { msisdn: '13800000003', amount: 100 });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.amount_due).toBe(100);
    expect(data.payment_link).toBe('https://mock-pay.local/pay/13800000003/100.00');
  });

  test('returns no link when amount_due is 0 (positive balance)', async () => {
    // 张三: balance=45.8, no amount specified → amount_due=0
    const { status, data } = await post('/api/payments/payment-link', { msisdn: '13800000001' });
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.amount_due).toBe(0);
    expect(data.payment_link).toBeNull();
    expect(data.expires_at).toBeNull();
  });
});
