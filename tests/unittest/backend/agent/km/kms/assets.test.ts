/**
 * assets.test.ts — Hono route tests for KM assets
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../../../../../../backend/src/db';
import { kmAssets, kmAssetVersions } from '../../../../../../backend/src/db/schema';
import assets from '../../../../../../backend/src/agent/km/kms/assets';

const app = new Hono();
app.route('/assets', assets);

async function req(method: string, path: string) {
  const res = await app.fetch(new Request(`http://localhost${path}`, { method }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('assets route', () => {
  let assetId: string;

  // Seed a test asset directly into DB
  test('seed test asset', async () => {
    assetId = `asset-test-${Date.now()}`;
    const now = new Date().toISOString();
    await db.insert(kmAssets).values({
      id: assetId, title: 'Test Asset', asset_type: 'qa',
      status: 'online', current_version: 1, owner: 'tester',
      created_at: now, updated_at: now,
    });
    await db.insert(kmAssetVersions).values({
      id: `ver-${Date.now()}`, asset_id: assetId, version_no: 1,
      content_snapshot: JSON.stringify({ q: 'test', a: 'answer' }),
      effective_from: now, created_at: now,
    });
  });

  test('GET / — list assets', async () => {
    const { status, data } = await req('GET', '/assets');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by status', async () => {
    const { status } = await req('GET', '/assets?status=online');
    expect(status).toBe(200);
  });

  test('GET / — filter by asset_type', async () => {
    const { status } = await req('GET', '/assets?asset_type=qa');
    expect(status).toBe(200);
  });

  test('GET / — filter by keyword', async () => {
    const { status } = await req('GET', '/assets?keyword=Test');
    expect(status).toBe(200);
  });

  test('GET / — pagination', async () => {
    const { status, data } = await req('GET', '/assets?page=1&size=5');
    expect(status).toBe(200);
    expect(data.page).toBe(1);
    expect(data.size).toBe(5);
  });

  test('GET /:id — detail', async () => {
    const { status, data } = await req('GET', `/assets/${assetId}`);
    expect(status).toBe(200);
    expect(data.title).toBe('Test Asset');
    expect(data.status).toBe('online');
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/assets/nonexistent');
    expect(status).toBe(404);
  });

  test('GET /:id/versions — version chain', async () => {
    const { status, data } = await req('GET', `/assets/${assetId}/versions`);
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
