/**
 * API tests for: src/agent/km/kms/tasks.ts
 * Routes: GET/POST /api/km/tasks, PUT /api/km/tasks/:id
 * Mock: db(kmGovernanceTasks), audit(writeAudit)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const TASK = {
  id: 'task-001', task_type: 'review', source_type: 'candidate', source_ref_id: 'cand-001',
  priority: 'high', assignee: 'reviewer1', due_date: '2026-04-01T00:00:00Z',
  status: 'open', conclusion: null, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
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

mock.module('../../../../../src/db', () => ({ db: mockDb }));
mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../../../../src/agent/km/kms/helpers', () => ({
  nanoid: () => 'test-id-001',
  writeAudit: async (params: Record<string, unknown>) => { auditCalls.push(params); },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

async function setupApp(rows: Row[], countVal = 0) {
  currentRows = rows;
  currentCountVal = countVal;
  auditCalls = [];
  const mod = await import('../../../../../src/agent/km/kms/tasks');
  app = new Hono();
  app.route('/api/km/tasks', mod.default);
}

describe('GET /api/km/tasks', () => {
  beforeEach(() => setupApp([TASK], 1));

  test('returns task list with pagination', async () => {
    const { status, body } = await getJSON(app, '/api/km/tasks');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].id).toBe('task-001');
    expect(body.items[0].task_type).toBe('review');
    expect(body.total).toBe(1);
  });

  test('filters by status, task_type, assignee, priority', async () => {
    const { status, body } = await getJSON(app, '/api/km/tasks?status=open&task_type=review&assignee=reviewer1&priority=high');
    expect(status).toBe(200);
    expect(body.items).toBeArrayOfSize(1);
    expect(body.items[0].status).toBe('open');
    expect(body.items[0].assignee).toBe('reviewer1');
    expect(body.items[0].priority).toBe('high');
  });
});

describe('POST /api/km/tasks', () => {
  beforeEach(() => setupApp([], 0));

  test('creates governance task', async () => {
    const { status, body } = await postJSON(app, '/api/km/tasks', {
      task_type: 'review',
      source_type: 'candidate',
      source_ref_id: 'cand-002',
      priority: 'urgent',
      assignee: 'reviewer2',
      due_date: '2026-05-01T00:00:00Z',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });

  test('defaults priority to medium and status to open', async () => {
    const { status, body } = await postJSON(app, '/api/km/tasks', {
      task_type: 'audit',
    });
    expect(status).toBe(201);
    expect(body.id).toBe('test-id-001');
  });
});

describe('PUT /api/km/tasks/:id', () => {
  beforeEach(() => setupApp([TASK], 0));

  test('updates task status and conclusion', async () => {
    const { status, body } = await putJSON(app, '/api/km/tasks/task-001', {
      status: 'in_progress',
      assignee: 'reviewer3',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  test('writes audit log when status is done', async () => {
    const { status, body } = await putJSON(app, '/api/km/tasks/task-001', {
      status: 'done',
      conclusion: '审核通过，符合规范',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // Audit log should be written for done status
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    expect(auditCalls[0].action).toBe('close_task');
    expect(auditCalls[0].object_type).toBe('governance_task');
    expect(auditCalls[0].object_id).toBe('task-001');
    expect((auditCalls[0].detail as any).conclusion).toBe('审核通过，符合规范');
  });
});
