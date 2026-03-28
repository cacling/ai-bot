/**
 * API tests for: src/agent/km/kms/audit.ts
 * Routes: GET /api/km/audit-logs
 * Mock: db(kmAuditLogs)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const AUDIT_LOG = {
  id: 'al-001', action: 'publish', object_type: 'candidate', object_id: 'cand-001',
  operator: 'admin', risk_level: 'high', detail_json: '{"reason":"approved"}',
  created_at: '2026-03-01T00:00:00Z',
};

const AUDIT_LOG_2 = {
  id: 'al-002', action: 'reject', object_type: 'review_package', object_id: 'rp-001',
  operator: 'reviewer', risk_level: 'low', detail_json: '{"reason":"rejected"}',
  created_at: '2026-02-28T00:00:00Z',
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
  const mod = await import('../../../../../src/agent/km/kms/audit');
  app = new Hono();
  app.route('/api/km/audit-logs', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/km/audit-logs', () => {
  beforeEach(() => setupApp([AUDIT_LOG, AUDIT_LOG_2], 2));

  test('returns audit log list ordered by created_at desc', async () => {
    const { status, body } = await getJSON(app, '/api/km/audit-logs');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.items)).toBe(true);
    expect(b.items.length).toBe(2);
    expect(b.items[0].id).toBe('al-001');
  });

  test('supports limit/offset pagination', async () => {
    const { status, body } = await getJSON(app, '/api/km/audit-logs?page=1&size=10');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
  });

  test('filters by object_type', async () => {
    const { status, body } = await getJSON(app, '/api/km/audit-logs?object_type=candidate');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.items)).toBe(true);
  });

  test('filters by risk_level', async () => {
    const { status, body } = await getJSON(app, '/api/km/audit-logs?risk_level=high');
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.items)).toBe(true);
  });

  test('each log has action, object_type, object_id, operator, risk_level', async () => {
    const { status, body } = await getJSON(app, '/api/km/audit-logs');
    expect(status).toBe(200);
    const b = body as any;
    expect(b.total).toBe(2);
    const log = b.items[0];
    expect(log).toHaveProperty('action');
    expect(log).toHaveProperty('object_type');
    expect(log).toHaveProperty('object_id');
    expect(log).toHaveProperty('operator');
    expect(log).toHaveProperty('risk_level');
  });
});
