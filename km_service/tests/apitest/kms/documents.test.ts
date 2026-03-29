/**
 * API tests for: src/agent/km/kms/documents.ts
 * Routes: GET/POST /api/km/documents, GET/PUT /api/km/documents/:id, POST versions, POST parse
 * Mock: db(kmDocuments, kmDocVersions, kmCandidates), fs(readFile)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON } from '../helpers';
import { tableStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const DOC = {
  id: 'doc-001', title: '套餐资费说明', source: 'upload', classification: 'internal',
  owner: 'admin', status: 'active', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
};

const DOC_VERSION = {
  id: 'dv-001', document_id: 'doc-001', version_no: 1, scope_json: null,
  effective_from: null, effective_to: null, diff_summary: null, status: 'draft',
  file_path: '/skills/test.md', created_at: '2026-03-01T00:00:00Z',
};

// ── Mutable mock state ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentRows: Row[] = [];
let currentCountVal = 0;

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
        return { from: () => ({ then: (r: (v: Row[]) => void) => r([{ count: currentCountVal }]) }) };
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
    $count: () => currentCountVal,
  };
}

const mockDb = buildMockDb();

mock.module('../../../src/db', () => ({ db: mockDb, ...tableStubs }));
mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../src/routes/helpers', () => ({
  nanoid: () => 'test-id-001',
  writeAudit: async () => {},
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[], countVal = 0) {
  currentRows = rows;
  currentCountVal = countVal;
  const mod = await import('../../../src/routes/documents');
  app = new Hono();
  app.route('/api/km/documents', mod.default);
}

describe('GET /api/km/documents', () => {
  beforeEach(() => setupApp([DOC], 1));

  test('returns paginated document list', async () => {
    const { status, body } = await getJSON(app, '/api/km/documents');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('doc-001');
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
  });

  test('supports limit/offset pagination', async () => {
    const { status, body } = await getJSON(app, '/api/km/documents?page=2&size=10');
    expect(status).toBe(200);
    expect(body.page).toBe(2);
    expect(body.size).toBe(10);
  });
});

describe('POST /api/km/documents', () => {
  beforeEach(() => setupApp([]));

  test('creates document and initial version', async () => {
    const { status, body } = await postJSON(app, '/api/km/documents', {
      title: '新文档',
      source: 'upload',
      classification: 'internal',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
    expect(body.version_id).toBe('test-id-001');
  });

  test('returns 400 when title is missing', async () => {
    const { status, body } = await postJSON(app, '/api/km/documents', {
      source: 'upload',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/km/documents/:id', () => {
  test('returns document detail with metadata', async () => {
    await setupApp([DOC]);
    const { status, body } = await getJSON(app, '/api/km/documents/doc-001');
    expect(status).toBe(200);
    expect(body.id).toBe('doc-001');
    expect(body.title).toBe('套餐资费说明');
    expect(body.versions).toBeDefined();
    expect(body.linked_candidates).toBeDefined();
  });

  test('returns 404 for non-existent doc', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/documents/non-existent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('PUT /api/km/documents/:id', () => {
  beforeEach(() => setupApp([DOC]));

  test('updates document metadata (title, classification)', async () => {
    const { status, body } = await putJSON(app, '/api/km/documents/doc-001', {
      title: '更新后的标题',
      classification: 'public',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('POST /api/km/documents/:id/versions', () => {
  beforeEach(() => setupApp([DOC_VERSION]));

  test('creates new version for existing document', async () => {
    const { status, body } = await postJSON(app, '/api/km/documents/doc-001/versions', {
      diff_summary: '修改了第三章',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
    expect(body.version_no).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/km/documents/versions/:vid/parse', () => {
  beforeEach(() => setupApp([DOC_VERSION]));

  test('triggers parse pipeline (parse->chunk->generate->validate)', async () => {
    const { status, body } = await postJSON(app, '/api/km/documents/versions/dv-001/parse', {});
    expect(status).toBe(201);
    expect(body.jobs).toBeDefined();
    expect(body.jobs).toBeArrayOfSize(4);
    expect(body.jobs.map((j: { stage: string }) => j.stage)).toEqual([
      'parse', 'chunk', 'generate', 'validate',
    ]);
  });

  test('supports partial stages (parse+chunk only)', async () => {
    const { status, body } = await postJSON(app, '/api/km/documents/versions/dv-001/parse', {
      stages: ['parse', 'chunk'],
    });
    expect(status).toBe(201);
    expect(body.jobs).toBeArrayOfSize(2);
    expect(body.jobs.map((j: { stage: string }) => j.stage)).toEqual(['parse', 'chunk']);
  });
});
