/**
 * API tests for: src/agent/km/skills/sandbox.ts
 * Routes: POST create, GET/PUT content, POST test/validate/publish/regression, DELETE
 * Mock: fs, runAgent, db(testCases, testPersonas), mock-engine, tools-overview
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../helpers';
import { tableStubs, pathsStubs, engineStubs } from '../mock-db-stubs';

// ── Track fs calls ──────────────────────────────────────────────────────────

let existingPaths: Set<string> = new Set();
let fileContents: Map<string, string> = new Map();
let copiedPaths: Array<{ src: string; dest: string }> = [];
let createdDirs: string[] = [];
let removedPaths: string[] = [];
let writtenFiles: Map<string, string> = new Map();

// ── Mock runAgent result ────────────────────────────────────────────────────

let mockRunAgentResult = {
  text: 'mock agent response',
  card: null as unknown,
  skill_diagram: null as unknown,
  toolRecords: [] as Array<{ tool: string; args?: Record<string, unknown> }>,
  transferData: null as unknown,
};
let mockRunAgentShouldThrow = false;

// ── Mock DB for regression tests ────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentTestCases: Row[] = [];

function buildMockDb() {
  const chain = (data: Row[] = []) => ({
    from: () => chain(data),
    where: (_cond?: unknown) => chain(currentTestCases),
    orderBy: () => chain(data),
    limit: (n: number) => chain(data.slice(0, n)),
    offset: (n: number) => chain(data.slice(n)),
    get: () => data[0] ?? null,
    then: (resolve: (v: Row[]) => void) => resolve(data),
    [Symbol.iterator]: () => data[Symbol.iterator](),
  });
  return {
    select: (fields?: unknown) => chain(),
    insert: () => ({
      values: (v: Row | Row[]) => ({
        returning: () => ({ then: (r: (v: Row[]) => void) => r(Array.isArray(v) ? v : [v]) }),
        then: (r: (v: void) => void) => r(),
      }),
    }),
    update: () => ({
      set: (v: Row) => ({
        where: () => ({ then: (r: (v: void) => void) => r() }),
        then: (r: (v: void) => void) => r(),
      }),
    }),
    delete: () => ({
      where: () => ({ then: (r: (v: void) => void) => r() }),
    }),
    $count: () => 0,
  };
}

// ── Mock tools overview ─────────────────────────────────────────────────────

let mockToolsOverview: Array<{ name: string; status: string; source: string }> = [];

// ── Mock fs modules ─────────────────────────────────────────────────────────

const fsMock = {
  readFile: async (absPath: string, _enc?: string) => {
    const content = fileContents.get(absPath);
    if (content === undefined) throw new Error(`ENOENT: no such file '${absPath}'`);
    return content;
  },
  writeFile: async (absPath: string, content: string, _enc?: string) => {
    writtenFiles.set(absPath, content);
    fileContents.set(absPath, content);
  },
  mkdir: async (absPath: string, _opts?: unknown) => {
    createdDirs.push(absPath);
  },
  cp: async (src: string, dest: string, _opts?: unknown) => {
    copiedPaths.push({ src, dest });
  },
  rm: async (absPath: string, _opts?: unknown) => {
    removedPaths.push(absPath);
  },
  readdir: async () => [],
  stat: async () => ({ isDirectory: () => false, isFile: () => true }),
  unlink: async () => {},
  access: async () => {},
  appendFile: async () => {},
  chmod: async () => {},
  chown: async () => {},
  copyFile: async () => {},
  lstat: async () => ({ isDirectory: () => false, isFile: () => true }),
  realpath: async (p: string) => p,
  rename: async () => {},
  rmdir: async () => {},
  constants: {},
};
mock.module('node:fs/promises', () => ({ default: fsMock, ...fsMock }));

const fsSyncMock = {
  existsSync: (p: string) => existingPaths.has(p),
  readFileSync: () => '',
  writeFileSync: () => {},
  readdirSync: () => [],
  statSync: () => ({ isDirectory: () => false, isFile: () => true }),
  mkdirSync: () => {},
  constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
};
mock.module('node:fs', () => ({ default: fsSyncMock, ...fsSyncMock }));

mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../src/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

const FAKE_REPO = '/fake/repo';
mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: FAKE_REPO,
}));

mock.module('../../../src/engine-stubs', () => ({ ...engineStubs,
  runAgent: async (..._args: unknown[]) => {
    if (mockRunAgentShouldThrow) throw new Error('agent boom');
    return mockRunAgentResult;
  },
}));

mock.module('../../../src/mock-engine', () => ({
  getRegisteredToolNames: () => ['query_bill', 'query_subscriber'],
}));

mock.module('../../../src/mcp/tools-overview', () => ({
  getToolsOverview: () => mockToolsOverview,
}));

mock.module('../../../src/db', () => ({ db: buildMockDb(), ...tableStubs }));

// ── App setup ───────────────────────────────────────────────────────────────

let app: Hono;

// We need to track sandbox IDs created during tests
let lastSandboxId: string | null = null;

async function createSandbox(skillPath: string): Promise<string> {
  existingPaths.add(`${FAKE_REPO}/${skillPath}`);
  const { body } = await postJSON(app, '/api/sandbox/create', { skill_path: skillPath });
  const b = body as any;
  lastSandboxId = b.sandbox_id;
  return b.sandbox_id;
}

beforeEach(async () => {
  existingPaths = new Set();
  fileContents = new Map();
  copiedPaths = [];
  createdDirs = [];
  removedPaths = [];
  writtenFiles = new Map();
  mockRunAgentShouldThrow = false;
  mockRunAgentResult = {
    text: 'mock agent response',
    card: null,
    skill_diagram: null,
    toolRecords: [],
    transferData: null,
  };
  currentTestCases = [];
  mockToolsOverview = [];
  lastSandboxId = null;

  const mod = await import('../../../src/skills/sandbox');
  app = new Hono();
  app.route('/api/sandbox', mod.default);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/sandbox/create', () => {
  test('creates sandbox directory from skill and returns sandbox id', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    existingPaths.add(`${FAKE_REPO}/${skillPath}`);

    const { status, body } = await postJSON(app, '/api/sandbox/create', { skill_path: skillPath });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.sandbox_id).toBeDefined();
    expect(typeof b.sandbox_id).toBe('string');
    expect(b.sandbox_dir).toBeDefined();
    expect(copiedPaths.length).toBeGreaterThan(0);
  });
});

describe('GET /api/sandbox/:id/content', () => {
  test('returns SKILL.md content from sandbox', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    // Set up the file content at the sandbox location
    // The sandbox stores files at: sandboxDir/biz-skills/bill-inquiry/SKILL.md
    const sandboxRoot = `${FAKE_REPO}/backend/skills/.sandbox`;
    // We need to find any path matching the pattern
    const skillMdGlob = `${sandboxRoot}/${id}/biz-skills/bill-inquiry/SKILL.md`;
    fileContents.set(skillMdGlob, '---\nname: bill-inquiry\n---\n# Bill Inquiry');

    const { status, body } = await getJSON(app, `/api/sandbox/${id}/content`);
    expect(status).toBe(200);
    const b = body as any;
    expect(b.content).toBe('---\nname: bill-inquiry\n---\n# Bill Inquiry');
  });

  test('returns 404 for non-existent sandbox', async () => {
    const { status, body } = await getJSON(app, '/api/sandbox/nonexistent/content');
    expect(status).toBe(404);
    expect((body as any).error).toBeDefined();
  });
});

describe('PUT /api/sandbox/:id/content', () => {
  test('writes updated SKILL.md to sandbox', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    const { status, body } = await putJSON(app, `/api/sandbox/${id}/content`, {
      content: '---\nname: bill-inquiry\n---\n# Updated Content',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    // Verify writeFile was called
    expect(writtenFiles.size).toBeGreaterThan(0);
  });
});

describe('POST /api/sandbox/:id/validate', () => {
  test('validates YAML frontmatter, mermaid syntax, tool references', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    // Set up valid SKILL.md content
    const sandboxRoot = `${FAKE_REPO}/backend/skills/.sandbox`;
    const skillMdPath = `${sandboxRoot}/${id}/biz-skills/bill-inquiry/SKILL.md`;
    const validContent = `---
name: bill-inquiry
description: test
metadata:
  version: "1.0.0"
---

# Bill Inquiry Skill

This is a valid skill file with enough content to pass the minimum length check.

\`\`\`mermaid
stateDiagram-v2
  [*] --> QueryBill
  QueryBill --> [*]
  %% tool:query_bill
\`\`\`
`;
    fileContents.set(skillMdPath, validContent);
    mockToolsOverview = [{ name: 'query_bill', status: 'available', source: 'account_service' }];

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/validate`, {});
    expect(status).toBe(200);
    const b = body as any;
    expect(b).toHaveProperty('valid');
    expect(b).toHaveProperty('issues');
    expect(b.issues).toBeArray();
  });

  test('returns errors array for invalid SKILL.md', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    const sandboxRoot = `${FAKE_REPO}/backend/skills/.sandbox`;
    const skillMdPath = `${sandboxRoot}/${id}/biz-skills/bill-inquiry/SKILL.md`;
    // Invalid: no frontmatter, short content
    fileContents.set(skillMdPath, 'short');

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/validate`, {});
    expect(status).toBe(200);
    const b = body as any;
    expect(b.valid).toBe(false);
    expect(b.issues.length).toBeGreaterThan(0);
    // Should report missing frontmatter
    expect(b.issues.some((i: string) => i.includes('frontmatter') || i.includes('---'))).toBe(true);
  });

  test('returns valid:true for correct SKILL.md', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    const sandboxRoot = `${FAKE_REPO}/backend/skills/.sandbox`;
    const skillMdPath = `${sandboxRoot}/${id}/biz-skills/bill-inquiry/SKILL.md`;
    const validContent = `---
name: bill-inquiry
description: test skill
metadata:
  version: "1.0.0"
---

# Bill Inquiry

This is a complete and valid skill document with sufficient content length for passing validation checks.

\`\`\`mermaid
stateDiagram-v2
  [*] --> QueryBill
  QueryBill --> [*]
\`\`\`
`;
    fileContents.set(skillMdPath, validContent);

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/validate`, {});
    expect(status).toBe(200);
    expect((body as any).valid).toBe(true);
    expect((body as any).issues).toEqual([]);
  });
});

describe('POST /api/sandbox/:id/test', () => {
  test('runs agent with sandbox skills dir and returns response', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    mockRunAgentResult = {
      text: 'Your bill is 120 yuan',
      card: { type: 'bill_card', data: { total: 120 } },
      skill_diagram: null,
      toolRecords: [{ tool: 'query_bill' }],
      transferData: null,
    };

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/test`, {
      message: 'Check my bill',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.text).toBe('Your bill is 120 yuan');
    expect(b.card).toBeDefined();
    expect(b.mock).toBe(true);
  });
});

describe('POST /api/sandbox/:id/regression', () => {
  test('runs all test cases and returns pass/fail results', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    currentTestCases = [
      {
        id: 1,
        skill_name: 'bill-inquiry',
        input_message: 'Check my bill',
        expected_keywords: '["bill","yuan"]',
        assertions: null,
        persona_id: null,
      },
    ];

    mockRunAgentResult = {
      text: 'Your bill is 120 yuan',
      card: null,
      skill_diagram: null,
      toolRecords: [],
      transferData: null,
    };

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/regression`, {
      delay_ms: 0,
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b).toHaveProperty('total');
    expect(b).toHaveProperty('passed');
    expect(b).toHaveProperty('failed');
    expect(b).toHaveProperty('results');
    expect(b.total).toBe(1);
    expect(b.passed).toBe(1);
  });

  test('supports assertion types: contains, not_contains, tool_called, regex', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    currentTestCases = [
      {
        id: 2,
        skill_name: 'bill-inquiry',
        input_message: 'Check my bill',
        expected_keywords: '[]',
        assertions: JSON.stringify([
          { type: 'contains', value: 'bill' },
          { type: 'not_contains', value: 'error' },
          { type: 'tool_called', value: 'query_bill' },
          { type: 'regex', value: '\\d+' },
        ]),
        persona_id: null,
      },
    ];

    mockRunAgentResult = {
      text: 'Your bill is 120 yuan',
      card: null,
      skill_diagram: null,
      toolRecords: [{ tool: 'query_bill' }],
      transferData: null,
    };

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/regression`, {
      delay_ms: 0,
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.total).toBe(1);
    expect(b.passed).toBe(1);
    // Check individual assertion results
    const result = b.results[0];
    expect(result.assertions).toBeArray();
    expect(result.assertions.length).toBe(4);
    expect(result.assertions.every((a: any) => a.passed)).toBe(true);
  });
});

describe('POST /api/sandbox/:id/publish', () => {
  test('copies sandbox to production and cleans up sandbox dir', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    const { status, body } = await postJSON(app, `/api/sandbox/${id}/publish`, {});
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    // Sandbox dir should be removed
    expect(removedPaths.length).toBeGreaterThan(0);
  });
});

describe('DELETE /api/sandbox/:id', () => {
  test('removes sandbox directory', async () => {
    const skillPath = 'backend/skills/biz-skills/bill-inquiry/SKILL.md';
    const id = await createSandbox(skillPath);

    const { status, body } = await deleteJSON(app, `/api/sandbox/${id}`);
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
    expect(removedPaths.length).toBeGreaterThan(0);

    // Verify sandbox is gone — subsequent GET should 404
    const { status: s2 } = await getJSON(app, `/api/sandbox/${id}/content`);
    expect(s2).toBe(404);
  });
});
