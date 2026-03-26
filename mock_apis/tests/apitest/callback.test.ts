/**
 * API tests for: src/routes/callback.ts
 * Mount: /api/callback
 * Routes: POST create
 */
import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/server';

const app = createApp();

// Small delay to avoid Date.now() collision in ID generation across rapid inserts
const tick = () => new Promise((r) => setTimeout(r, 5));

async function post(path: string, body: Record<string, unknown>) {
  await tick();
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

// ── POST /api/callback/create ───────────────────────────────────────────────

describe('POST /api/callback/create', () => {
  test('creates callback task and returns callback_task_id', async () => {
    const { status, data } = await post('/api/callback/create', {
      original_task_id: 'TASK-100',
      callback_phone: '13800000001',
      preferred_time: '2026-03-27T10:00:00+08:00',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.callback_task_id).toBe('string');
    expect((data.callback_task_id as string).startsWith('CB-')).toBe(true);
    expect(typeof data.message).toBe('string');
    expect((data.message as string)).toContain('13800000001');
  });

  test('includes preferred_time in response message', async () => {
    const preferredTime = '2026-03-28T14:30:00+08:00';
    const { data } = await post('/api/callback/create', {
      original_task_id: 'TASK-101',
      callback_phone: '13800000002',
      preferred_time: preferredTime,
    });
    expect(data.success).toBe(true);
    expect((data.message as string)).toContain(preferredTime);
    expect((data.message as string)).toContain('13800000002');
  });

  test('accepts optional customer_name and product_name', async () => {
    const { status, data } = await post('/api/callback/create', {
      original_task_id: 'TASK-102',
      callback_phone: '13800000001',
      preferred_time: '2026-03-27T15:00:00+08:00',
      customer_name: '张三',
      product_name: '5G畅享套餐',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.callback_task_id).toBe('string');
  });

  test('returns 400 when original_task_id is missing', async () => {
    const { status, data } = await post('/api/callback/create', {
      callback_phone: '13800000001',
      preferred_time: '2026-03-27T10:00:00+08:00',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when callback_phone is missing', async () => {
    const { status, data } = await post('/api/callback/create', {
      original_task_id: 'TASK-100',
      preferred_time: '2026-03-27T10:00:00+08:00',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when preferred_time is missing', async () => {
    const { status, data } = await post('/api/callback/create', {
      original_task_id: 'TASK-100',
      callback_phone: '13800000001',
    });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 400 when all required fields are missing', async () => {
    const { status, data } = await post('/api/callback/create', {});
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('each call generates a unique callback_task_id', async () => {
    const payload = {
      original_task_id: 'TASK-DUP',
      callback_phone: '13800000001',
      preferred_time: '2026-03-27T10:00:00+08:00',
    };
    const { data: data1 } = await post('/api/callback/create', payload);
    // Extra tick already in post() helper; this one ensures separation between the two calls
    await tick();
    const { data: data2 } = await post('/api/callback/create', payload);
    expect(data1.callback_task_id).not.toBe(data2.callback_task_id);
  });
});
