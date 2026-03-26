/**
 * API tests for: src/agent/km/kms/review-packages.ts
 * Routes: GET/POST /api/km/review-packages, GET /:id, POST submit/approve/reject
 * Mock: db(kmReviewPackages, kmCandidates, kmConflictRecords, kmAssets), fs, audit
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const REVIEW_PKG = {
  id: 'rp-001', title: 'FAQ发布包v1', candidate_ids_json: '["cand-001","cand-002"]',
  risk_level: 'medium', impact_summary: '新增2个FAQ', created_by: 'admin', status: 'draft',
  submitted_by: null, submitted_at: null, approved_by: null, approved_at: null,
  approval_snapshot: null, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  // gate fields so the mock row is harmless when it appears in candidate iterations
  gate_evidence: 'pass', gate_conflict: 'pass', gate_ownership: 'pass',
  normalized_q: '', item_a_id: null, item_b_id: null, blocking_policy: null,
};

const CANDIDATE_FOR_PKG = {
  id: 'cand-001', source_type: 'manual', normalized_q: '如何查话费',
  draft_answer: '拨打10086', variants_json: null, category: '业务咨询',
  risk_level: 'low', status: 'in_review', gate_evidence: 'pass', gate_conflict: 'pass',
  gate_ownership: 'pass', created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
};

const CANDIDATE_2 = {
  ...CANDIDATE_FOR_PKG,
  id: 'cand-002', normalized_q: '如何查流量',
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
  const mod = await import('../../../../../src/agent/km/kms/review-packages');
  app = new Hono();
  app.route('/api/km/review-packages', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/km/review-packages', () => {
  beforeEach(() => setupApp([REVIEW_PKG], 1));

  test('returns review package list with pagination', async () => {
    const { status, body } = await getJSON(app, '/api/km/review-packages');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.items)).toBe(true);
    expect(b.items.length).toBe(1);
    expect(b.total).toBe(1);
    expect(b.items[0].id).toBe('rp-001');
    expect(typeof b.page).toBe('number');
    expect(typeof b.size).toBe('number');
  });
});

describe('POST /api/km/review-packages', () => {
  beforeEach(() => setupApp([], 0));

  test('creates review package with candidate ids', async () => {
    const { status, body } = await postJSON(app, '/api/km/review-packages', {
      title: 'New FAQ Pack',
      candidate_ids: ['cand-001', 'cand-002'],
      risk_level: 'low',
      impact_summary: 'Test pack',
      created_by: 'admin',
    });
    expect(status).toBe(201);
    const b = body as any;
    expect(b.id).toBe('test-id-001');
  });

  test('returns 400 when title is missing', async () => {
    const { status, body } = await postJSON(app, '/api/km/review-packages', {
      candidate_ids: ['cand-001'],
    });
    expect(status).toBe(400);
    expect((body as any).error).toBeDefined();
  });
});

describe('GET /api/km/review-packages/:id', () => {
  test('returns package detail with associated candidates', async () => {
    await setupApp([REVIEW_PKG], 1);
    const { status, body } = await getJSON(app, '/api/km/review-packages/rp-001');
    expect(status).toBe(200);
    const b = body as any;
    expect(b.id).toBe('rp-001');
    expect(b.title).toBe('FAQ发布包v1');
    expect(Array.isArray(b.candidates)).toBe(true);
  });

  test('returns 404 for non-existent package', async () => {
    await setupApp([], 0);
    const { status, body } = await getJSON(app, '/api/km/review-packages/nonexistent');
    expect(status).toBe(404);
    expect((body as any).error).toBeDefined();
  });
});

describe('POST /api/km/review-packages/:id/submit', () => {
  test('submits for review when all gates pass', async () => {
    await setupApp([REVIEW_PKG, CANDIDATE_FOR_PKG, CANDIDATE_2], 1);
    const { status, body } = await postJSON(app, '/api/km/review-packages/rp-001/submit', {
      submitted_by: 'admin',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.status).toBe('submitted');
  });

  test('returns blockers list when gates fail', async () => {
    const failCandidate = {
      ...CANDIDATE_FOR_PKG,
      gate_evidence: 'fail',
      gate_conflict: 'fail',
      gate_ownership: 'fail',
    };
    await setupApp([REVIEW_PKG, failCandidate], 1);
    const { status, body } = await postJSON(app, '/api/km/review-packages/rp-001/submit', {
      submitted_by: 'admin',
    });
    expect(status).toBe(400);
    const b = body as any;
    expect(b.error).toContain('门槛');
    expect(Array.isArray(b.blockers)).toBe(true);
    expect(b.blockers.length).toBeGreaterThan(0);
  });
});

describe('POST /api/km/review-packages/:id/approve', () => {
  test('approves package and publishes candidates as assets', async () => {
    await setupApp([REVIEW_PKG], 1);
    const { status, body } = await postJSON(app, '/api/km/review-packages/rp-001/approve', {
      approved_by: 'reviewer',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.status).toBe('approved');
  });

  test('writes audit log on approval', async () => {
    await setupApp([REVIEW_PKG], 1);
    const { status, body } = await postJSON(app, '/api/km/review-packages/rp-001/approve', {
      approved_by: 'reviewer',
    });
    expect(status).toBe(200);
    expect((body as any).ok).toBe(true);
  });
});

describe('POST /api/km/review-packages/:id/reject', () => {
  test('rejects package with reason', async () => {
    await setupApp([REVIEW_PKG], 1);
    const { status, body } = await postJSON(app, '/api/km/review-packages/rp-001/reject', {
      rejected_by: 'reviewer',
      reason: 'Needs more evidence',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.status).toBe('rejected');
  });
});
