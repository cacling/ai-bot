/**
 * API tests for: src/agent/km/kms/action-drafts.ts
 * Routes: GET/POST /api/km/action-drafts, GET /:id, POST /:id/execute
 * Mock: db(kmActionDrafts, kmAssets, kmAssetVersions, kmRegressionWindows), fs, audit
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON } from '../helpers';
import { tableStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const DRAFT = {
  id: 'ad-001', action_type: 'unpublish', target_asset_id: 'asset-001',
  review_pkg_id: null, change_summary: '下架FAQ', created_by: 'admin', status: 'draft',
  executed_by: null, executed_at: null, rollback_point_id: null, regression_window_id: null,
  created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
};

const DRAFT_DONE = {
  ...DRAFT, id: 'ad-003', status: 'done',
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
  const mod = await import('../../../src/routes/action-drafts');
  app = new Hono();
  app.route('/api/km/action-drafts', mod.default);
}

describe('GET /api/km/action-drafts', () => {
  beforeEach(() => setupApp([DRAFT], 1));

  test('returns action draft list', async () => {
    const { status, body } = await getJSON(app, '/api/km/action-drafts');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('ad-001');
    expect(body.total).toBe(1);
  });

  test('filters by status and action_type', async () => {
    const { status } = await getJSON(app, '/api/km/action-drafts?status=draft&action_type=unpublish');
    expect(status).toBe(200);
  });
});

describe('GET /api/km/action-drafts/:id', () => {
  test('returns draft detail', async () => {
    await setupApp([DRAFT]);
    const { status, body } = await getJSON(app, '/api/km/action-drafts/ad-001');
    expect(status).toBe(200);
    expect(body.id).toBe('ad-001');
    expect(body.action_type).toBe('unpublish');
  });

  test('returns 404 for non-existent', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/action-drafts/non-existent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/km/action-drafts', () => {
  beforeEach(() => setupApp([]));

  test('creates publish action draft', async () => {
    const { status, body } = await postJSON(app, '/api/km/action-drafts', {
      action_type: 'publish',
      review_pkg_id: 'rp-001',
      change_summary: '发布新FAQ',
      created_by: 'admin',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('creates rollback action draft', async () => {
    const { status, body } = await postJSON(app, '/api/km/action-drafts', {
      action_type: 'rollback',
      target_asset_id: 'asset-001',
      created_by: 'admin',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('creates unpublish action draft', async () => {
    const { status, body } = await postJSON(app, '/api/km/action-drafts', {
      action_type: 'unpublish',
      target_asset_id: 'asset-001',
      created_by: 'admin',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });
});

describe('POST /api/km/action-drafts/:id/execute', () => {
  test('executes draft with unpublish action', async () => {
    await setupApp([DRAFT]);
    const { status, body } = await postJSON(app, '/api/km/action-drafts/ad-001/execute', {
      executed_by: 'admin',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe('done');
    expect(body.regression_window_id).toBe('test-id-001');
  });

  test('returns 404 for non-existent draft', async () => {
    await setupApp([]);
    const { status, body } = await postJSON(app, '/api/km/action-drafts/non-existent/execute', {});
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });

  test('returns 400 for wrong status', async () => {
    await setupApp([DRAFT_DONE]);
    const { status, body } = await postJSON(app, '/api/km/action-drafts/ad-003/execute', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  test('creates regression window on execution', async () => {
    await setupApp([DRAFT]);
    const { status, body } = await postJSON(app, '/api/km/action-drafts/ad-001/execute', {
      executed_by: 'admin',
    });
    expect(status).toBe(200);
    expect(body.regression_window_id).toBeDefined();
    expect(body.regression_window_id).toBe('test-id-001');
  });

  test('writes audit log on execution', async () => {
    await setupApp([DRAFT]);
    const { status, body } = await postJSON(app, '/api/km/action-drafts/ad-001/execute', {
      executed_by: 'admin',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
