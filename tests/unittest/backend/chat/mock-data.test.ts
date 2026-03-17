/**
 * mock-data.test.ts — Tests for mock data API routes
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import mockDataRoutes from '../../../../backend/src/chat/mock-data';

const app = new Hono();
app.route('/api', mockDataRoutes);

async function req(path: string) {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  return { status: res.status, data: await res.json() as unknown };
}

describe('mock-data — GET /api/mock-users', () => {
  test('returns array of users', async () => {
    const { status, data } = await req('/api/mock-users');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('users have expected shape', async () => {
    const { data } = await req('/api/mock-users');
    const users = data as Array<Record<string, unknown>>;
    if (users.length > 0) {
      const user = users[0];
      expect(user.id).toBeDefined();
      expect(user.phone).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.plan).toBeDefined();
      expect(user.status).toBeDefined();
      expect(user.type).toBeDefined();
      // plan should be { zh, en }
      const plan = user.plan as Record<string, string>;
      expect(plan.zh).toBeDefined();
      expect(plan.en).toBeDefined();
    }
  });

  test('filter by type=inbound', async () => {
    const { status, data } = await req('/api/mock-users?type=inbound');
    expect(status).toBe(200);
    const users = data as Array<{ type: string }>;
    for (const u of users) {
      expect(u.type).toBe('inbound');
    }
  });

  test('filter by type=outbound', async () => {
    const { status, data } = await req('/api/mock-users?type=outbound');
    expect(status).toBe(200);
    const users = data as Array<{ type: string }>;
    for (const u of users) {
      expect(u.type).toBe('outbound');
    }
  });
});

describe('mock-data — GET /api/outbound-tasks', () => {
  test('returns array of tasks', async () => {
    const { status, data } = await req('/api/outbound-tasks');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('tasks have expected shape', async () => {
    const { data } = await req('/api/outbound-tasks');
    const tasks = data as Array<Record<string, unknown>>;
    if (tasks.length > 0) {
      const task = tasks[0];
      expect(task.id).toBeDefined();
      expect(task.phone).toBeDefined();
      expect(task.task_type).toBeDefined();
      expect(task.label).toBeDefined();
      expect(task.data).toBeDefined();
      // label should be { zh, en }
      const label = task.label as Record<string, string>;
      expect(label.zh).toBeDefined();
      expect(label.en).toBeDefined();
    }
  });

  test('filter by type', async () => {
    const { status, data } = await req('/api/outbound-tasks?type=collection');
    expect(status).toBe(200);
    const tasks = data as Array<{ task_type: string }>;
    for (const t of tasks) {
      expect(t.task_type).toBe('collection');
    }
  });
});
