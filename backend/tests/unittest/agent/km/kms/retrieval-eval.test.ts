/**
 * retrieval-eval.test.ts — Hono route tests for retrieval evaluation
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../../../../../src/db';
import { kmRetrievalEvalCases } from '../../../../../src/db/schema';
import { eq } from 'drizzle-orm';
import retrievalEval from '../../../../../src/agent/km/kms/retrieval-eval';

const app = new Hono();
app.route('/retrieval-eval', retrievalEval);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('retrieval-eval route', () => {
  test('POST /search — returns results', async () => {
    const { status, data } = await req('POST', '/retrieval-eval/search', { query: '查询话费', top_k: 3 });
    expect(status).toBe(200);
    expect(Array.isArray(data.results)).toBe(true);
  });

  test('POST /search — rejects empty query', async () => {
    const { status } = await req('POST', '/retrieval-eval/search', { query: '' });
    expect(status).toBe(400);
  });

  let caseId: string;

  test('POST /cases — create eval case', async () => {
    const { status, data } = await req('POST', '/retrieval-eval/cases', {
      input_text: '我要查话费',
      input_kind: 'user_message',
      expected_asset_ids: ['asset-1'],
      actual_asset_ids: ['asset-2'],
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    caseId = data.id as string;
  });

  test('GET /cases — list eval cases', async () => {
    const { status, data } = await req('GET', '/retrieval-eval/cases');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET /cases — pagination', async () => {
    const { status, data } = await req('GET', '/retrieval-eval/cases?page=1&size=5');
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.size).toBe(5);
  });

  test('PUT /cases/:id — update eval result', async () => {
    const { status, data } = await req('PUT', `/retrieval-eval/cases/${caseId}`, {
      citation_ok: 1,
      answer_ok: 0,
      reviewer: 'tester',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify in DB
    const [row] = await db.select().from(kmRetrievalEvalCases).where(eq(kmRetrievalEvalCases.id, caseId)).limit(1);
    expect(row.citation_ok).toBe(1);
    expect(row.answer_ok).toBe(0);
    expect(row.reviewer).toBe('tester');
  });

  test('PUT /cases/:id — rejects empty update', async () => {
    const { status } = await req('PUT', `/retrieval-eval/cases/${caseId}`, {});
    expect(status).toBe(400);
  });

  test('POST /cases — rejects missing input_text', async () => {
    const { status } = await req('POST', '/retrieval-eval/cases', { input_kind: 'user_message' });
    expect(status).toBe(400);
  });
});
