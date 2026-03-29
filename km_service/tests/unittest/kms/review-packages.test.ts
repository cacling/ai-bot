/**
 * review-packages.test.ts — Hono route tests for KM review packages
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import reviewPackages from '../../../src/routes/review-packages';
import candidates from '../../../src/routes/candidates';
import evidence from '../../../src/routes/evidence';

const app = new Hono();
app.route('/review-packages', reviewPackages);
app.route('/candidates', candidates);
app.route('/evidence', evidence);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('review-packages route', () => {
  let pkgId: string;

  test('POST / — create review package', async () => {
    const { status, data } = await req('POST', '/review-packages', {
      title: 'Test Review Package',
      risk_level: 'medium',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    pkgId = data.id as string;
  });

  test('POST / — empty title returns 400', async () => {
    const { status } = await req('POST', '/review-packages', { title: '' });
    expect(status).toBe(400);
  });

  test('POST / — missing title returns 400', async () => {
    const { status } = await req('POST', '/review-packages', { risk_level: 'low' });
    expect(status).toBe(400);
  });

  test('GET / — list review packages', async () => {
    const { status, data } = await req('GET', '/review-packages');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/review-packages?status=draft');
    expect(status).toBe(200);
  });

  test('GET / — pagination', async () => {
    const { status, data } = await req('GET', '/review-packages?page=1&size=10');
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.size).toBe(10);
  });

  test('GET /:id — detail', async () => {
    const { status, data } = await req('GET', `/review-packages/${pkgId}`);
    expect(status).toBe(200);
    expect(data.title).toBe('Test Review Package');
    expect(data.candidates).toBeDefined();
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/review-packages/nonexistent');
    expect(status).toBe(404);
  });

  test('POST /:id/submit — empty package returns 400', async () => {
    const { status, data } = await req('POST', `/review-packages/${pkgId}/submit`, {});
    expect(status).toBe(400);
    expect((data.error as string)).toContain('没有候选');
  });

  test('POST /:id/submit — nonexistent returns 404', async () => {
    const { status } = await req('POST', '/review-packages/nonexistent/submit', {});
    expect(status).toBe(404);
  });

  test('POST /:id/approve — approve package', async () => {
    const { status, data } = await req('POST', `/review-packages/${pkgId}/approve`, {
      approved_by: 'reviewer',
    });
    expect(status).toBe(200);
    expect(data.status).toBe('approved');
  });

  test('POST /:id/reject — reject package', async () => {
    // Create a new package to reject
    const { data: newPkg } = await req('POST', '/review-packages', {
      title: 'To Reject',
    });
    const { status, data } = await req('POST', `/review-packages/${newPkg.id}/reject`, {
      rejected_by: 'reviewer', reason: 'not ready',
    });
    expect(status).toBe(200);
    expect(data.status).toBe('rejected');
  });

  test('full submit workflow with passing gates', async () => {
    // Create candidate with parsing source (auto pass ownership)
    const { data: cand } = await req('POST', '/candidates', {
      source_type: 'parsing', normalized_q: 'review pkg test q',
    });
    // Add evidence
    const { data: ev } = await req('POST', '/evidence', { candidate_id: cand.id });
    await req('PUT', `/evidence/${ev.id}`, { status: 'pass', reviewed_by: 'r' });
    // Gate check
    await req('POST', `/candidates/${cand.id}/gate-check`);

    // Create review package with this candidate
    const { data: pkg } = await req('POST', '/review-packages', {
      title: 'Full Submit Test',
      candidate_ids: [cand.id],
    });

    // Submit
    const { status, data } = await req('POST', `/review-packages/${pkg.id}/submit`, {
      submitted_by: 'op',
    });
    expect(status).toBe(200);
    expect(data.status).toBe('submitted');
  });
});
