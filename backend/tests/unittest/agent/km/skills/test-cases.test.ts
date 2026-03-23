/**
 * test-cases.test.ts — Tests for test case management routes
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import testCaseRoutes from '../../../../../src/agent/km/skills/test-cases';

const app = new Hono();
app.route('/test-cases', testCaseRoutes);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as unknown };
}

describe('test-cases — POST / create', () => {
  let testCaseId: number;

  test('create test case with keywords', async () => {
    const { status, data } = await req('POST', '/test-cases', {
      skill_name: 'test-skill',
      input_message: 'How to check balance?',
      expected_keywords: ['balance', 'check'],
    }) as { status: number; data: { ok: boolean; id: number } };
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.id).toBeDefined();
    testCaseId = data.id;
  });

  test('create test case with assertions', async () => {
    const { status, data } = await req('POST', '/test-cases', {
      skill_name: 'test-skill',
      input_message: 'Cancel my plan',
      assertions: [
        { type: 'contains', value: 'cancel' },
        { type: 'not_contains', value: 'error' },
      ],
    }) as { status: number; data: { ok: boolean; id: number } };
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('missing skill_name returns 400', async () => {
    const { status } = await req('POST', '/test-cases', {
      input_message: 'test',
      expected_keywords: ['a'],
    });
    expect(status).toBe(400);
  });

  test('missing input_message returns 400', async () => {
    const { status } = await req('POST', '/test-cases', {
      skill_name: 'test',
      expected_keywords: ['a'],
    });
    expect(status).toBe(400);
  });

  test('missing both keywords and assertions returns 400', async () => {
    const { status } = await req('POST', '/test-cases', {
      skill_name: 'test',
      input_message: 'test',
    });
    expect(status).toBe(400);
  });

  test('GET / — list all test cases', async () => {
    const { status, data } = await req('GET', '/test-cases');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET / — filter by skill', async () => {
    const { status, data } = await req('GET', '/test-cases?skill=test-skill');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET / — returns parsed JSON fields', async () => {
    const { data } = await req('GET', '/test-cases?skill=test-skill');
    const items = data as Array<{ expected_keywords: unknown; assertions: unknown }>;
    expect(items.length).toBeGreaterThan(0);
    expect(Array.isArray(items[0].expected_keywords)).toBe(true);
  });

  test('PUT /:id — update test case', async () => {
    const { status, data } = await req('PUT', `/test-cases/${testCaseId}`, {
      input_message: 'Updated message',
    }) as { status: number; data: { ok: boolean } };
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('PUT /:id — empty update returns 400', async () => {
    const { status } = await req('PUT', `/test-cases/${testCaseId}`, {});
    expect(status).toBe(400);
  });

  test('DELETE /:id — delete test case', async () => {
    const { status, data } = await req('DELETE', `/test-cases/${testCaseId}`) as { status: number; data: { ok: boolean } };
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

describe('test-cases — POST /batch', () => {
  test('batch create test cases', async () => {
    const { status, data } = await req('POST', '/test-cases/batch', {
      skill_name: 'batch-skill',
      cases: [
        { input: 'Test 1', assertions: [{ type: 'contains', value: 'result' }] },
        { input: 'Test 2', assertions: [{ type: 'contains', value: 'ok' }] },
      ],
    }) as { status: number; data: { ok: boolean; count: number; ids: number[] } };
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.count).toBe(2);
    expect(data.ids.length).toBe(2);
  });

  test('missing skill_name returns 400', async () => {
    const { status } = await req('POST', '/test-cases/batch', {
      cases: [{ input: 'Test', assertions: [] }],
    });
    expect(status).toBe(400);
  });

  test('empty cases returns 400', async () => {
    const { status } = await req('POST', '/test-cases/batch', {
      skill_name: 'test',
      cases: [],
    });
    expect(status).toBe(400);
  });

  test('missing cases returns 400', async () => {
    const { status } = await req('POST', '/test-cases/batch', {
      skill_name: 'test',
    });
    expect(status).toBe(400);
  });
});
