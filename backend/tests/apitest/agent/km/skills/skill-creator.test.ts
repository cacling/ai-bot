/**
 * API tests for: src/agent/km/skills/skill-creator.ts
 * Routes: POST /api/skill-creator/chat, POST /api/skill-creator/save
 * Mock: LLM (generateText/streamText), fs, db, version-manager, skills engine, validation, tools-overview
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON } from '../../../helpers';

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockGenerateTextResult = {
  text: JSON.stringify({
    reply: 'Please describe the skill you want to create.',
    phase: 'interview',
    draft: null,
  }),
};
let mockGenerateTextQueue: Array<{ text: string }> = [];
let generateTextCallCount = 0;

let mockValidationResult = { valid: true, errors: [], warnings: [], infos: [] };
let mockValidationQueue: Array<{ valid: boolean; errors: unknown[]; warnings: unknown[]; infos?: unknown[] }> = [];
let mockToolsOverview: Array<{ name: string; description: string; source: string; status: string; skills: string[] }> = [];
let mockSkillRegistry: Record<string, unknown> | undefined = undefined;
let createNewSkillVersionCalled = false;
let createVersionFromCalled = false;
let writeVersionFileCalled = false;
let mockInserted: Array<Record<string, unknown>> = [];

// ── Mock AI SDK ─────────────────────────────────────────────────────────────

mock.module('ai', () => ({
  generateText: async () => {
    generateTextCallCount += 1;
    return mockGenerateTextQueue.shift() ?? mockGenerateTextResult;
  },
  streamText: () => ({ fullStream: { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true }) }) }, text: Promise.resolve(''), reasoning: Promise.resolve(null) }),
  tool: (opts: unknown) => opts,
}));

// ── Mock LLM models ─────────────────────────────────────────────────────────

mock.module('../../../../../src/engine/llm', () => ({
  skillCreatorModel: 'mock-model',
  skillCreatorThinkingModel: 'mock-thinking-model',
  skillCreatorVisionModel: 'mock-vision-model',
  chatModel: 'mock-chat-model',
}));

// ── Mock version-manager ────────────────────────────────────────────────────

mock.module('../../../../../src/agent/km/skills/version-manager', () => ({
  getSkillRegistry: (_id: string) => mockSkillRegistry,
  listSkillRegistry: () => [],
  createNewSkillVersion: async () => { createNewSkillVersionCalled = true; },
  createVersionFrom: async () => { createVersionFromCalled = true; return { versionNo: 2, snapshotPath: '.versions/test-skill/v2' }; },
  writeVersionFile: async () => { writeVersionFileCalled = true; },
}));

// ── Mock validation ─────────────────────────────────────────────────────────

mock.module('../../../../../skills/tech-skills/skill-creator-spec/scripts/run_validation.ts', () => ({
  runValidation: () => mockValidationQueue.shift() ?? mockValidationResult,
}));

// ── Mock tools-overview ─────────────────────────────────────────────────────

mock.module('../../../../../src/agent/km/mcp/tools-overview', () => ({
  getToolsOverview: () => mockToolsOverview,
  getToolDetail: (_name: string) => null,
}));

// ── Mock engine/skills ──────────────────────────────────────────────────────

mock.module('../../../../../src/engine/skills', () => ({
  refreshSkillsCache: () => {},
  syncSkillMetadata: () => {},
}));

// ── Mock skill-workflow-compiler ────────────────────────────────────────────

mock.module('../../../../../src/engine/skill-workflow-compiler', () => ({
  compileWorkflow: () => ({ spec: null, errors: [], warnings: [] }),
}));

// ── Mock fs ─────────────────────────────────────────────────────────────────

mock.module('fs', () => ({
  readFileSync: (_path: string, _enc?: string) => '---\nname: mock\n---\n# Mock Skill',
  readdirSync: (_path: string, _opts?: unknown) => [],
  existsSync: (_path: string) => true,
  mkdirSync: () => {},
  writeFileSync: () => {},
}));

// ── Mock db ─────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function buildMockDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => null,
          then: (r: (v: Row[]) => void) => r([]),
        }),
        then: (r: (v: Row[]) => void) => r([]),
      }),
    }),
    insert: () => ({
      values: (v: Row | Row[]) => {
        const items = Array.isArray(v) ? v : [v];
        mockInserted.push(...items);
        return {
          returning: () => ({ then: (r: (v: Row[]) => void) => r(items) }),
          run: () => {},
          then: (r: (v: void) => void) => r(),
        };
      },
    }),
    delete: () => ({
      where: () => ({
        run: () => {},
        then: (r: (v: void) => void) => r(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: () => {},
          then: (r: (v: void) => void) => r(),
        }),
      }),
    }),
  };
}

mock.module('../../../../../src/db', () => ({ db: buildMockDb() }));
mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../../../src/services/paths', () => ({
  REPO_ROOT: '/fake/repo',
  SKILLS_ROOT: '/fake/repo/backend/skills',
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
  TECH_SKILLS_DIR: '/fake/repo/backend/skills/tech-skills',
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../../../src/agent/km/skills/skill-creator');
  app = new Hono();
  app.route('/api/skill-creator', mod.default);
}

// ── Tests: POST /api/skill-creator/chat ─────────────────────────────────────

describe('POST /api/skill-creator/chat', () => {
  beforeEach(async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        reply: 'What kind of skill do you want to create?',
        phase: 'interview',
        draft: null,
      }),
    };
    mockGenerateTextQueue = [];
    generateTextCallCount = 0;
    mockValidationResult = { valid: true, errors: [], warnings: [], infos: [] };
    mockValidationQueue = [];
    await setupApp();
  });

  test('starts new session when no session_id provided', async () => {
    const { status, body } = await postJSON(app, '/api/skill-creator/chat', {
      message: 'I want to create a broadband repair skill',
    });
    expect(status).toBe(200);
    expect(body.session_id).toBeDefined();
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id).toStartWith('sc-');
  });

  test('continues existing session with session_id', async () => {
    // First call to create session
    const first = await postJSON(app, '/api/skill-creator/chat', {
      message: 'Create a new skill',
    });
    expect(first.status).toBe(200);
    const sessionId = first.body.session_id;

    // Second call to continue
    const second = await postJSON(app, '/api/skill-creator/chat', {
      message: 'It should handle broadband repair',
      session_id: sessionId,
    });
    expect(second.status).toBe(200);
    expect(second.body.session_id).toBe(sessionId);
  });

  test('returns reply and phase (interview)', async () => {
    const { status, body } = await postJSON(app, '/api/skill-creator/chat', {
      message: 'I want to create a new skill',
    });
    expect(status).toBe(200);
    expect(body.reply).toBeDefined();
    expect(typeof body.reply).toBe('string');
    expect(body.phase).toBe('interview');
  });

  test('returns draft object when phase transitions to draft', async () => {
    mockGenerateTextResult = {
      text: JSON.stringify({
        reply: 'Here is the draft for your skill.',
        phase: 'draft',
        draft: {
          skill_name: 'broadband-repair',
          skill_md: '---\nname: broadband-repair\ndescription: Handle broadband repairs\nmetadata:\n  version: "1.0.0"\n  tags: [broadband]\n  mode: inbound\n  trigger: user_intent\n  channels: ["online"]\n---\n\n# Broadband Repair',
          references: [],
          assets: [],
          description: 'Broadband repair skill',
          test_cases: [],
        },
      }),
    };
    const { status, body } = await postJSON(app, '/api/skill-creator/chat', {
      message: 'Generate the skill now',
    });
    expect(status).toBe(200);
    expect(body.phase).toBe('draft');
    expect(body.draft).toBeDefined();
    expect(body.draft.skill_name).toBe('broadband-repair');
    expect(body.draft.skill_md).toContain('broadband-repair');
  });

  test('auto-reviews and repairs invalid draft in the same round', async () => {
    mockGenerateTextQueue = [
      {
        text: JSON.stringify({
          reply: 'Here is the first draft for your skill.',
          phase: 'draft',
          draft: {
            skill_name: 'broadband-repair',
            skill_md: '---\nname: broadband-repair\ndescription: Handle broadband repairs\nmetadata:\n  version: "1.0.0"\n  tags: [broadband]\n  mode: inbound\n  trigger: user_intent\n  channels: ["online"]\n---\n\n# Invalid Draft',
            references: [],
            assets: [],
            description: 'Broadband repair skill',
            test_cases: [],
          },
        }),
      },
      {
        text: JSON.stringify({
          reply: '正在生成技能草稿，内容较多，请耐心等待……\n\n我已经修正了结构问题，这版可以继续评审。',
          phase: 'draft',
          draft: {
            skill_name: 'broadband-repair',
            skill_md: '---\nname: broadband-repair\ndescription: Handle broadband repairs\nmetadata:\n  version: "1.0.1"\n  tags: [broadband]\n  mode: inbound\n  trigger: user_intent\n  channels: ["online"]\n---\n\n# Repaired Draft',
            references: [{ filename: 'repair-guide.md', content: '# Repair Guide' }],
            assets: [],
            description: 'Broadband repair skill',
            test_cases: [],
          },
        }),
      },
    ];
    mockValidationQueue = [
      {
        valid: false,
        errors: [{ rule: 'missing_state_diagram', message: 'Missing state diagram', severity: 'error', location: 'SKILL.md:8' }],
        warnings: [],
        infos: [],
      },
      {
        valid: true,
        errors: [],
        warnings: [],
        infos: [],
      },
      {
        valid: true,
        errors: [],
        warnings: [],
        infos: [],
      },
    ];

    const { status, body } = await postJSON(app, '/api/skill-creator/chat', {
      message: 'Generate the skill now',
    });

    expect(status).toBe(200);
    expect(generateTextCallCount).toBe(2);
    expect(body.phase).toBe('draft');
    expect(body.reply).toContain('修正');
    expect(body.draft.skill_md).toContain('Repaired Draft');
    expect(body.validation.valid).toBe(true);
  });

  test('returns 400 when message is empty/whitespace', async () => {
    const { status, body } = await postJSON(app, '/api/skill-creator/chat', {
      message: '   ',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ── Tests: POST /api/skill-creator/save ─────────────────────────────────────

describe('POST /api/skill-creator/save', () => {
  beforeEach(async () => {
    mockSkillRegistry = undefined; // new skill
    mockGenerateTextQueue = [];
    generateTextCallCount = 0;
    mockValidationResult = { valid: true, errors: [], warnings: [], infos: [] };
    mockValidationQueue = [];
    mockToolsOverview = [];
    createNewSkillVersionCalled = false;
    createVersionFromCalled = false;
    writeVersionFileCalled = false;
    mockInserted = [];
    await setupApp();
  });

  test('returns 400 when skill_name is not kebab-case', async () => {
    const { status, body } = await postJSON(app, '/api/skill-creator/save', {
      skill_name: 'InvalidName',
      skill_md: '# Skill',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('kebab-case');
  });

  test('returns 422 when SKILL.md fails structural validation', async () => {
    mockValidationResult = {
      valid: false,
      errors: [{ rule: 'frontmatter_required', message: 'Missing frontmatter', severity: 'error', location: 'SKILL.md:1' }],
      warnings: [],
      infos: [],
    };
    const { status, body } = await postJSON(app, '/api/skill-creator/save', {
      skill_name: 'test-skill',
      skill_md: '# Missing frontmatter',
    });
    expect(status).toBe(422);
    expect(body.error).toContain('校验未通过');
    expect(body.validation_errors).toBeDefined();
    expect(body.validation_errors.length).toBeGreaterThan(0);
  });

  test('saves skill directory with SKILL.md, references, and version record', async () => {
    mockSkillRegistry = undefined; // new skill
    const { status, body } = await postJSON(app, '/api/skill-creator/save', {
      skill_name: 'new-skill',
      skill_md: '---\nname: new-skill\ndescription: A new skill\n---\n# New Skill',
      references: [{ filename: 'guide.md', content: '# Guide' }],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.skill_id).toBe('new-skill');
    expect(body.is_new).toBe(true);
  });

  test('auto-creates test cases from draft', async () => {
    mockSkillRegistry = undefined; // new skill
    const { status, body } = await postJSON(app, '/api/skill-creator/save', {
      skill_name: 'auto-test-skill',
      skill_md: '---\nname: auto-test-skill\ndescription: Test\n---\n# Skill',
      test_cases: [
        {
          input: 'How do I check my bill?',
          assertions: [{ type: 'contains', value: 'bill' }],
        },
      ],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.test_cases_count).toBe(1);
    // Check that insert was called with test case data
    const tcInsert = mockInserted.find(r => r.skill_name === 'auto-test-skill' && r.input_message);
    expect(tcInsert).toBeDefined();
    expect(tcInsert!.input_message).toBe('How do I check my bill?');
  });
});
