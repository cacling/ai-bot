/**
 * API tests for: Task routes
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

/** Helper: create a work order and return its id */
async function createWorkOrder() {
  const { data } = await post('/api/work-orders', {
    title: 'Task 测试父工单',
    customer_phone: '13800000001',
    work_type: 'followup',
    execution_mode: 'manual',
  });
  return data.id as string;
}

describe('POST /api/tasks', () => {
  test('returns 400 when parent_id is missing', async () => {
    const { status } = await post('/api/tasks', {
      task_type: 'verify',
      title: '测试',
    });
    expect(status).toBe(400);
  });

  test('returns 400 when task_type is missing', async () => {
    const parentId = await createWorkOrder();
    const { status } = await post('/api/tasks', {
      parent_id: parentId,
      title: '测试',
    });
    expect(status).toBe(400);
  });

  test('creates task under work order', async () => {
    const parentId = await createWorkOrder();
    const { status, data } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'verify',
      title: '核对客户资料',
    });
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
  });
});

describe('GET /api/tasks/:id', () => {
  test('returns task with detail and available_actions', async () => {
    const parentId = await createWorkOrder();
    const { data: created } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'collect',
      title: '收集截图',
    });
    const taskId = created.id as string;

    const { status, data } = await get(`/api/tasks/${taskId}`);
    expect(status).toBe(200);
    expect(data.status).toBe('new');
    expect(data.detail).toBeDefined();
    const detail = data.detail as Record<string, unknown>;
    expect(detail.task_type).toBe('collect');
    expect(Array.isArray(data.available_actions)).toBe(true);
  });
});

describe('Task lifecycle: start → complete', () => {
  test('new → in_progress → resolved', async () => {
    const parentId = await createWorkOrder();
    const { data: created } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'verify',
      title: '核实身份',
    });
    const taskId = created.id as string;

    // Start
    const { status: s1 } = await post(`/api/tasks/${taskId}/start`, {});
    expect(s1).toBe(200);
    const { data: started } = await get(`/api/tasks/${taskId}`);
    expect(started.status).toBe('in_progress');

    // Complete
    const { status: s2 } = await post(`/api/tasks/${taskId}/complete`, {});
    expect(s2).toBe(200);
    const { data: completed } = await get(`/api/tasks/${taskId}`);
    expect(completed.status).toBe('resolved');

    // detail should have completed_at
    const detail = completed.detail as Record<string, unknown>;
    expect(detail.completed_at).toBeDefined();
  });
});

describe('Task block/unblock', () => {
  test('new → blocked → in_progress', async () => {
    const parentId = await createWorkOrder();
    const { data: created } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'review',
      title: '等审核',
    });
    const taskId = created.id as string;

    // Block
    const { status: s1 } = await post(`/api/tasks/${taskId}/block`, { reason: '等二线反馈' });
    expect(s1).toBe(200);
    const { data: blocked } = await get(`/api/tasks/${taskId}`);
    expect(blocked.status).toBe('waiting_internal');
    expect(blocked.is_blocked).toBe(1);

    // Unblock
    const { status: s2 } = await post(`/api/tasks/${taskId}/unblock`, {});
    expect(s2).toBe(200);
    const { data: unblocked } = await get(`/api/tasks/${taskId}`);
    expect(unblocked.status).toBe('in_progress');
    expect(unblocked.is_blocked).toBe(0);
  });
});

describe('Task auto-advance parent', () => {
  test('all tasks completed → parent auto-advances from waiting_internal', async () => {
    const parentId = await createWorkOrder();

    // Move parent to waiting_internal
    await post(`/api/work-orders/${parentId}/transition`, { action: 'accept' });
    await post(`/api/work-orders/${parentId}/transition`, { action: 'mark_waiting_internal' });

    // Create two tasks
    const { data: t1 } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'verify',
      title: '核实 A',
    });
    const { data: t2 } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'verify',
      title: '核实 B',
    });

    // Complete first task — parent should still be waiting_internal
    await post(`/api/tasks/${t1.id}/complete`, {});
    const { data: p1 } = await get(`/api/work-orders/${parentId}`);
    expect(p1.status).toBe('waiting_internal');

    // Complete second task — parent should auto-advance to in_progress
    await post(`/api/tasks/${t2.id}/complete`, {});
    const { data: p2 } = await get(`/api/work-orders/${parentId}`);
    expect(p2.status).toBe('in_progress');
  });
});

describe('Task cancel', () => {
  test('cancel task', async () => {
    const parentId = await createWorkOrder();
    const { data: created } = await post('/api/tasks', {
      parent_id: parentId,
      task_type: 'notify',
      title: '发送提醒',
    });
    const taskId = created.id as string;

    const { status } = await post(`/api/tasks/${taskId}/cancel`, {});
    expect(status).toBe(200);

    const { data } = await get(`/api/tasks/${taskId}`);
    expect(data.status).toBe('cancelled');
  });
});
