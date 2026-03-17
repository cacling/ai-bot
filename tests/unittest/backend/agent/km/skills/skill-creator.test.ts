/**
 * skill-creator.test.ts — Tests for skill creator routes (validation paths)
 */
import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import skillCreator from '../../../../../../backend/src/agent/km/skills/skill-creator';

const app = new Hono();
app.route('/skill-creator', skillCreator);

async function req(method: string, path: string, body?: Record<string, unknown>) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

describe('skill-creator — POST /chat validation', () => {
  test('empty message returns 400', async () => {
    const { status, data } = await req('POST', '/skill-creator/chat', {
      message: '',
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('message');
  });

  test('missing message returns 400', async () => {
    const { status, data } = await req('POST', '/skill-creator/chat', {});
    expect(status).toBe(400);
  });

  test('whitespace-only message returns 400', async () => {
    const { status } = await req('POST', '/skill-creator/chat', {
      message: '   ',
    });
    expect(status).toBe(400);
  });
});

describe('skill-creator — POST /save validation', () => {
  test('missing skill_name returns 400', async () => {
    const { status, data } = await req('POST', '/skill-creator/save', {
      skill_md: '# Content',
    });
    expect(status).toBe(400);
  });

  test('missing skill_md returns 400', async () => {
    const { status, data } = await req('POST', '/skill-creator/save', {
      skill_name: 'test-skill',
    });
    expect(status).toBe(400);
  });

  test('invalid skill_name format returns 400', async () => {
    const { status, data } = await req('POST', '/skill-creator/save', {
      skill_name: 'Invalid Name!',
      skill_md: '# Content',
    });
    expect(status).toBe(400);
    expect((data.error as string)).toContain('kebab-case');
  });

  test('camelCase skill_name returns 400', async () => {
    const { status } = await req('POST', '/skill-creator/save', {
      skill_name: 'mySkill',
      skill_md: '# Content',
    });
    expect(status).toBe(400);
  });

  test('skill_name with spaces returns 400', async () => {
    const { status } = await req('POST', '/skill-creator/save', {
      skill_name: 'my skill',
      skill_md: '# Content',
    });
    expect(status).toBe(400);
  });

  test('valid kebab-case skill_name accepted', async () => {
    // This may fail due to LLM dependency in save, but validation should pass
    const { status } = await req('POST', '/skill-creator/save', {
      skill_name: 'valid-skill-name',
      skill_md: '# Content',
    });
    // If it gets past validation, it should either succeed (200) or fail on save (500)
    expect(status === 200 || status === 500).toBe(true);
  });
});
