/**
 * API tests for: src/routes/invoice.ts
 * Mount: /api/invoice
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

async function post(path: string, body: Record<string, unknown>) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

/** Compute current month as YYYY-MM (matches seed's m0). */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

describe('POST /api/invoice/issue', () => {
  test('returns 400 when phone is missing', async () => {
    const { status, data } = await post('/api/invoice/issue', { month: '2025-01', email: 'a@b.com' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when month is missing', async () => {
    const { status, data } = await post('/api/invoice/issue', { phone: '13800000001', email: 'a@b.com' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when email is missing', async () => {
    const { status, data } = await post('/api/invoice/issue', { phone: '13800000001', month: '2025-01' });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for non-existent phone', async () => {
    const { status, data } = await post('/api/invoice/issue', {
      phone: '19900000099',
      month: currentMonth(),
      email: 'test@example.com',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('returns 404 when bill not found for month', async () => {
    const { status, data } = await post('/api/invoice/issue', {
      phone: '13800000001',
      month: '2020-01',
      email: 'test@example.com',
    });
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('issues invoice successfully and returns invoice_no', async () => {
    const month = currentMonth();
    const { status, data } = await post('/api/invoice/issue', {
      phone: '13800000001',
      month,
      email: 'zhangsan@example.com',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.invoice_no).toBeDefined();
    expect(typeof data.invoice_no).toBe('string');
    expect((data.invoice_no as string).startsWith('INV-')).toBe(true);
    expect(data.phone).toBe('13800000001');
    expect(data.month).toBe(month);
    expect(typeof data.total).toBe('number');
    expect(data.status).toBe('已发送');
    // email should be masked
    expect(typeof data.email).toBe('string');
    expect((data.email as string)).toContain('*');
    expect(data.message).toBeDefined();
  });

  test('invoice total matches bill total', async () => {
    const month = currentMonth();
    const { data } = await post('/api/invoice/issue', {
      phone: '13800000001',
      month,
      email: 'zhangsan@example.com',
    });
    // 13800000001 m0 bill total is 88.0
    expect(data.total).toBe(88);
  });
});
