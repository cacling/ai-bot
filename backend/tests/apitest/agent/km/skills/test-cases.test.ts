/**
 * API tests for: src/agent/km/skills/test-cases.ts
 * Routes: GET/POST /api/test-cases, POST /api/test-cases/batch, PUT/DELETE /api/test-cases/:id
 * Mock: db(testCases)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const TEST_CASE = {
  id: 1,
  skill_name: 'bill-inquiry',
  input_message: 'I want to check my bill',
  expected_keywords: JSON.stringify(['bill', 'amount']),
  assertions: JSON.stringify([{ type: 'contains', value: 'bill' }]),
  persona_id: null,
  created_at: '2026-03-01T00:00:00Z',
};

// ── Mutable mock state ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let currentRows: Row[] = [];

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
        returning: (cols?: unknown) => ({
          then: (r: (v: Row[]) => void) => {
            const items = Array.isArray(v) ? v : [v];
            // Return id field for returning({ id })
            r(items.map((item, i) => ({ id: (item as any).id ?? i + 1 })));
          },
        }),
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

mock.module('../../../../../src/db', () => ({ db: buildMockDb() }));
mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[] = []) {
  currentRows = rows;
  const mod = await import('../../../../../src/agent/km/skills/test-cases');
  app = new Hono();
  app.route('/api/test-cases', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/test-cases', () => {
  beforeEach(() => setupApp([TEST_CASE]));

  test('returns test cases filtered by skill query param', async () => {
    const { status, body } = await getJSON(app, '/api/test-cases?skill=bill-inquiry');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].skill_name).toBe('bill-inquiry');
  });

  test('returns all test cases when no filter', async () => {
    const { status, body } = await getJSON(app, '/api/test-cases');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
  });
});

describe('POST /api/test-cases', () => {
  beforeEach(() => setupApp([]));

  test('creates single test case with input and assertions', async () => {
    const { status, body } = await postJSON(app, '/api/test-cases', {
      skill_name: 'bill-inquiry',
      input_message: 'Check my bill',
      assertions: [{ type: 'contains', value: 'bill' }],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.id).toBeDefined();
  });

  test('returns 400 when skill is missing', async () => {
    const { status, body } = await postJSON(app, '/api/test-cases', {
      input_message: 'Check my bill',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe('POST /api/test-cases/batch', () => {
  beforeEach(() => setupApp([]));

  test('creates multiple test cases in one request', async () => {
    const { status, body } = await postJSON(app, '/api/test-cases/batch', {
      skill_name: 'bill-inquiry',
      cases: [
        { input: 'Check bill', assertions: [{ type: 'contains', value: 'bill' }] },
        { input: 'View charges', assertions: [{ type: 'contains', value: 'charge' }] },
      ],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.ids).toBeArrayOfSize(2);
  });
});

describe('PUT /api/test-cases/:id', () => {
  beforeEach(() => setupApp([TEST_CASE]));

  test('updates test case input and assertions', async () => {
    const { status, body } = await putJSON(app, '/api/test-cases/1', {
      input_message: 'Updated input',
      assertions: [{ type: 'contains', value: 'updated' }],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('returns 400 when no updatable fields provided', async () => {
    const { status, body } = await putJSON(app, '/api/test-cases/1', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe('DELETE /api/test-cases/:id', () => {
  beforeEach(() => setupApp([TEST_CASE]));

  test('deletes test case and returns ok', async () => {
    const { status, body } = await deleteJSON(app, '/api/test-cases/1');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
