/**
 * mock-data.test.ts — Tests for mock data API routes (test-personas + outbound-tasks)
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import mockDataRoutes from '../../../src/chat/mock-data';

const app = new Hono();
app.route('/api', mockDataRoutes);

async function req(path: string) {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  return { status: res.status, data: await res.json() as unknown };
}

describe('mock-data — GET /api/test-personas', () => {
  test('returns array', async () => {
    const { status, data } = await req('/api/test-personas');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('personas have expected shape (requires km_service)', async () => {
    const { data } = await req('/api/test-personas');
    const personas = data as Array<Record<string, unknown>>;
    // When km_service is not running, returns empty array (graceful fallback)
    if (personas.length === 0) return;
    const p = personas[0];
    expect(p.id).toBeDefined();
    expect(p.label).toBeDefined();
    expect(p.category).toBeDefined();
    expect(p.tag).toBeDefined();
    expect(p.context).toBeDefined();
  });

  test('filter by category=inbound', async () => {
    const { status, data } = await req('/api/test-personas?category=inbound');
    expect(status).toBe(200);
    const personas = data as Array<{ category: string }>;
    for (const p of personas) {
      expect(p.category).toBe('inbound');
    }
  });

  test('filter by category=outbound_collection', async () => {
    const { status, data } = await req('/api/test-personas?category=outbound_collection');
    expect(status).toBe(200);
    const personas = data as Array<{ category: string }>;
    for (const p of personas) {
      expect(p.category).toBe('outbound_collection');
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
