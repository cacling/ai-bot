/**
 * API tests for: template instantiation + detail row completeness
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

describe('GET /api/templates', () => {
  test('returns template list', async () => {
    const { status, data } = await get('/api/templates');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('POST /api/templates/:id/instantiate', () => {
  test('returns 400 for non-existent template', async () => {
    const { status, data } = await post('/api/templates/non_existent/instantiate', {});
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('creates work_order with detail row from callback template', async () => {
    const { status, data } = await post('/api/templates/tpl_callback_followup/instantiate', {
      customer_phone: '13800000001',
      customer_name: '测试用户',
      work_type: 'followup',
      execution_mode: 'manual',
      verification_mode: 'customer_confirm',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);

    const id = data.id as string;

    // Verify work_items row exists
    const { data: detail } = await get(`/api/work-items/${id}`);
    expect(detail.item).toBeDefined();
    const item = detail.item as Record<string, unknown>;
    expect(item.type).toBe('work_order');
    expect(item.subtype).toBe('callback');

    // Verify work_orders detail row was created (not null)
    expect(detail.detail).not.toBeNull();
    const woDetail = detail.detail as Record<string, unknown>;
    expect(woDetail.work_type).toBe('followup');
    expect(woDetail.execution_mode).toBe('manual');
    expect(woDetail.verification_mode).toBe('customer_confirm');
  });

  test('created work_order appears in GET /api/work-orders list (inner join)', async () => {
    const { data: created } = await post('/api/templates/tpl_manual_unlock/instantiate', {
      customer_phone: '13800000002',
      work_type: 'execution',
    });
    const id = created.id as string;

    const { data: list } = await get('/api/work-orders');
    const items = list.items as Array<Record<string, unknown>>;
    const found = items.find(i => i.id === id);
    // Should be found because detail row exists → inner join succeeds
    expect(found).toBeDefined();
  });
});
