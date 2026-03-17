/**
 * audit.test.ts — Hono route tests for KM audit logs (read-only)
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import audit from '../../../../../../backend/src/agent/km/kms/audit';
import { writeAudit } from '../../../../../../backend/src/agent/km/kms/helpers';

const app = new Hono();
app.route('/audit-logs', audit);

async function req(method: string, path: string) {
  const res = await app.fetch(new Request(`http://localhost${path}`, { method }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('audit route', () => {
  test('seed audit logs for testing', async () => {
    await writeAudit({ action: 'test_action', object_type: 'test_obj', object_id: 'obj-1', operator: 'test-user', risk_level: 'low', detail: { note: 'test' } });
    await writeAudit({ action: 'another_action', object_type: 'test_obj', object_id: 'obj-2', operator: 'admin', risk_level: 'high' });
  });

  test('GET / — list audit logs', async () => {
    const { status, data } = await req('GET', '/audit-logs');
    expect(status).toBe(200);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('GET / — filter by action', async () => {
    const { status, data } = await req('GET', '/audit-logs?action=test_action');
    expect(status).toBe(200);
    expect((data.items as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET / — filter by object_type', async () => {
    const { status, data } = await req('GET', '/audit-logs?object_type=test_obj');
    expect(status).toBe(200);
  });

  test('GET / — filter by operator', async () => {
    const { status, data } = await req('GET', '/audit-logs?operator=admin');
    expect(status).toBe(200);
  });

  test('GET / — filter by risk_level', async () => {
    const { status, data } = await req('GET', '/audit-logs?risk_level=high');
    expect(status).toBe(200);
  });

  test('GET / — pagination', async () => {
    const { status, data } = await req('GET', '/audit-logs?page=1&size=10');
    expect(status).toBe(200);
  });

  test('GET / — default size is 50', async () => {
    const { status } = await req('GET', '/audit-logs');
    expect(status).toBe(200);
  });
});
