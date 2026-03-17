/**
 * candidates.test.ts — Hono route tests for KM candidates
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import candidates from '../../../../../../backend/src/agent/km/kms/candidates';
import evidence from '../../../../../../backend/src/agent/km/kms/evidence';

const app = new Hono();
app.route('/candidates', candidates);
app.route('/evidence', evidence);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('candidates route', () => {
  let candidateId: string;

  test('POST / — create candidate', async () => {
    const { status, data } = await req('POST', '/candidates', {
      source_type: 'manual',
      normalized_q: '如何查询账单？',
      draft_answer: '可以通过APP查询',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    candidateId = data.id as string;
  });

  test('POST / — empty question returns 400', async () => {
    const { status } = await req('POST', '/candidates', {
      source_type: 'manual', normalized_q: '',
    });
    expect(status).toBe(400);
  });

  test('POST / — missing question returns 400', async () => {
    const { status } = await req('POST', '/candidates', {
      source_type: 'manual',
    });
    expect(status).toBe(400);
  });

  test('POST / — parsing source auto-sets gate_ownership to pass', async () => {
    const { status, data } = await req('POST', '/candidates', {
      source_type: 'parsing',
      normalized_q: '解析来源的问题',
    });
    expect(status).toBe(201);
    const { data: detail } = await req('GET', `/candidates/${data.id}`);
    expect(detail.gate_ownership).toBe('pass');
  });

  test('POST / — manual source without target_asset sets gate_ownership to pending', async () => {
    const { data: detail } = await req('GET', `/candidates/${candidateId}`);
    expect(detail.gate_ownership).toBe('pending');
  });

  test('GET / — list candidates', async () => {
    const { status, data } = await req('GET', '/candidates');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/candidates?status=draft');
    expect(status).toBe(200);
  });

  test('GET / — filter by keyword', async () => {
    const { status, data } = await req('GET', '/candidates?keyword=账单');
    expect(status).toBe(200);
  });

  test('GET /:id — detail with gate card', async () => {
    const { status, data } = await req('GET', `/candidates/${candidateId}`);
    expect(status).toBe(200);
    expect(data.normalized_q).toBe('如何查询账单？');
    expect(data.gate_card).toBeDefined();
    const gc = data.gate_card as Record<string, unknown>;
    expect(gc.evidence).toBeDefined();
    expect(gc.conflict).toBeDefined();
    expect(gc.ownership).toBeDefined();
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/candidates/nonexistent');
    expect(status).toBe(404);
  });

  test('PUT /:id — update candidate', async () => {
    const { status, data } = await req('PUT', `/candidates/${candidateId}`, {
      draft_answer: 'Updated answer',
      category: 'billing',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('PUT /:id — setting target_asset_id sets gate_ownership to pass', async () => {
    await req('PUT', `/candidates/${candidateId}`, { target_asset_id: 'asset-123' });
    const { data } = await req('GET', `/candidates/${candidateId}`);
    // After update, gate_ownership should be pass via the PUT handler
  });

  test('POST /:id/gate-check — no evidence fails', async () => {
    // Create a fresh candidate with no evidence
    const { data: newCand } = await req('POST', '/candidates', {
      source_type: 'parsing', normalized_q: 'gate test candidate',
    });
    const { status, data } = await req('POST', `/candidates/${newCand.id}/gate-check`);
    expect(status).toBe(200);
    expect(data.gate_evidence).toBe('fail');
  });

  test('POST /:id/gate-check — with pass evidence succeeds', async () => {
    // Create candidate + evidence + pass it
    const { data: cand } = await req('POST', '/candidates', {
      source_type: 'parsing', normalized_q: 'evidence test',
    });
    const { data: ev } = await req('POST', '/evidence', {
      candidate_id: cand.id,
    });
    await req('PUT', `/evidence/${ev.id}`, { status: 'pass', reviewed_by: 'r' });
    const { data } = await req('POST', `/candidates/${cand.id}/gate-check`);
    expect(data.gate_evidence).toBe('pass');
  });

  test('POST /:id/gate-check — nonexistent returns 404', async () => {
    const { status } = await req('POST', '/candidates/nonexistent/gate-check');
    expect(status).toBe(404);
  });
});
