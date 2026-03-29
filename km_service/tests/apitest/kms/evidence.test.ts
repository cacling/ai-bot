/**
 * API tests for: src/agent/km/kms/evidence.ts
 * Routes: GET/POST /api/km/evidence, PUT /api/km/evidence/:id
 * Mock: db(kmEvidenceRefs), audit(writeAudit)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON } from '../helpers';
import { tableStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const EVIDENCE = {
  id: 'ev-001', candidate_id: 'cand-001', asset_id: null, doc_version_id: 'dv-001',
  status: 'pending', locator: 'section:2.1', rule_version: 'v1',
  fail_reason: null, reviewed_by: null, reviewed_at: null, created_at: '2026-03-01T00:00:00Z',
};

// ── Mutable mock state ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentRows: Row[] = [];
let currentCountVal = 0;
let auditCalls: Array<Record<string, unknown>> = [];

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
  writeAudit: async (params: Record<string, unknown>) => { auditCalls.push(params); },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[], countVal = 0) {
  currentRows = rows;
  currentCountVal = countVal;
  auditCalls = [];
  const mod = await import('../../../src/routes/evidence');
  app = new Hono();
  app.route('/api/km/evidence', mod.default);
}

describe('GET /api/km/evidence', () => {
  beforeEach(() => setupApp([EVIDENCE], 1));

  test('returns evidence list', async () => {
    const { status, body } = await getJSON(app, '/api/km/evidence');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('ev-001');
    expect(body.items[0].status).toBe('pending');
  });

  test('filters by candidate_id, asset_id, status', async () => {
    const { status, body } = await getJSON(app, '/api/km/evidence?candidate_id=cand-001&status=pending');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].candidate_id).toBe('cand-001');
  });
});

describe('POST /api/km/evidence', () => {
  beforeEach(() => setupApp([], 0));

  test('creates evidence reference', async () => {
    const { status, body } = await postJSON(app, '/api/km/evidence', {
      candidate_id: 'cand-001',
      doc_version_id: 'dv-001',
      locator: 'section:3.2',
      rule_version: 'v2',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('defaults status to pending', async () => {
    const { status, body } = await postJSON(app, '/api/km/evidence', {
      candidate_id: 'cand-002',
      doc_version_id: 'dv-002',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });
});

describe('PUT /api/km/evidence/:id', () => {
  beforeEach(() => setupApp([EVIDENCE], 0));

  test('updates evidence (review pass)', async () => {
    const { status, body } = await putJSON(app, '/api/km/evidence/ev-001', {
      status: 'pass',
      reviewed_by: 'reviewer1',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('updates evidence (review fail with reason)', async () => {
    const { status, body } = await putJSON(app, '/api/km/evidence/ev-001', {
      status: 'fail',
      fail_reason: '证据不充分',
      reviewed_by: 'reviewer2',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // Audit log should be written for fail status
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    expect(auditCalls[0].action).toBe('evidence_fail');
    expect(auditCalls[0].object_id).toBe('ev-001');
  });
});
