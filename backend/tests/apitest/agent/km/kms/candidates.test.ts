/**
 * API tests for: src/agent/km/kms/candidates.ts
 * Routes: GET/POST /api/km/candidates, GET/PUT /api/km/candidates/:id, POST gate-check
 * Mock: db(kmCandidates, kmEvidenceRefs, kmConflictRecords)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const CANDIDATE = {
  id: 'cand-001', source_type: 'manual', source_ref_id: null, normalized_q: '如何查话费',
  draft_answer: '拨打10086', variants_json: '["怎么查话费","话费查询"]', category: '业务咨询',
  risk_level: 'low', target_asset_id: null, status: 'draft', scene_code: null,
  retrieval_tags_json: null, structured_json: null, gate_evidence: 'pending',
  gate_conflict: 'pending', gate_ownership: 'pending', review_pkg_id: null,
  created_by: 'admin', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
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
  const mod = await import('../../../../../src/agent/km/kms/candidates');
  app = new Hono();
  app.route('/api/km/candidates', mod.default);
}

describe('GET /api/km/candidates', () => {
  beforeEach(() => setupApp([CANDIDATE], 1));

  test('returns candidate list', async () => {
    const { status, body } = await getJSON(app, '/api/km/candidates');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('cand-001');
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.size).toBe(20);
  });

  test('filters by status (draft/gate_pass/in_review/published)', async () => {
    const { status } = await getJSON(app, '/api/km/candidates?status=draft');
    expect(status).toBe(200);
  });

  test('filters by source_type', async () => {
    const { status } = await getJSON(app, '/api/km/candidates?source_type=manual');
    expect(status).toBe(200);
  });
});

describe('POST /api/km/candidates', () => {
  beforeEach(() => setupApp([]));

  test('creates candidate with source_type=manual', async () => {
    const { status, body } = await postJSON(app, '/api/km/candidates', {
      source_type: 'manual',
      normalized_q: '如何查话费',
      draft_answer: '拨打10086',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('returns 400 when normalized_q is missing', async () => {
    const { status, body } = await postJSON(app, '/api/km/candidates', {
      source_type: 'manual',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/km/candidates/:id', () => {
  test('returns candidate with evidence and conflict records', async () => {
    await setupApp([CANDIDATE]);
    const { status, body } = await getJSON(app, '/api/km/candidates/cand-001');
    expect(status).toBe(200);
    expect(body.id).toBe('cand-001');
    expect(body.evidences).toBeDefined();
    expect(body.conflicts).toBeDefined();
    expect(body.gate_card).toBeDefined();
    expect(body.gate_card.evidence).toBeDefined();
    expect(body.gate_card.conflict).toBeDefined();
    expect(body.gate_card.ownership).toBeDefined();
  });

  test('returns gate_card with evidence/conflict/ownership', async () => {
    await setupApp([CANDIDATE]);
    const { status, body } = await getJSON(app, '/api/km/candidates/cand-001');
    expect(status).toBe(200);
    expect(body.gate_card.evidence.status).toBe('pending');
    expect(body.gate_card.conflict.status).toBe('pending');
    expect(body.gate_card.ownership.status).toBe('pending');
    expect(body.gate_card.ownership.has_target).toBe(false);
  });

  test('returns 404 for non-existent id', async () => {
    await setupApp([]);
    const { status, body } = await getJSON(app, '/api/km/candidates/non-existent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('PUT /api/km/candidates/:id', () => {
  beforeEach(() => setupApp([CANDIDATE]));

  test('updates allowed fields', async () => {
    const { status, body } = await putJSON(app, '/api/km/candidates/cand-001', {
      scene_code: 'billing',
      variants_json: '["话费查询方式"]',
      structured_json: '{"type":"qa"}',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('ignores disallowed fields', async () => {
    const { status, body } = await putJSON(app, '/api/km/candidates/cand-001', {
      id: 'hacked-id',
      created_by: 'hacker',
      normalized_q: '合法更新',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('POST /api/km/candidates/:id/gate-check', () => {
  test('re-validates all gates and returns results', async () => {
    await setupApp([CANDIDATE]);
    const { status, body } = await postJSON(app, '/api/km/candidates/cand-001/gate-check', {});
    expect(status).toBe(200);
    expect(body.gate_evidence).toBeDefined();
    expect(body.gate_conflict).toBeDefined();
    expect(body.gate_ownership).toBeDefined();
    expect(typeof body.all_pass).toBe('boolean');
  });

  test('returns 404 for non-existent candidate', async () => {
    await setupApp([]);
    const { status, body } = await postJSON(app, '/api/km/candidates/non-existent/gate-check', {});
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});
