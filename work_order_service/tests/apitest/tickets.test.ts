/**
 * API tests for: Ticket routes
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

describe('POST /api/tickets', () => {
  test('returns 400 when ticket_category is missing', async () => {
    const { status, data } = await post('/api/tickets', { title: '测试' });
    expect(status).toBe(400);
    expect(data.error).toBeDefined();
  });

  test('creates ticket with detail row', async () => {
    const { status, data } = await post('/api/tickets', {
      title: 'App 登录异常',
      customer_phone: '13800000001',
      ticket_category: 'incident',
      issue_type: 'app_login',
      channel: 'online',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
  });
});

describe('GET /api/tickets', () => {
  test('returns ticket list with detail joined', async () => {
    // Create a ticket first
    await post('/api/tickets', {
      title: '列表测试',
      ticket_category: 'inquiry',
      customer_phone: '13800000010',
    });

    const { status, data } = await get('/api/tickets');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    const items = data.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    // Should have ticket detail fields merged
    const found = items.find(i => i.customer_phone === '13800000010');
    expect(found).toBeDefined();
    expect(found!.ticket_category).toBeDefined();
  });
});

describe('GET /api/tickets/:id', () => {
  test('returns ticket with detail and available_actions', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '详情测试',
      ticket_category: 'complaint',
      customer_phone: '13800000020',
    });
    const id = created.id as string;

    const { status, data } = await get(`/api/tickets/${id}`);
    expect(status).toBe(200);
    expect(data.status).toBe('new');
    expect(data.detail).toBeDefined();
    const detail = data.detail as Record<string, unknown>;
    expect(detail.ticket_category).toBe('complaint');
    expect(Array.isArray(data.available_actions)).toBe(true);
  });
});

describe('POST /api/tickets/:id/transition', () => {
  test('triage: new → open', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '流转测试',
      ticket_category: 'incident',
    });
    const id = created.id as string;

    const { status, data } = await post(`/api/tickets/${id}/transition`, {
      action: 'triage',
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.from).toBe('new');
    expect(data.to).toBe('open');
  });

  test('full lifecycle: new → open → resolved → closed', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '完整生命周期',
      ticket_category: 'inquiry',
    });
    const id = created.id as string;

    await post(`/api/tickets/${id}/transition`, { action: 'triage' });
    await post(`/api/tickets/${id}/transition`, { action: 'resolve', note: '问题已解决' });

    const { data: resolved } = await get(`/api/tickets/${id}`);
    expect(resolved.status).toBe('resolved');

    await post(`/api/tickets/${id}/transition`, { action: 'close' });
    const { data: closed } = await get(`/api/tickets/${id}`);
    expect(closed.status).toBe('closed');
  });

  test('waiting_customer and customer_replied', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '等客户回复',
      ticket_category: 'request',
    });
    const id = created.id as string;

    await post(`/api/tickets/${id}/transition`, { action: 'triage' });
    await post(`/api/tickets/${id}/transition`, { action: 'mark_waiting_customer' });

    const { data: waiting } = await get(`/api/tickets/${id}`);
    expect(waiting.status).toBe('waiting_customer');

    await post(`/api/tickets/${id}/transition`, { action: 'customer_replied' });
    const { data: back } = await get(`/api/tickets/${id}`);
    expect(back.status).toBe('open');
  });

  test('reopen: resolved → open', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '重新打开',
      ticket_category: 'complaint',
    });
    const id = created.id as string;

    await post(`/api/tickets/${id}/transition`, { action: 'triage' });
    await post(`/api/tickets/${id}/transition`, { action: 'resolve' });
    await post(`/api/tickets/${id}/transition`, { action: 'reopen' });

    const { data: reopened } = await get(`/api/tickets/${id}`);
    expect(reopened.status).toBe('open');
  });
});

describe('POST /api/tickets/:id/children', () => {
  test('creates child work_order under ticket', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '客户无法登录',
      ticket_category: 'incident',
      customer_phone: '13800000030',
    });
    const ticketId = created.id as string;

    const { status, data } = await post(`/api/tickets/${ticketId}/children`, {
      type: 'work_order',
      subtype: 'manual_unlock',
      title: '人工解锁处理',
      queue_code: 'specialist',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);

    // Verify via aggregated detail
    const { data: detail } = await get(`/api/work-items/${ticketId}`);
    const childWOs = detail.child_work_orders as Array<Record<string, unknown>>;
    expect(childWOs.length).toBeGreaterThanOrEqual(1);
    const child = childWOs.find(c => c.id === data.id);
    expect(child).toBeDefined();
    expect(child!.type).toBe('work_order');
  });
});

describe('POST /api/tickets/:id/tasks', () => {
  test('creates child task under ticket', async () => {
    const { data: created } = await post('/api/tickets', {
      title: '需要核实资料',
      ticket_category: 'request',
    });
    const ticketId = created.id as string;

    const { status, data } = await post(`/api/tickets/${ticketId}/tasks`, {
      task_type: 'verify',
      title: '核对身份证明材料',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);

    // Verify via aggregated detail
    const { data: detail } = await get(`/api/work-items/${ticketId}`);
    const childTasks = detail.child_tasks as Array<Record<string, unknown>>;
    expect(childTasks.length).toBeGreaterThanOrEqual(1);
  });
});
