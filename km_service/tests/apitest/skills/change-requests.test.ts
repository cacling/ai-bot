/**
 * API tests for: src/agent/km/skills/change-requests.ts
 * Routes: GET /api/change-requests, GET /:id, POST /:id/approve, POST /:id/reject
 * Mock: db(changeRequests), auth(requireRole), fs(writeFile)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON } from '../helpers';
import { tableStubs, pathsStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const PENDING_CR = {
  id: 1,
  skill_id: 'bill-inquiry',
  skill_path: 'backend/skills/biz-skills/bill-inquiry/SKILL.md',
  old_content: '# Old content',
  new_content: '# New content',
  diff_summary: 'Updated section 3',
  status: 'pending',
  submitter: 'editor1',
  reviewer: null,
  reviewed_at: null,
  risk_label: null,
  created_at: '2026-03-01T00:00:00Z',
};

const APPROVED_CR = {
  ...PENDING_CR,
  id: 2,
  status: 'approved',
  reviewer: 'reviewer1',
  reviewed_at: '2026-03-02T00:00:00Z',
};

const REJECTED_CR = {
  ...PENDING_CR,
  id: 3,
  status: 'rejected',
  reviewer: 'reviewer1',
  reviewed_at: '2026-03-02T00:00:00Z',
};

// ── Mutable mock state ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentRows: Row[] = [];
let writeFileCalled = false;

function buildMockDb() {
  const chain = (data: Row[] = currentRows) => ({
    from: () => chain(data),
    where: () => chain(data),
    orderBy: () => chain(data),
    limit: (n: number) => chain(data.slice(0, n)),
    offset: (n: number) => chain(data.slice(n)),
    then: (resolve: (v: Row[]) => void) => resolve(data),
    [Symbol.iterator]: () => data[Symbol.iterator](),
  });

  return {
    select: (fields?: unknown) => {
      if (fields && typeof fields === 'object' && 'count' in (fields as any)) {
        return { from: () => ({ then: (r: (v: Row[]) => void) => r([{ count: 0 }]) }) };
      }
      return chain();
    },
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

mock.module('../../../src/db', () => ({ db: buildMockDb(), ...tableStubs }));
mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../src/auth', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));
mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/fake/repo',
}));
// Mock both specifier forms to handle dynamic import('node:fs/promises')
const fsMock = () => {
  const writeFile = async (_path: string, _content: string, _enc?: string) => {
    writeFileCalled = true;
  };
  return {
    writeFile,
    readFile: async () => '',
    readdir: async () => [],
    stat: async () => ({ mtime: new Date(), isDirectory: () => true }),
    rm: async () => {},
  };
};
mock.module('node:fs/promises', fsMock);
mock.module('fs/promises', fsMock);

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[] = []) {
  currentRows = rows;
  writeFileCalled = false;
  const mod = await import('../../../src/skills/change-requests');
  app = new Hono();
  app.route('/api/change-requests', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/change-requests', () => {
  test('returns list of change requests', async () => {
    await setupApp([PENDING_CR]);
    const { status, body } = await getJSON(app, '/api/change-requests');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].status).toBe('pending');
  });

  test('supports status filter (pending/approved/rejected)', async () => {
    await setupApp([APPROVED_CR]);
    const { status, body } = await getJSON(app, '/api/change-requests?status=approved');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /api/change-requests/:id', () => {
  test('returns change request detail with diff', async () => {
    await setupApp([PENDING_CR]);
    const { status, body } = await getJSON(app, '/api/change-requests/1');
    expect(status).toBe(200);
    expect(body.id).toBe(1);
    expect(body.old_content).toBeDefined();
    expect(body.new_content).toBeDefined();
    expect(body.status).toBe('pending');
  });

  test('returns 404 for non-existent id', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/change-requests/999');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/change-requests/:id/approve', () => {
  test('approves request and applies diff to file', async () => {
    await setupApp([PENDING_CR]);
    const { status, body } = await postJSON(app, '/api/change-requests/1/approve', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.versionId).toBeDefined();
    expect(writeFileCalled).toBe(true);
  });

  test('returns 400 for already-approved request', async () => {
    await setupApp([APPROVED_CR]);
    const { status, body } = await postJSON(app, '/api/change-requests/2/approve', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.error).toContain('approved');
  });
});

describe('POST /api/change-requests/:id/reject', () => {
  test('rejects request with reason', async () => {
    await setupApp([PENDING_CR]);
    const { status, body } = await postJSON(app, '/api/change-requests/1/reject', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('returns 400 for already-rejected request', async () => {
    await setupApp([REJECTED_CR]);
    const { status, body } = await postJSON(app, '/api/change-requests/3/reject', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.error).toContain('rejected');
  });
});
