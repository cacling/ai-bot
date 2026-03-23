/**
 * skill-edit.test.ts — Tests for NL skill editing routes (validation paths)
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { resolve } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import skillEdit from '../../../../../src/agent/km/skills/skill-edit';
import { REPO_ROOT } from '../../../../../src/services/paths';

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

// Temp file for apply tests
const TEMP_DIR = resolve(REPO_ROOT, '_test_skill_edit_tmp');
const TEMP_FILE_REL = '_test_skill_edit_tmp/test-skill.md';
const TEMP_FILE_ABS = resolve(REPO_ROOT, TEMP_FILE_REL);

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true });
});

describe('skill-edit — POST /apply with real file', () => {
  test('successful apply replaces old_fragment with new_fragment', async () => {
    await mkdir(TEMP_DIR, { recursive: true });
    await writeFile(TEMP_FILE_ABS, '# Test Skill\nOld wording here\nFooter line', 'utf-8');

    const { status, data } = await req('POST', '/skill-edit/apply', {
      skill_path: TEMP_FILE_REL,
      old_fragment: 'Old wording here',
      new_fragment: 'New wording here',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify file was actually modified
    const content = readFileSync(TEMP_FILE_ABS, 'utf-8');
    expect(content).toContain('New wording here');
    expect(content).not.toContain('Old wording here');
    expect(content).toContain('Footer line');
  });

  test('old_fragment mismatch returns 409', async () => {
    await mkdir(TEMP_DIR, { recursive: true });
    await writeFile(TEMP_FILE_ABS, '# Test Skill\nCurrent content', 'utf-8');

    const { status, data } = await req('POST', '/skill-edit/apply', {
      skill_path: TEMP_FILE_REL,
      old_fragment: 'This text does not exist in file',
      new_fragment: 'replacement',
    });
    expect(status).toBe(409);
    expect((data.error as string)).toContain('不匹配');
  });

  test('apply with empty new_fragment effectively deletes old_fragment', async () => {
    await mkdir(TEMP_DIR, { recursive: true });
    await writeFile(TEMP_FILE_ABS, '# Test\nRemove this line\nKeep this', 'utf-8');

    const { status, data } = await req('POST', '/skill-edit/apply', {
      skill_path: TEMP_FILE_REL,
      old_fragment: 'Remove this line\n',
      new_fragment: '',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    const content = readFileSync(TEMP_FILE_ABS, 'utf-8');
    expect(content).not.toContain('Remove this line');
    expect(content).toContain('Keep this');
  });
});

describe('skill-edit — module loads', () => {
  test('default export is Hono app', async () => {
    const mod = await import('../../../../../../backend/src/agent/km/skills/skill-edit');
    expect(mod.default).toBeDefined();
  });
});
