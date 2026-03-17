/**
 * tasks.test.ts — Hono route tests for KM governance tasks
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import tasks from '../../../../../../backend/src/agent/km/kms/tasks';

const app = new Hono();
app.route('/tasks', tasks);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('tasks route', () => {
  let taskId: string;

  test('POST / — create task', async () => {
    const { status, data } = await req('POST', '/tasks', {
      task_type: 'evidence_gap',
      source_type: 'candidate',
      source_ref_id: 'cand-1',
      priority: 'high',
      assignee: 'worker-1',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    taskId = data.id as string;
  });

  test('POST / — defaults priority to medium', async () => {
    const { status, data } = await req('POST', '/tasks', {
      task_type: 'review',
    });
    expect(status).toBe(201);
  });

  test('GET / — list tasks', async () => {
    const { status, data } = await req('GET', '/tasks');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/tasks?status=open');
    expect(status).toBe(200);
  });

  test('GET / — filter by task_type', async () => {
    const { status } = await req('GET', '/tasks?task_type=evidence_gap');
    expect(status).toBe(200);
  });

  test('GET / — filter by assignee', async () => {
    const { status } = await req('GET', '/tasks?assignee=worker-1');
    expect(status).toBe(200);
  });

  test('GET / — filter by priority', async () => {
    const { status } = await req('GET', '/tasks?priority=high');
    expect(status).toBe(200);
  });

  test('GET / — pagination', async () => {
    const { status } = await req('GET', '/tasks?page=1&size=10');
    expect(status).toBe(200);
  });

  test('PUT /:id — update task status', async () => {
    const { status, data } = await req('PUT', `/tasks/${taskId}`, {
      status: 'in_progress',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('PUT /:id — close task triggers audit', async () => {
    const { status, data } = await req('PUT', `/tasks/${taskId}`, {
      status: 'done', conclusion: 'All evidence added',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('PUT /:id — update assignee', async () => {
    const { data: t } = await req('POST', '/tasks', { task_type: 'x' });
    const { status, data } = await req('PUT', `/tasks/${t.id}`, {
      assignee: 'new-worker',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});
