/**
 * files.test.ts — Tests for file browser API routes
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import files from '../../../../../src/agent/km/skills/files';

const app = new Hono();
app.route('/files', files);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('files — GET /tree', () => {
  test('returns tree structure', async () => {
    const { status, data } = await req('GET', '/files/tree');
    expect(status).toBe(200);
    expect(data.tree).toBeDefined();
    expect(Array.isArray(data.tree)).toBe(true);
  });
});

describe('files — GET /content', () => {
  test('missing path returns 400', async () => {
    const { status, data } = await req('GET', '/files/content');
    expect(status).toBe(400);
    expect((data.error as string)).toContain('path');
  });

  test('unsupported file type returns 400', async () => {
    const { status, data } = await req('GET', '/files/content?path=test.exe');
    expect(status).toBe(400);
    expect((data.error as string)).toContain('不支持');
  });

  test('path traversal returns 403', async () => {
    const { status, data } = await req('GET', '/files/content?path=../../../../../etc/hosts.txt');
    expect(status).toBe(403);
    expect((data.error as string)).toContain('不合法');
  });

  test('nonexistent file in allowed root returns 404', async () => {
    const { status } = await req('GET', '/files/content?path=backend/skills/nonexistent/file.md');
    expect(status).toBe(404);
  });

  test('valid md file in skills returns content', async () => {
    const { status, data } = await req('GET', '/files/content?path=backend/skills/biz-skills/bill-inquiry/SKILL.md');
    expect(status).toBe(200);
    expect(data.content).toBeDefined();
  });
});

describe('files — PUT /content', () => {
  test('missing path returns 400', async () => {
    const { status, data } = await req('PUT', '/files/content', {
      content: 'test',
    });
    expect(status).toBe(400);
  });

  test('missing content returns 400', async () => {
    const { status, data } = await req('PUT', '/files/content', {
      path: 'test.md',
    });
    expect(status).toBe(400);
  });

  test('unsupported file type returns 400', async () => {
    const { status } = await req('PUT', '/files/content', {
      path: 'test.exe', content: 'bad',
    });
    expect(status).toBe(400);
  });

  test('path traversal returns 403', async () => {
    const { status } = await req('PUT', '/files/content', {
      path: '../../../../../etc/hosts.txt', content: 'bad',
    });
    expect(status).toBe(403);
  });
});
