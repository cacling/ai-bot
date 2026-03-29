/**
 * API tests for: src/agent/km/kms/assets.ts
 * Routes: GET /api/km/assets, GET /api/km/assets/:id, GET /api/km/assets/:id/versions
 * Mock: db(kmAssets, kmAssetVersions)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON } from '../helpers';
import { tableStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const ASSET = {
  id: 'ast-001', title: '话费查询FAQ', asset_type: 'faq', status: 'published',
  current_version: 2, owner: 'admin', scope_json: null,
  created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
};

const ASSET_VERSION = {
  id: 'av-001', asset_id: 'ast-001', version_no: 1, content_snapshot: '话费查询步骤...',
  structured_snapshot_json: null, scope_snapshot: null, action_draft_id: 'ad-001',
  rollback_point_id: null, effective_from: '2026-03-01T00:00:00Z', created_at: '2026-03-01T00:00:00Z',
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
  const mod = await import('../../../src/routes/assets');
  app = new Hono();
  app.route('/api/km/assets', mod.default);
}

describe('GET /api/km/assets', () => {
  beforeEach(() => setupApp([ASSET], 1));

  test('returns asset list with pagination', async () => {
    const { status, body } = await getJSON(app, '/api/km/assets');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('ast-001');
    expect(body.items[0].title).toBe('话费查询FAQ');
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
  });

  test('filters by status, asset_type, keyword', async () => {
    const { status, body } = await getJSON(app, '/api/km/assets?status=published&asset_type=faq&keyword=话费');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].asset_type).toBe('faq');
    expect(body.items[0].status).toBe('published');
  });
});

describe('GET /api/km/assets/:id', () => {
  test('returns asset detail', async () => {
    await setupApp([ASSET]);
    const { status, body } = await getJSON(app, '/api/km/assets/ast-001');
    expect(status).toBe(200);
    expect(body.id).toBe('ast-001');
    expect(body.title).toBe('话费查询FAQ');
    expect(body.asset_type).toBe('faq');
    expect(body.current_version).toBe(2);
  });

  test('returns 404 for non-existent id', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/assets/non-existent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/km/assets/:id/versions', () => {
  test('returns version chain for asset', async () => {
    await setupApp([ASSET_VERSION]);
    const { status, body } = await getJSON(app, '/api/km/assets/ast-001/versions');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('av-001');
    expect(body.items[0].asset_id).toBe('ast-001');
    expect(body.items[0].version_no).toBe(1);
  });

  test('returns empty array when no versions', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/assets/ast-001/versions');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(0);
  });
});
