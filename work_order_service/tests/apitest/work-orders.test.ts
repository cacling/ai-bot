/**
 * API tests for: work-orders routes
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

describe('GET /api/work-orders', () => {
  test('returns a list of work orders', async () => {
    const { status, data } = await get('/api/work-orders');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('POST /api/work-orders', () => {
  test('returns 400 when title is missing', async () => {
    const { status, data } = await post('/api/work-orders', {
      work_type: 'execution',
      execution_mode: 'manual',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('returns 400 when work_type is missing', async () => {
    const { status, data } = await post('/api/work-orders', {
      title: 'Test',
      execution_mode: 'manual',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('creates a work order successfully', async () => {
    const { status, data } = await post('/api/work-orders', {
      title: '测试工单',
      summary: '这是一个测试工单',
      customer_phone: '13800000001',
      work_type: 'execution',
      execution_mode: 'manual',
      priority: 'high',
      queue_code: 'frontline',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
  });
});

describe('POST /api/work-orders/:id/transition', () => {
  test('returns 400 when action is missing', async () => {
    const { data: created } = await post('/api/work-orders', {
      title: '流转测试',
      work_type: 'execution',
      execution_mode: 'manual',
    });
    const { status, data } = await post(`/api/work-orders/${created.id}/transition`, {});
    expect(status).toBe(400);
  });

  test('transitions new → open via accept', async () => {
    const { data: created } = await post('/api/work-orders', {
      title: '流转测试 accept',
      work_type: 'execution',
      execution_mode: 'manual',
    });
    const { status, data } = await post(`/api/work-orders/${created.id}/transition`, {
      action: 'accept',
      actor: 'agent_test',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.from).toBe('new');
    expect(data.to).toBe('open');
  });

  test('rejects invalid transition new → start', async () => {
    const { data: created } = await post('/api/work-orders', {
      title: '流转测试 invalid',
      work_type: 'execution',
      execution_mode: 'manual',
    });
    const { status, data } = await post(`/api/work-orders/${created.id}/transition`, {
      action: 'start',
    });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });
});

describe('GET /api/work-items', () => {
  test('returns items list', async () => {
    const { status, data } = await get('/api/work-items');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
    expect(data.total).toBeDefined();
  });

  test('filters by type', async () => {
    const { status, data } = await get('/api/work-items?type=work_order');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('GET /api/work-items/:id', () => {
  test('returns 404 for non-existent id', async () => {
    const { status } = await get('/api/work-items/non_existent_id');
    expect(status).toBe(404);
  });

  test('returns aggregated detail for existing item', async () => {
    // Create a work order first
    const { data: created } = await post('/api/work-orders', {
      title: '详情测试',
      work_type: 'execution',
      execution_mode: 'manual',
    });
    const { status, data } = await get(`/api/work-items/${created.id}`);
    expect(status).toBe(200);
    expect(data.item).toBeDefined();
    expect(data.events).toBeDefined();
  });
});
