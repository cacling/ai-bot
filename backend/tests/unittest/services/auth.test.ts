/**
 * auth.test.ts — requireRole RBAC middleware tests using REAL SQLite DB.
 *
 * Strategy: insert test user(s) before tests, clean up after.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../../../src/db';
import { users } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../src/services/auth';

// ── Test user IDs (unique prefix to avoid collision) ────────────────────────

const TEST_PREFIX = '__test_auth_';
const TEST_USERS = [
  { id: `${TEST_PREFIX}admin`, name: 'Test Admin', role: 'admin' },
  { id: `${TEST_PREFIX}flow_manager`, name: 'Test FM', role: 'flow_manager' },
  { id: `${TEST_PREFIX}config_editor`, name: 'Test CE', role: 'config_editor' },
  { id: `${TEST_PREFIX}reviewer`, name: 'Test Rev', role: 'reviewer' },
  { id: `${TEST_PREFIX}auditor`, name: 'Test Aud', role: 'auditor' },
];

beforeAll(() => {
  for (const u of TEST_USERS) {
    try { db.delete(users).where(eq(users.id, u.id)).run(); } catch {}
    db.insert(users).values(u).run();
  }
});

afterAll(() => {
  for (const u of TEST_USERS) {
    try { db.delete(users).where(eq(users.id, u.id)).run(); } catch {}
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildApp(minRole: Parameters<typeof requireRole>[0]) {
  const app = new Hono();
  app.get('/test', requireRole(minRole), (c) => {
    return c.json({
      ok: true,
      userId: c.get('userId'),
      userRole: c.get('userRole'),
    });
  });
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('requireRole — RBAC middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => { process.env.NODE_ENV = originalEnv; });

  // 1. Dev mode: no header -> pass through
  test('dev mode: no X-User-Id header -> 200 (pass through)', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp('config_editor');
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  // 2. Production mode: no header -> 401
  test('production mode: no X-User-Id header -> 401', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp('config_editor');
    const res = await app.request('/test');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('认证');
    process.env.NODE_ENV = originalEnv;
  });

  // 3. User not found -> 401
  test('user not found in DB -> 401', async () => {
    const app = buildApp('auditor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}nonexistent` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain(`${TEST_PREFIX}nonexistent`);
  });

  // 4. Insufficient role -> 403
  test('insufficient role (auditor on config_editor route) -> 403', async () => {
    const app = buildApp('config_editor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}auditor` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('auditor');
    expect(body.error).toContain('config_editor');
  });

  // 5. Reviewer on config_editor route -> 403
  test('insufficient role (reviewer on config_editor route) -> 403', async () => {
    const app = buildApp('config_editor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}reviewer` },
    });
    expect(res.status).toBe(403);
  });

  // 6. Exact match -> 200
  test('exact role match (config_editor on config_editor route) -> 200', async () => {
    const app = buildApp('config_editor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}config_editor` },
    });
    expect(res.status).toBe(200);
  });

  // 7. Higher role -> 200
  test('higher role (admin on config_editor route) -> 200', async () => {
    const app = buildApp('config_editor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}admin` },
    });
    expect(res.status).toBe(200);
  });

  // 8. flow_manager on config_editor route -> 200
  test('higher role (flow_manager on config_editor route) -> 200', async () => {
    const app = buildApp('config_editor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}flow_manager` },
    });
    expect(res.status).toBe(200);
  });

  // 9. Sets userId and userRole in context
  test('sets userId and userRole in context on success', async () => {
    const app = buildApp('auditor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}admin` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(`${TEST_PREFIX}admin`);
    expect(body.userRole).toBe('admin');
  });

  // 10. Lowest role (auditor) on auditor route -> 200
  test('lowest role (auditor on auditor route) -> 200', async () => {
    const app = buildApp('auditor');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}auditor` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userRole).toBe('auditor');
  });

  // 11. Admin route requires admin — flow_manager insufficient
  test('flow_manager on admin route -> 403', async () => {
    const app = buildApp('admin');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}flow_manager` },
    });
    expect(res.status).toBe(403);
  });

  // 12. Dev mode with header still checks role
  test('dev mode: with X-User-Id header, still enforces role check', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp('admin');
    const res = await app.request('/test', {
      headers: { 'X-User-Id': `${TEST_PREFIX}auditor` },
    });
    expect(res.status).toBe(403);
    process.env.NODE_ENV = originalEnv;
  });
});
