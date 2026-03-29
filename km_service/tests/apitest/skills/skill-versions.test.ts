/**
 * API tests for: src/agent/km/skills/skill-versions.ts
 * Routes: GET /api/skill-versions/registry, GET /api/skill-versions, GET /api/skill-versions/:skill/diagram-data,
 *         GET /api/skill-versions/:skill/:versionNo, POST save-version/publish/create-from/test
 * Mock: db, fs, version-manager, mermaid, skills engine, runner, skill-workflow-compiler
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON } from '../helpers';
import { tableStubs, pathsStubs, engineStubs, versionManagerStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_REGISTRY = [
  { id: 'bill-inquiry', latest_version: 2, status: 'published' },
  { id: 'plan-query', latest_version: 1, status: 'published' },
];

const MOCK_VERSIONS = [
  { version_no: 1, skill_id: 'bill-inquiry', status: 'published', snapshot_path: '.versions/bill-inquiry/v1', description: 'Initial', operator: 'system', created_at: '2026-03-01' },
  { version_no: 2, skill_id: 'bill-inquiry', status: 'draft', snapshot_path: '.versions/bill-inquiry/v2', description: 'Draft edit', operator: 'user', created_at: '2026-03-02' },
];

const MOCK_VERSION_DETAIL = {
  version_no: 1,
  skill_id: 'bill-inquiry',
  status: 'published',
  snapshot_path: '.versions/bill-inquiry/v1',
  description: 'Initial',
};

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockVersionList: typeof MOCK_VERSIONS = [];
let mockVersionDetail: typeof MOCK_VERSION_DETAIL | null = null;
let mockRegistryList: typeof MOCK_REGISTRY = [];
let markSavedCalled = false;
let publishResult: { success: boolean; error?: string } = { success: true };
let createFromResult: { versionNo: number; snapshotPath: string } = { versionNo: 3, snapshotPath: '.versions/bill-inquiry/v3' };
let mockMermaid: string | null = null;
let mockRunAgentResult = { text: 'Hello from agent', card: null, skill_diagram: null };

// ── Mock version-manager ────────────────────────────────────────────────────

mock.module('../../../src/skills/version-manager', () => ({ ...versionManagerStubs,
  listSkillRegistry: () => mockRegistryList,
  getVersionList: async (_skillId: string) => mockVersionList,
  getVersionDetail: (_skillId: string, _versionNo: number) => mockVersionDetail,
  markVersionSaved: (_skill: string, _vNo: number) => { markSavedCalled = true; },
  publishVersion: async (_skill: string, _vNo: number, _op: string) => publishResult,
  createVersionFrom: async (_skill: string, _from: number, _desc: string, _op: string) => createFromResult,
}));

// ── Mock fs ─────────────────────────────────────────────────────────────────

let mockReaddirEntries: Array<{ name: string; isDirectory: () => boolean }> = [];
let mockReadFileSync: string = '---\nname: bill-inquiry\n---\n# Bill Inquiry';

mock.module('node:fs/promises', () => ({
  readdir: async (_path: string, _opts?: unknown) => mockReaddirEntries,
  stat: async (_path: string) => ({ mtime: new Date(), isDirectory: () => true }),
}));

mock.module('node:fs', () => ({
  readFileSync: (_path: string, _enc?: string) => mockReadFileSync,
  mkdtempSync: (_prefix: string) => '/tmp/skill-test-abc123',
  cpSync: () => {},
  rmSync: () => {},
}));

// ── Mock engine modules (dynamic imports) ───────────────────────────────────

mock.module('../../../src/engine-stubs', () => ({ ...engineStubs,
  getSkillMermaid: (skillId: string) => mockMermaid,
  SOP_ENFORCEMENT_SUFFIX: '\n---SOP---',
  refreshSkillsCache: () => {},
  syncSkillMetadata: () => {},
}));

mock.module('../../../src/mermaid', () => ({
  stripMermaidMarkers: (m: string) => m.replace(/%%.*/g, '').trim(),
  buildNodeTypeMap: (_spec: unknown) => ({ S1: 'action', S2: 'branch' }),
}));

mock.module('../../../src/skill-workflow-compiler', () => ({
  compileWorkflow: (_md: string, _skill: string, _vNo: number) => ({
    spec: { states: [] },
    errors: [],
    warnings: [],
  }),
}));

mock.module('../../../src/engine-stubs', () => ({ ...engineStubs,
  runAgent: async () => mockRunAgentResult,
}));

mock.module('node:os', () => ({
  tmpdir: () => '/tmp',
}));

// ── Mock db (used in diagram-data for .get() and publish for .run()) ────────

type Row = Record<string, unknown>;

function buildMockDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ spec_json: JSON.stringify({ states: [] }), status: 'published' }),
          then: (r: (v: Row[]) => void) => r([]),
        }),
        then: (r: (v: Row[]) => void) => r([]),
      }),
    }),
    insert: () => ({
      values: (_v: Row | Row[]) => ({
        returning: () => ({ then: (r: (v: Row[]) => void) => r([]) }),
        run: () => {},
        then: (r: (v: void) => void) => r(),
      }),
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

mock.module('../../../src/db', () => ({ db: buildMockDb(), ...tableStubs }));
mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/fake/repo',
  SKILLS_ROOT: '/fake/repo/backend/skills',
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp() {
  const mod = await import('../../../src/skills/skill-versions');
  app = new Hono();
  app.route('/api/skill-versions', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/skill-versions/registry', () => {
  beforeEach(async () => {
    mockRegistryList = [...MOCK_REGISTRY];
    await setupApp();
  });

  test('returns skill registry list', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions/registry');
    expect(status).toBe(200);
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(2);
    expect(body.items[0].id).toBe('bill-inquiry');
  });
});

describe('GET /api/skill-versions', () => {
  beforeEach(async () => {
    mockVersionList = [...MOCK_VERSIONS];
    await setupApp();
  });

  test('returns version list for given skill query param', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions?skill=bill-inquiry');
    expect(status).toBe(200);
    expect(body.skill).toBe('bill-inquiry');
    expect(body.versions).toBeDefined();
    expect(Array.isArray(body.versions)).toBe(true);
    expect(body.total).toBe(2);
  });

  test('returns 400 when skill param is missing', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions');
    expect(status).toBe(400);
    expect(body.error).toContain('skill');
  });
});

describe('GET /api/skill-versions/:skill/diagram-data', () => {
  beforeEach(async () => {
    await setupApp();
  });

  test('returns stripped mermaid and nodeTypeMap', async () => {
    mockMermaid = 'stateDiagram-v2\n  [*] --> S1\n  %% tool:check_balance';
    const { status, body } = await getJSON(app, '/api/skill-versions/bill-inquiry/diagram-data');
    expect(status).toBe(200);
    expect(body.mermaid).toBeDefined();
    expect(typeof body.mermaid).toBe('string');
    expect(body.nodeTypeMap).toBeDefined();
    expect(body.nodeTypeMap.S1).toBe('action');
  });

  test('returns 404 for non-existent skill', async () => {
    mockMermaid = null;
    const { status, body } = await getJSON(app, '/api/skill-versions/nonexistent/diagram-data');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/skill-versions/:skill/:versionNo', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    mockReaddirEntries = [
      { name: 'SKILL.md', isDirectory: () => false },
      { name: 'references', isDirectory: () => true },
    ];
    await setupApp();
  });

  test('returns version detail with files', async () => {
    const { status, body } = await getJSON(app, '/api/skill-versions/bill-inquiry/1');
    expect(status).toBe(200);
    expect(body.version).toBeDefined();
    expect(body.version.version_no).toBe(1);
    expect(body.tree).toBeDefined();
    expect(Array.isArray(body.tree)).toBe(true);
  });
});

describe('POST /api/skill-versions/save-version', () => {
  beforeEach(async () => {
    markSavedCalled = false;
    await setupApp();
  });

  test('marks version as saved in db', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/save-version', {
      skill: 'bill-inquiry',
      version_no: 2,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(markSavedCalled).toBe(true);
  });
});

describe('POST /api/skill-versions/publish', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    publishResult = { success: true };
    await setupApp();
  });

  test('publishes version and compiles workflow spec', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/publish', {
      skill: 'bill-inquiry',
      version_no: 1,
      operator: 'admin',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('rejects publish when publishVersion returns failure', async () => {
    publishResult = { success: false, error: '存在 .draft 文件' };
    const { status, body } = await postJSON(app, '/api/skill-versions/publish', {
      skill: 'bill-inquiry',
      version_no: 1,
    });
    expect(status).toBe(400);
    expect(body.error).toContain('.draft');
  });
});

describe('POST /api/skill-versions/create-from', () => {
  beforeEach(async () => {
    createFromResult = { versionNo: 3, snapshotPath: '.versions/bill-inquiry/v3' };
    await setupApp();
  });

  test('creates new version by copying from existing', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/create-from', {
      skill: 'bill-inquiry',
      from_version: 1,
      description: 'Test copy',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.versionNo).toBe(3);
  });
});

describe('POST /api/skill-versions/test', () => {
  beforeEach(async () => {
    mockVersionDetail = { ...MOCK_VERSION_DETAIL };
    mockRunAgentResult = { text: 'Test response from agent', card: null, skill_diagram: null };
    mockReadFileSync = '---\nname: bill-inquiry\n---\n# Bill Inquiry';
    await setupApp();
  });

  test('runs agent with test message and returns response', async () => {
    const { status, body } = await postJSON(app, '/api/skill-versions/test', {
      skill: 'bill-inquiry',
      version_no: 1,
      message: 'How much is my bill?',
    });
    expect(status).toBe(200);
    expect(body.text).toBe('Test response from agent');
    expect(body.mock).toBe(true);
  });
});
