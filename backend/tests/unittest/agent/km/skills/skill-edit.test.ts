/**
 * skill-edit.test.ts — Tests for NL skill editing routes (validation paths)
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import skillEdit from '../../../../../src/agent/km/skills/skill-edit';

const app = new Hono();
app.route('/skill-edit', skillEdit);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('skill-edit — POST /clarify validation', () => {
  test('missing instruction returns 400', async () => {
    const { status, data } = await req('POST', '/skill-edit/clarify', {});
    expect(status).toBe(400);
    expect((data.error as string)).toContain('instruction');
  });

  test('empty instruction returns 400', async () => {
    const { status, data } = await req('POST', '/skill-edit/clarify', {
      instruction: '',
    });
    expect(status).toBe(400);
  });
});

describe('skill-edit — POST / validation', () => {
  test('missing instruction returns 400', async () => {
    const { status, data } = await req('POST', '/skill-edit', {});
    expect(status).toBe(400);
    expect((data.error as string)).toContain('instruction');
  });

  test('empty instruction returns 400', async () => {
    const { status } = await req('POST', '/skill-edit', { instruction: '' });
    expect(status).toBe(400);
  });
});

describe('skill-edit — POST /apply validation', () => {
  test('missing skill_path returns 400', async () => {
    const { status, data } = await req('POST', '/skill-edit/apply', {
      old_fragment: 'old', new_fragment: 'new',
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('参数不完整');
  });

  test('missing old_fragment returns 400', async () => {
    const { status } = await req('POST', '/skill-edit/apply', {
      skill_path: 'test.md', new_fragment: 'new',
    });
    expect(status).toBe(400);
  });

  test('missing new_fragment returns 400', async () => {
    const { status } = await req('POST', '/skill-edit/apply', {
      skill_path: 'test.md', old_fragment: 'old',
    });
    expect(status).toBe(400);
  });

  test('nonexistent file returns 404', async () => {
    const { status, data } = await req('POST', '/skill-edit/apply', {
      skill_path: 'nonexistent/SKILL.md',
      old_fragment: 'old text',
      new_fragment: 'new text',
    });
    expect(status).toBe(404);
  });
});

describe('skill-edit — module loads', () => {
  test('default export is Hono app', async () => {
    const mod = await import('../../../../../../backend/src/agent/km/skills/skill-edit');
    expect(mod.default).toBeDefined();
  });
});
