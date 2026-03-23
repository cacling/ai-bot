/**
 * action-drafts.test.ts — Hono route tests for KM action drafts
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import actionDrafts from '../../../../../src/agent/km/kms/action-drafts';

const app = new Hono();
app.route('/action-drafts', actionDrafts);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('action-drafts route', () => {
  let draftId: string;

  test('POST / — create action draft', async () => {
    const { status, data } = await req('POST', '/action-drafts', {
      action_type: 'unpublish',
      target_asset_id: 'asset-test-1',
      change_summary: 'test draft',
      created_by: 'tester',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    draftId = data.id as string;
  });

  test('GET / — list action drafts', async () => {
    const { status, data } = await req('GET', '/action-drafts');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/action-drafts?status=draft');
    expect(status).toBe(200);
  });

  test('GET / — filter by action_type', async () => {
    const { status } = await req('GET', '/action-drafts?action_type=unpublish');
    expect(status).toBe(200);
  });

  test('GET / — pagination', async () => {
    const { status, data } = await req('GET', '/action-drafts?page=1&size=5');
    expect(status).toBe(200);
  });

  test('GET /:id — detail', async () => {
    const { status, data } = await req('GET', `/action-drafts/${draftId}`);
    expect(status).toBe(200);
    expect(data.action_type).toBe('unpublish');
    expect(data.target_asset_id).toBe('asset-test-1');
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/action-drafts/nonexistent');
    expect(status).toBe(404);
  });

  test('POST /:id/execute — execute unpublish draft', async () => {
    const { status, data } = await req('POST', `/action-drafts/${draftId}/execute`, {
      executed_by: 'admin',
    });
    expect(status).toBe(200);
    expect(data.status).toBe('done');
    expect(data.regression_window_id).toBeDefined();
  });

  test('POST /:id/execute — cannot re-execute done draft', async () => {
    const { status } = await req('POST', `/action-drafts/${draftId}/execute`, {
      executed_by: 'admin',
    });
    expect(status).toBe(400);
  });

  test('POST /:id/execute — nonexistent returns 404', async () => {
    const { status } = await req('POST', '/action-drafts/nonexistent/execute', {});
    expect(status).toBe(404);
  });

  test('POST /:id/execute — downgrade draft works', async () => {
    const { data: d } = await req('POST', '/action-drafts', {
      action_type: 'downgrade',
      target_asset_id: 'asset-test-2',
    });
    const { status, data } = await req('POST', `/action-drafts/${d.id}/execute`, {});
    expect(status).toBe(200);
    expect(data.status).toBe('done');
  });

  test('POST /:id/execute — rollback draft works', async () => {
    const { data: d } = await req('POST', '/action-drafts', {
      action_type: 'rollback',
      target_asset_id: 'asset-test-3',
    });
    const { status, data } = await req('POST', `/action-drafts/${d.id}/execute`, {});
    expect(status).toBe(200);
    expect(data.status).toBe('done');
  });
});
