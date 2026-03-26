/**
 * API tests for: src/agent/km/skills/skill-edit.ts
 * Routes: POST /api/skill-edit/clarify, POST /api/skill-edit, POST /api/skill-edit/apply
 * Mock: LLM (generateText), fs, db, auth
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON } from '../../../helpers';

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockGenerateTextResult = { text: '' };
let mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.';
let mockFileExists = true;
let writtenContent: string | null = null;

// ── Mock AI SDK ─────────────────────────────────────────────────────────────

mock.module('ai', () => ({
  generateText: async () => mockGenerateTextResult,
}));

mock.module('../../../../../src/engine/llm', () => ({
  chatModel: 'mock-chat-model',
}));

// ── Mock fs ─────────────────────────────────────────────────────────────────

mock.module('node:fs/promises', () => ({
  readFile: async (path: string, _enc?: string) => {
    if (!mockFileExists) throw new Error(`ENOENT: ${path}`);
    return mockFileContent;
  },
  writeFile: async (_path: string, content: string, _enc?: string) => {
    writtenContent = content;
  },
}));

mock.module('node:fs', () => ({
  readdirSync: (_path: string, _opts?: unknown) => {
    return [
      { name: 'bill-inquiry', isDirectory: () => true },
    ].filter(d => d.isDirectory());
  },
  existsSync: (_path: string) => mockFileExists,
  readFileSync: (_path: string, _enc?: string) => mockFileContent,
}));

// ── Mock auth ───────────────────────────────────────────────────────────────

mock.module('../../../../../src/services/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

// ── Mock paths ──────────────────────────────────────────────────────────────

mock.module('../../../../../src/services/paths', () => ({
  REPO_ROOT: '/fake/repo',
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
}));

// ── Mock logger ─────────────────────────────────────────────────────────────

mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../../../src/agent/km/skills/skill-edit');
  app = new Hono();
  app.route('/api/skill-edit', mod.default);
}

// ── Tests: POST /api/skill-edit/clarify ─────────────────────────────────────

describe('POST /api/skill-edit/clarify', () => {
  beforeEach(async () => {
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.';
    await setupApp();
  });

  test('returns clarification questions for ambiguous edit request', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        is_complete: false,
        missing_items: ['target skill name', 'specific content to change'],
        clarify_question: 'Which skill do you want to modify? What specific change do you need?',
        parsed_intent: {
          target_skill: null,
          change_type: 'wording',
          details: 'unclear',
          risk_level: 'low',
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: 'Change something',
    });
    expect(status).toBe(200);
    expect(body.status).toBe('need_clarify');
    expect(body.question).toBeDefined();
    expect(typeof body.question).toBe('string');
    expect(body.missing).toBeDefined();
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.missing.length).toBeGreaterThan(0);
  });

  test('returns 400 when instruction is missing', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/clarify', {
      instruction: '',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('instruction');
  });
});

// ── Tests: POST /api/skill-edit ─────────────────────────────────────────────

describe('POST /api/skill-edit', () => {
  beforeEach(async () => {
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nSome content here.\n\nOld wording that needs change.';
    await setupApp();
  });

  test('returns diff (old_fragment -> new_fragment) for edit request', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Old wording that needs change.',
        new_fragment: 'New improved wording.',
        explanation: 'Updated the wording to be clearer.',
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit', {
      instruction: 'Change the wording in bill-inquiry to be clearer',
    });
    expect(status).toBe(200);
    expect(body.skill_path).toBeDefined();
    expect(body.diff).toBeDefined();
    expect(body.diff.old).toBe('Old wording that needs change.');
    expect(body.diff.new).toBe('New improved wording.');
    expect(body.explanation).toBeDefined();
  });

  test('generates correct diff for adding a new state', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
        old_fragment: 'Some content here.',
        new_fragment: 'Some content here.\n\n## New State\nAdditional flow step.',
        explanation: 'Added a new state to the flow.',
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-edit', {
      instruction: 'Add a new state to bill inquiry flow',
    });
    expect(status).toBe(200);
    expect(body.diff.new).toContain('New State');
    expect(body.diff.new).toContain('Additional flow step');
    expect(body.diff.old).toBe('Some content here.');
  });
});

// ── Tests: POST /api/skill-edit/apply ───────────────────────────────────────

describe('POST /api/skill-edit/apply', () => {
  beforeEach(async () => {
    mockFileExists = true;
    mockFileContent = '---\nname: bill-inquiry\n---\n# Bill Inquiry\n\nOriginal fragment to replace.';
    writtenContent = null;
    await setupApp();
  });

  test('applies diff and writes updated file', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      old_fragment: 'Original fragment to replace.',
      new_fragment: 'Replaced with new content.',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(writtenContent).toBeDefined();
    expect(writtenContent).toContain('Replaced with new content.');
    expect(writtenContent).not.toContain('Original fragment to replace.');
  });

  test('returns 409 when old_fragment does not match (concurrent edit)', async () => {
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/bill-inquiry/SKILL.md',
      old_fragment: 'This text does not exist in the file.',
      new_fragment: 'Some replacement.',
    });
    expect(status).toBe(409);
    expect(body.error).toContain('不匹配');
  });

  test('returns 404 when file does not exist', async () => {
    mockFileExists = false;
    const { status, body } = await postJSON(app, '/api/skill-edit/apply', {
      skill_path: 'skills/biz-skills/nonexistent/SKILL.md',
      old_fragment: 'anything',
      new_fragment: 'replacement',
    });
    expect(status).toBe(404);
    expect(body.error).toContain('不存在');
  });
});
