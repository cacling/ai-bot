/**
 * API tests for: src/agent/km/skills/tool-bindings.ts
 * Routes: GET/PUT /api/skills/:id/tool-bindings, POST /api/skills/:id/sync-bindings
 * Mock: db(skillToolBindings), fs(readFileSync, existsSync)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, putJSON, postJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const BINDING = {
  id: 1,
  skill_id: 'bill-inquiry',
  tool_name: 'query_bill',
  call_order: 0,
  purpose: 'query',
  trigger_condition: 'user asks about bill',
  arg_mapping: null,
  result_mapping: null,
  created_at: '2026-03-01T00:00:00Z',
};

const SKILL_MD_WITH_TOOLS = `---
name: bill-inquiry
description: Query monthly bills
---

\`\`\`mermaid
stateDiagram-v2
  [*] --> QueryBill
  QueryBill: query bill %% tool:query_bill
  QueryBill --> CheckBalance: check balance %% tool:check_account_balance
  CheckBalance --> [*]
\`\`\`
`;

const SKILL_MD_NO_TOOLS = `---
name: simple-skill
description: No tools
---

# Simple Skill
`;

// ── Mutable mock state ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentRows: Row[] = [];
let mockFileExists = true;
let mockFileContent = SKILL_MD_WITH_TOOLS;

// The tool-bindings source uses synchronous db methods: .all() and .run()
function buildMockDb() {
  const chain = (data: Row[] = currentRows) => ({
    from: () => chain(data),
    where: () => chain(data),
    orderBy: () => chain(data),
    limit: (n: number) => chain(data.slice(0, n)),
    offset: (n: number) => chain(data.slice(n)),
    all: () => data,
    run: () => {},
    then: (resolve: (v: Row[]) => void) => resolve(data),
    [Symbol.iterator]: () => data[Symbol.iterator](),
  });

  return {
    select: () => chain(),
    insert: () => ({
      values: (v: Row | Row[]) => ({
        returning: () => ({
          all: () => (Array.isArray(v) ? v : [v]),
          then: (r: (v: Row[]) => void) => r(Array.isArray(v) ? v : [v]),
        }),
        run: () => {},
        then: (r: (v: void) => void) => r(),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ run: () => {}, then: (r: (v: void) => void) => r() }),
        run: () => {},
      }),
    }),
    delete: () => ({
      where: () => ({ run: () => {}, then: (r: (v: void) => void) => r() }),
      run: () => {},
    }),
    $count: () => 0,
  };
}

mock.module('../../../../../src/db', () => ({ db: buildMockDb() }));
mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../../../src/services/paths', () => ({
  BIZ_SKILLS_DIR: '/fake/repo/backend/skills/biz-skills',
}));
mock.module('node:fs', () => ({
  readFileSync: (_path: string, _enc?: string) => mockFileContent,
  existsSync: (_path: string) => mockFileExists,
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[] = []) {
  currentRows = rows;
  const mod = await import('../../../../../src/agent/km/skills/tool-bindings');
  app = new Hono();
  app.route('/api/skills', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/skills/:id/tool-bindings', () => {
  test('returns bindings array for skill', async () => {
    await setupApp([BINDING]);
    const { status, body } = await getJSON(app, '/api/skills/bill-inquiry/tool-bindings');
    expect(status).toBe(200);
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(1);
    expect(body.items[0].tool_name).toBe('query_bill');
  });

  test('returns empty array for skill with no bindings', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/skills/empty-skill/tool-bindings');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(0);
  });
});

describe('PUT /api/skills/:id/tool-bindings', () => {
  beforeEach(() => setupApp([]));

  test('updates bindings list and returns ok', async () => {
    const { status, body } = await putJSON(app, '/api/skills/bill-inquiry/tool-bindings', {
      bindings: [
        { tool_name: 'query_bill', call_order: 0, purpose: 'query' },
        { tool_name: 'check_account_balance', call_order: 1, purpose: 'check' },
      ],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
  });
});

describe('POST /api/skills/:id/sync-bindings', () => {
  test('parses SKILL.md %% tool: annotations and syncs to db', async () => {
    mockFileExists = true;
    mockFileContent = SKILL_MD_WITH_TOOLS;
    await setupApp([]);
    const { status, body } = await postJSON(app, '/api/skills/bill-inquiry/sync-bindings', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.bindings).toBeArrayOfSize(2);
    expect(body.bindings[0].tool_name).toBe('query_bill');
    expect(body.bindings[1].tool_name).toBe('check_account_balance');
  });

  test('returns count 0 when no tool annotations found', async () => {
    mockFileExists = true;
    mockFileContent = SKILL_MD_NO_TOOLS;
    await setupApp([]);
    const { status, body } = await postJSON(app, '/api/skills/simple-skill/sync-bindings', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.note).toContain('No');
  });
});
