/**
 * API tests for: src/agent/km/mcp/connectors.ts
 * Routes: GET/POST /api/mcp/connectors, GET/PUT/DELETE /:id, POST /:id/test
 * Mock: db(connectors, toolImplementations), HTTP(fetch)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const CONNECTOR = {
  id: 'conn-001', name: 'account-db', type: 'api',
  config: JSON.stringify({ base_url: 'http://localhost:3100' }),
  status: 'active', description: '账户数据库连接',
  env_json: null, env_prod_json: null, env_test_json: null,
  server_id: 'srv-001', created_at: '2026-03-01', updated_at: '2026-03-01',
};

const DB_CONNECTOR = {
  id: 'conn-002', name: 'billing-db', type: 'db',
  config: JSON.stringify({ connection_string: 'sqlite:///tmp/billing.db' }),
  status: 'active', description: 'Billing 数据库连接',
  env_json: null, env_prod_json: null, env_test_json: null,
  server_id: 'srv-002', created_at: '2026-03-01', updated_at: '2026-03-01',
};

const IMPL_ROW = {
  id: 'impl-001', tool_id: 'tool-001', connector_id: 'conn-001',
  impl_type: 'api_call', config: null,
};

// ── Mutable state ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let connectorRows: Row[] = [];
let implRows: Row[] = [];
let inserted: Row[] = [];
let updated: Row[] = [];
let deleted: string[] = [];

// ── Mock tables ─────────────────────────────────────────────────────────────

const T_CONNECTORS = Symbol('connectors');
const T_IMPLS = Symbol('toolImplementations');

mock.module('../../../../../src/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows = table === T_IMPLS ? implRows : connectorRows;
        const chain = (data: Row[] = rows) => ({
          where: () => chain(data),
          orderBy: () => chain(data),
          all: () => data,
          get: () => data[0] ?? null,
          filter: (fn: (r: Row) => boolean) => data.filter(fn),
          then: (resolve: (v: Row[]) => void) => resolve(data),
          [Symbol.iterator]: () => data[Symbol.iterator](),
        });
        return chain(rows);
      },
    }),
    insert: () => ({
      values: (v: Row) => {
        inserted.push(v);
        return { run: () => {} };
      },
    }),
    update: () => ({
      set: (v: Row) => {
        updated.push(v);
        return { where: () => ({ run: () => {} }) };
      },
    }),
    delete: () => ({
      where: () => { deleted.push('deleted'); return { run: () => {} }; },
    }),
  },
}));

mock.module('../../../../../src/db/schema', () => ({
  connectors: T_CONNECTORS,
  toolImplementations: T_IMPLS,
}));

mock.module('../../../../../src/db/nanoid', () => ({
  nanoid: () => 'new-conn-001',
}));

mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// ── Import route after mocks ────────────────────────────────────────────────

const { default: connectorsApp } = await import('../../../../../src/agent/km/mcp/connectors');

function buildApp() {
  const app = new Hono();
  app.route('/api/mcp/connectors', connectorsApp);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  connectorRows = [{ ...CONNECTOR }];
  implRows = [{ ...IMPL_ROW }];
  inserted = [];
  updated = [];
  deleted = [];
});

describe('GET /api/mcp/connectors', () => {
  test('returns connector list', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/connectors');
    expect(status).toBe(200);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBe(1);
    expect(body.items[0].name).toBe('account-db');
  });

  test('filters by type', async () => {
    connectorRows = [{ ...CONNECTOR }, { ...DB_CONNECTOR }];
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/connectors');
    expect(body.items.length).toBe(2);
  });
});

describe('POST /api/mcp/connectors', () => {
  test('creates API connector with base_url', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors', {
      name: 'new-api-conn', type: 'api',
      config: { base_url: 'http://localhost:3200' },
    });
    expect(status).toBe(200);
    expect(body.id).toBe('new-conn-001');
    expect(inserted.length).toBe(1);
    expect(inserted[0].name).toBe('new-api-conn');
    expect(inserted[0].type).toBe('api');
  });

  test('creates db connector', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors', {
      name: 'new-db-conn', type: 'db',
      config: { connection_string: 'sqlite:///tmp/test.db' },
    });
    expect(status).toBe(200);
    expect(body.id).toBe('new-conn-001');
    expect(inserted[0].type).toBe('db');
  });

  test('returns 400 when name is missing', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors', {
      type: 'api',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  test('returns 400 when type is missing', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors', {
      name: 'no-type-conn',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe('GET /api/mcp/connectors/:id', () => {
  test('returns connector detail with implementation count', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/connectors/conn-001');
    expect(status).toBe(200);
    expect(body.name).toBe('account-db');
    expect(body.tool_implementations).toBeInstanceOf(Array);
    expect(body.tool_implementations.length).toBe(1);
  });

  test('returns 404 for non-existent connector', async () => {
    connectorRows = [];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/connectors/nonexistent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('PUT /api/mcp/connectors/:id', () => {
  test('updates connector config', async () => {
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/connectors/conn-001', {
      name: 'account-db-v2', status: 'inactive',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('account-db-v2');
    expect(updated[0].status).toBe('inactive');
  });

  test('returns 404 when connector does not exist', async () => {
    connectorRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/connectors/nonexistent', { name: 'x' });
    expect(status).toBe(404);
  });
});

describe('DELETE /api/mcp/connectors/:id', () => {
  test('deletes connector', async () => {
    const app = buildApp();
    const { status, body } = await deleteJSON(app, '/api/mcp/connectors/conn-001');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deleted.length).toBe(1);
  });
});

describe('POST /api/mcp/connectors/:id/test', () => {
  test('returns 404 when connector not found', async () => {
    connectorRows = [];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors/nonexistent/test', {});
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });

  test('returns error when api connector has no base_url', async () => {
    connectorRows = [{ ...CONNECTOR, config: JSON.stringify({}) }];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors/conn-001/test', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('base_url');
  });

  test('returns error for unknown connector type', async () => {
    connectorRows = [{ ...CONNECTOR, type: 'unknown_type' }];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/connectors/conn-001/test', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Unknown type');
  });
});
