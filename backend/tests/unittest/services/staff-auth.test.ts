/**
 * staff-auth.test.ts — Staff login/logout/me + session middleware tests.
 *
 * Uses real SQLite DB. Seeds a test staff account, cleans up after.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { platformDb as db } from '../../../src/db';
import { staffAccounts, staffSessions } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { staffAuthRoutes, staffSessionMiddleware } from '../../../src/services/staff-auth';

const TEST_ID = '__test_staff_001';
const TEST_USERNAME = '__test_staff_user';
const TEST_PASSWORD = 'TestPass@123';

beforeAll(async () => {
  // Clean up any leftover test data
  try { db.delete(staffSessions).where(eq(staffSessions.staff_id, TEST_ID)).run(); } catch {}
  try { db.delete(staffAccounts).where(eq(staffAccounts.id, TEST_ID)).run(); } catch {}

  const hash = await Bun.password.hash(TEST_PASSWORD, 'bcrypt');
  db.insert(staffAccounts).values({
    id: TEST_ID,
    username: TEST_USERNAME,
    display_name: 'Test Staff',
    password_hash: hash,
    primary_staff_role: 'agent',
    staff_roles: JSON.stringify(['agent', 'operations']),
    platform_role: 'admin',
  }).run();
});

afterAll(() => {
  try { db.delete(staffSessions).where(eq(staffSessions.staff_id, TEST_ID)).run(); } catch {}
  try { db.delete(staffAccounts).where(eq(staffAccounts.id, TEST_ID)).run(); } catch {}
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildAuthApp() {
  const app = new Hono();
  app.route('/api/staff-auth', staffAuthRoutes);
  return app;
}

function buildMiddlewareApp() {
  const app = new Hono();
  app.use('/api/*', staffSessionMiddleware);
  app.get('/api/protected', (c) => {
    return c.json({
      staffId: c.get('staffId'),
      staffRole: c.get('staffRole'),
      platformRole: c.get('platformRole'),
      userId: c.get('userId'),
      userRole: c.get('userRole'),
    });
  });
  return app;
}

function extractCookie(res: Response): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/staff_session=([^;]+)/);
  return match ? match[1] : null;
}

// ── Login tests ──────────────────────────────────────────────────────────────

describe('POST /api/staff-auth/login', () => {
  test('valid credentials → 200 + cookie + staff data', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.staff.id).toBe(TEST_ID);
    expect(data.staff.username).toBe(TEST_USERNAME);
    expect(data.staff.display_name).toBe('Test Staff');
    expect(data.staff.primary_staff_role).toBe('agent');
    expect(data.staff.staff_roles).toEqual(['agent', 'operations']);
    expect(data.staff.platform_role).toBe('admin');

    const cookie = extractCookie(res);
    expect(cookie).toBeTruthy();
  });

  test('wrong password → 401', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME, password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  test('unknown user → 401', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexistent', password: 'test' }),
    });
    expect(res.status).toBe(401);
  });

  test('missing fields → 400', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME }),
    });
    expect(res.status).toBe(400);
  });
});

// ── Me tests ─────────────────────────────────────────────────────────────────

describe('GET /api/staff-auth/me', () => {
  test('valid cookie → 200 + staff data', async () => {
    const app = buildAuthApp();
    // Login first
    const loginRes = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);
    expect(cookie).toBeTruthy();

    // Call /me with cookie
    const meRes = await app.request('/api/staff-auth/me', {
      headers: { Cookie: `staff_session=${cookie}` },
    });
    expect(meRes.status).toBe(200);
    const data = await meRes.json();
    expect(data.staff.id).toBe(TEST_ID);
  });

  test('no cookie → 401', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/me');
    expect(res.status).toBe(401);
  });

  test('invalid cookie → 401', async () => {
    const app = buildAuthApp();
    const res = await app.request('/api/staff-auth/me', {
      headers: { Cookie: 'staff_session=invalid-token' },
    });
    expect(res.status).toBe(401);
  });
});

// ── Logout tests ─────────────────────────────────────────────────────────────

describe('POST /api/staff-auth/logout', () => {
  test('clears session → subsequent /me returns 401', async () => {
    const app = buildAuthApp();
    // Login
    const loginRes = await app.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    // Logout
    const logoutRes = await app.request('/api/staff-auth/logout', {
      method: 'POST',
      headers: { Cookie: `staff_session=${cookie}` },
    });
    expect(logoutRes.status).toBe(200);

    // /me should fail
    const meRes = await app.request('/api/staff-auth/me', {
      headers: { Cookie: `staff_session=${cookie}` },
    });
    expect(meRes.status).toBe(401);
  });
});

// ── Session middleware tests ─────────────────────────────────────────────────

describe('staffSessionMiddleware', () => {
  test('valid cookie → injects context variables', async () => {
    // Login to get token
    const authApp = buildAuthApp();
    const loginRes = await authApp.request('/api/staff-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    // Use middleware app
    const app = buildMiddlewareApp();
    const res = await app.request('/api/protected', {
      headers: { Cookie: `staff_session=${cookie}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.staffId).toBe(TEST_ID);
    expect(data.staffRole).toBe('agent');
    expect(data.platformRole).toBe('admin');
    // 兼容层
    expect(data.userId).toBe(TEST_ID);
    expect(data.userRole).toBe('admin');
  });

  test('no cookie in dev mode → passes through (no context)', async () => {
    const app = buildMiddlewareApp();
    const res = await app.request('/api/protected');
    // Dev mode: passes through
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.staffId).toBeUndefined();
  });
});
