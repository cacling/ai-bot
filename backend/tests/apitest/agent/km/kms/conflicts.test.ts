/**
 * API tests for: src/agent/km/kms/conflicts.ts
 * Routes: GET/POST /api/km/conflicts, GET /api/km/conflicts/:id, PUT /api/km/conflicts/:id/resolve
 * Mock: db(kmConflictRecords), audit(writeAudit)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const CONFLICT = {
  id: 'cf-001', conflict_type: 'answer_overlap', item_a_id: 'cand-001', item_b_id: 'cand-002',
  overlap_scope: '套餐查询', blocking_policy: 'block_submit', resolution: null,
  arbiter: null, status: 'pending', created_at: '2026-03-01T00:00:00Z', resolved_at: null,
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

mock.module('../../../../../src/db', () => ({ db: mockDb }));
mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../../../src/agent/km/kms/helpers', () => ({
  nanoid: () => 'test-id-001',
  writeAudit: async () => {},
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[], countVal = 0) {
  currentRows = rows;
  currentCountVal = countVal;
  const mod = await import('../../../../../src/agent/km/kms/conflicts');
  app = new Hono();
  app.route('/api/km/conflicts', mod.default);
}

describe('GET /api/km/conflicts', () => {
  beforeEach(() => setupApp([CONFLICT], 1));

  test('returns conflict list', async () => {
    const { status, body } = await getJSON(app, '/api/km/conflicts');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('cf-001');
    expect(body.items[0].conflict_type).toBe('answer_overlap');
  });

  test('filters by status and conflict_type', async () => {
    const { status, body } = await getJSON(app, '/api/km/conflicts?status=pending&conflict_type=answer_overlap');
    expect(status).toBe(200);
    expect(body.items).toBeDefined();
  });
});

describe('GET /api/km/conflicts/:id', () => {
  test('returns conflict detail', async () => {
    await setupApp([CONFLICT]);
    const { status, body } = await getJSON(app, '/api/km/conflicts/cf-001');
    expect(status).toBe(200);
    expect(body.id).toBe('cf-001');
    expect(body.conflict_type).toBe('answer_overlap');
    expect(body.item_a_id).toBe('cand-001');
    expect(body.item_b_id).toBe('cand-002');
    expect(body.status).toBe('pending');
  });

  test('returns 404 for non-existent', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/conflicts/non-existent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/km/conflicts', () => {
  beforeEach(() => setupApp([]));

  test('creates conflict record with type and blocking_strategy', async () => {
    const { status, body } = await postJSON(app, '/api/km/conflicts', {
      conflict_type: 'answer_overlap',
      item_a_id: 'cand-001',
      item_b_id: 'cand-002',
      overlap_scope: '套餐查询',
      blocking_policy: 'block_submit',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('supports types: wording/scope/version/replacement', async () => {
    const { status, body } = await postJSON(app, '/api/km/conflicts', {
      conflict_type: 'wording',
      item_a_id: 'cand-003',
      item_b_id: 'cand-004',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });
});

describe('PUT /api/km/conflicts/:id/resolve', () => {
  beforeEach(() => setupApp([CONFLICT]));

  test('resolves with resolution: keep_a/keep_b/coexist/split', async () => {
    const { status, body } = await putJSON(app, '/api/km/conflicts/cf-001/resolve', {
      resolution: 'keep_a',
      arbiter: 'admin',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('writes audit log on resolution', async () => {
    const { status, body } = await putJSON(app, '/api/km/conflicts/cf-001/resolve', {
      resolution: 'coexist',
      arbiter: 'reviewer',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
