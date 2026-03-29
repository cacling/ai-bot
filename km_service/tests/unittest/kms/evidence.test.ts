/**
 * evidence.test.ts — Hono route tests for KM evidence refs
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import evidence from '../../../src/routes/evidence';

const app = new Hono();
app.route('/evidence', evidence);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('evidence route', () => {
  let evidenceId: string;

  test('POST / — create evidence ref', async () => {
    const { status, data } = await req('POST', '/evidence', {
      candidate_id: 'cand-ev-test-1',
      doc_version_id: 'ver-1',
      locator: 'Chapter 1',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    evidenceId = data.id as string;
  });

  test('POST / — create with asset_id', async () => {
    const { status, data } = await req('POST', '/evidence', {
      asset_id: 'asset-ev-test-1',
      rule_version: 'v2',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
  });

  test('GET / — list all evidence', async () => {
    const { status, data } = await req('GET', '/evidence');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('GET / — filter by candidate_id', async () => {
    const { status, data } = await req('GET', '/evidence?candidate_id=cand-ev-test-1');
    expect(status).toBe(200);
    const items = data.items as unknown[];
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/evidence?status=pending');
    expect(status).toBe(200);
  });

  test('PUT /:id — approve evidence (pass)', async () => {
    const { status, data } = await req('PUT', `/evidence/${evidenceId}`, {
      status: 'pass', reviewed_by: 'reviewer-1',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('PUT /:id — reject evidence (fail)', async () => {
    // Create another evidence to reject
    const { data: newEv } = await req('POST', '/evidence', {
      candidate_id: 'cand-ev-test-2',
    });
    const { status, data } = await req('PUT', `/evidence/${newEv.id}`, {
      status: 'fail', fail_reason: 'Insufficient reference', reviewed_by: 'reviewer-2',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});
