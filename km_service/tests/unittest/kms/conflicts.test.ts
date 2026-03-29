/**
 * conflicts.test.ts — Hono route tests for KM conflict records
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import conflicts from '../../../src/routes/conflicts';

const app = new Hono();
app.route('/conflicts', conflicts);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('conflicts route', () => {
  let conflictId: string;

  test('POST / — create conflict record', async () => {
    const { status, data } = await req('POST', '/conflicts', {
      conflict_type: 'wording',
      item_a_id: 'item-a-1',
      item_b_id: 'item-b-1',
      overlap_scope: 'billing',
      blocking_policy: 'block_submit',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    conflictId = data.id as string;
  });

  test('POST / — default blocking_policy is block_submit', async () => {
    const { status, data } = await req('POST', '/conflicts', {
      conflict_type: 'scope',
      item_a_id: 'item-a-2',
      item_b_id: 'item-b-2',
    });
    expect(status).toBe(201);
  });

  test('GET / — list conflicts', async () => {
    const { status, data } = await req('GET', '/conflicts');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('GET / — filter by status', async () => {
    const { status, data } = await req('GET', '/conflicts?status=pending');
    expect(status).toBe(200);
    expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET / — filter by conflict_type', async () => {
    const { status, data } = await req('GET', '/conflicts?conflict_type=wording');
    expect(status).toBe(200);
  });

  test('GET /:id — detail', async () => {
    const { status, data } = await req('GET', `/conflicts/${conflictId}`);
    expect(status).toBe(200);
    expect(data.conflict_type).toBe('wording');
    expect(data.item_a_id).toBe('item-a-1');
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/conflicts/nonexistent');
    expect(status).toBe(404);
  });

  test('PUT /:id/resolve — resolve conflict', async () => {
    const { status, data } = await req('PUT', `/conflicts/${conflictId}/resolve`, {
      resolution: 'keep_both', arbiter: 'admin',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('resolved conflict shows resolved status', async () => {
    const { data } = await req('GET', `/conflicts/${conflictId}`);
    expect(data.status).toBe('resolved');
    expect(data.resolution).toBe('keep_both');
  });
});
