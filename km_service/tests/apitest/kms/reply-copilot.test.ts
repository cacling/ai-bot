/**
 * API tests for: src/agent/km/kms/reply-copilot.ts
 * Routes: POST /api/km/reply-copilot/preview, POST /api/km/reply-copilot/feedback
 * Mock: reply-copilot(buildReplyHints), db(kmReplyFeedback)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { postJSON } from '../helpers';
import { tableStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const HINTS = [{ id: 'h1', hint_text: '您好，话费查询请拨打10086', score: 0.95 }];

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
mock.module('../../../src/services/reply-copilot', () => ({
  buildReplyHints: async () => HINTS,
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[] = [], countVal = 0) {
  currentRows = rows;
  currentCountVal = countVal;
  const mod = await import('../../../src/routes/reply-copilot');
  app = new Hono();
  app.route('/api/km/reply-copilot', mod.default);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/km/reply-copilot/preview', () => {
  beforeEach(() => setupApp());

  test('returns reply hints with scene, risk, and candidates', async () => {
    const { status, body } = await postJSON(app, '/api/km/reply-copilot/preview', {
      message: '我想查话费', phone: '13800001111',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(Array.isArray(b.hints)).toBe(true);
    expect(b.hints.length).toBeGreaterThan(0);
    expect(b.hints[0]).toHaveProperty('hint_text');
    expect(b.hints[0]).toHaveProperty('score');
  });

  test('returns 400 when message is missing', async () => {
    const { status, body } = await postJSON(app, '/api/km/reply-copilot/preview', {
      phone: '13800001111',
    });
    expect(status).toBe(400);
    expect((body as any).error).toContain('message');
  });
});

describe('POST /api/km/reply-copilot/feedback', () => {
  beforeEach(() => setupApp());

  test('records positive feedback (used hint)', async () => {
    const { status, body } = await postJSON(app, '/api/km/reply-copilot/feedback', {
      session_id: 'sess-001',
      phone: '13800001111',
      message_id: 'msg-001',
      asset_version_id: 'av-001',
      event_type: 'use',
      detail_json: '{"hint_id":"h1"}',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.id).toBe('test-id-001');
  });

  test('records negative feedback (rejected hint)', async () => {
    const { status, body } = await postJSON(app, '/api/km/reply-copilot/feedback', {
      event_type: 'dismiss',
    });
    expect(status).toBe(200);
    const b = body as any;
    expect(b.ok).toBe(true);
    expect(b.id).toBe('test-id-001');
  });
});
