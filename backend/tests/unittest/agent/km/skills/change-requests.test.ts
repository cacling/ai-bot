/**
 * change-requests.test.ts — Tests for change request routes and detectHighRisk
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import changeRequestRoutes, { detectHighRisk } from '../../../../../src/agent/km/skills/change-requests';
import { db } from '../../../../../src/db';
import { changeRequests } from '../../../../../src/db/schema';

const app = new Hono();
app.route('/change-requests', changeRequestRoutes);

async function req(method: string, path: string, body?: Record<string, unknown>, headers?: Record<string, string>) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('detectHighRisk', () => {
  test('returns null for no-risk changes', () => {
    const result = detectHighRisk('Hello world', 'Hello everyone');
    expect(result).toBeNull();
  });

  test('detects transfer_to_human pattern changes', () => {
    const old = 'No transfer logic here';
    const newContent = 'Now we have transfer_to_human support';
    const result = detectHighRisk(old, newContent);
    expect(result).toBe('转人工条件变更');
  });

  test('detects collection/billing wording changes', () => {
    const old = '催收话术：请及时还款';
    const newContent = '催收话术：请尽快处理逾期款项';
    const result = detectHighRisk(old, newContent);
    expect(result).toBe('催收话术修改');
  });

  test('detects tool permission changes', () => {
    const old = 'tool: query_balance\n使用工具';
    const newContent = 'tool: query_balance\ntool: transfer_money\n使用工具';
    const result = detectHighRisk(old, newContent);
    expect(result).toBe('工具权限变更');
  });

  test('detects compliance keyword changes', () => {
    const old = 'banned words: none';
    const newContent = 'banned words: updated list';
    const result = detectHighRisk(old, newContent);
    expect(result).toBe('合规词库修改');
  });

  test('returns null when patterns exist but lines unchanged', () => {
    const content = 'No risk patterns here\njust normal text';
    const result = detectHighRisk(content, content);
    expect(result).toBeNull();
  });
});

describe('change-requests route', () => {
  let crId: number;

  test('seed a change request', async () => {
    const result = await db.insert(changeRequests).values({
      skill_path: 'skills/biz-skills/test-skill/SKILL.md',
      description: 'Test change',
      old_content: '# Old content',
      new_content: '# New content',
      requester: 'test-user',
      risk_reason: 'test-risk',
      status: 'pending',
      created_at: new Date().toISOString(),
    }).returning({ id: changeRequests.id });
    crId = result[0].id;
  });

  test('GET / — list change requests (default pending)', async () => {
    const { status, data } = await req('GET', '/change-requests');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET / — filter by status', async () => {
    const { status, data } = await req('GET', '/change-requests?status=pending');
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('GET /:id — detail', async () => {
    const { status, data } = await req('GET', `/change-requests/${crId}`);
    expect(status).toBe(200);
    expect(data.description).toBe('Test change');
    expect(data.status).toBe('pending');
  });

  test('GET /:id — nonexistent returns 404', async () => {
    const { status } = await req('GET', '/change-requests/99999');
    expect(status).toBe(404);
  });

  test('POST /:id/reject — reject change request', async () => {
    // Create another CR to reject
    const result = await db.insert(changeRequests).values({
      skill_path: 'skills/biz-skills/test-skill/SKILL.md',
      description: 'To reject',
      old_content: '# Old',
      new_content: '# New',
      requester: 'test-user',
      risk_reason: 'risk',
      status: 'pending',
      created_at: new Date().toISOString(),
    }).returning({ id: changeRequests.id });

    const { status, data } = await req('POST', `/change-requests/${result[0].id}/reject`);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  test('POST /:id/reject — already rejected returns 400', async () => {
    // Get the one we just rejected
    const rows = await db.select().from(changeRequests);
    const rejected = rows.find(r => r.status === 'rejected');
    if (rejected) {
      const { status } = await req('POST', `/change-requests/${rejected.id}/reject`);
      expect(status).toBe(400);
    }
  });

  test('POST /:id/approve — nonexistent returns 404', async () => {
    const { status } = await req('POST', '/change-requests/99999/approve');
    expect(status).toBe(404);
  });
});
