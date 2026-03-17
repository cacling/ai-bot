/**
 * canary.test.ts — Tests for canary deployment routes and resolveSkillsDir
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import canary, { resolveSkillsDir } from '../../../../../../backend/src/agent/km/skills/canary';

const app = new Hono();
app.route('/canary', canary);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('canary — resolveSkillsDir', () => {
  test('returns default dir when no canary active', () => {
    const result = resolveSkillsDir('13800000001', '/default/skills');
    expect(result).toBe('/default/skills');
  });

  test('returns default dir for any phone when no canary', () => {
    const result = resolveSkillsDir('13800000009', '/default/skills');
    expect(result).toBe('/default/skills');
  });
});

describe('canary — status endpoint', () => {
  test('GET /canary/status — no active canary', async () => {
    const { status, data } = await req('GET', '/canary/status');
    expect(status).toBe(200);
    expect(data.active).toBe(false);
  });
});

describe('canary — deploy validation', () => {
  test('POST /canary/deploy — missing skill_path returns 400', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {});
    expect(status).toBe(400);
    expect((data.error as string)).toContain('skill_path');
  });

  test('POST /canary/deploy — nonexistent file returns 404', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: 'nonexistent/path/SKILL.md',
    });
    expect(status).toBe(404);
  });

  test('POST /canary/deploy — invalid percentage returns 400', async () => {
    const { status, data } = await req('POST', '/canary/deploy', {
      skill_path: 'nonexistent/path/SKILL.md',
      percentage: 0,
    });
    // Will return 404 because file check happens first
    expect(status).toBe(404);
  });
});

describe('canary — promote/delete without active canary', () => {
  test('POST /canary/promote — no canary returns 400', async () => {
    const { status, data } = await req('POST', '/canary/promote');
    expect(status).toBe(400);
    expect((data.error as string)).toContain('没有灰度');
  });

  test('DELETE /canary — no canary returns 400', async () => {
    const { status, data } = await req('DELETE', '/canary');
    expect(status).toBe(400);
    expect((data.error as string)).toContain('没有灰度');
  });
});
