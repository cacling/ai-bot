/**
 * API tests for: src/agent/km/mcp/tool-management.ts
 * Routes: GET/POST /api/mcp/tool-management, GET handlers, GET/PUT/DELETE /:id,
 *         PUT mock-rules/toggle-mock, POST sql-preview/validate-output/infer-schema,
 *         GET/PUT /:id/implementation
 * Mock: db(mcpTools, mcpServers, connectors, toolImplementations), fs, skills
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../helpers';
import { tableStubs, pathsStubs, engineStubs } from '../mock-db-stubs';

// ── Mock data ───────────────────────────────────────────────────────────────

const TOOL = {
  id: 'tool-001', name: 'query_subscriber', description: '查询用户信息',
  server_id: 'srv-001',
  input_schema: '{"type":"object","properties":{"phone":{"type":"string"}}}',
  output_schema: null,
  mock_rules: JSON.stringify([{ tool_name: 'query_subscriber', match: '*', response: '{"found":true}' }]),
  mocked: true, disabled: false, response_example: null,
  annotations: null, created_at: '2026-03-01', updated_at: '2026-03-01',
};

const SERVER = {
  id: 'srv-001', name: 'internal-service', enabled: true, kind: 'internal',
  tools_json: JSON.stringify([{ name: 'query_subscriber' }, { name: 'verify_identity' }]),
};

const CONNECTOR = {
  id: 'conn-001', name: 'account-db', type: 'sqlite', status: 'active',
};

const IMPL = {
  id: 'impl-001', tool_id: 'tool-001', adapter_type: 'script',
  host_server_id: 'srv-001', connector_id: 'conn-001',
  config: null, handler_key: 'user_info.query_subscriber', status: 'active',
  created_at: '2026-03-01', updated_at: '2026-03-01',
};

// ── Mutable state ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let toolRows: Row[] = [];
let serverRows: Row[] = [];
let connectorRows: Row[] = [];
let implRows: Row[] = [];
let inserted: Row[] = [];
let updated: Row[] = [];
let deleted: string[] = [];
let skillMap = new Map<string, string[]>();

// ── Mock tables ─────────────────────────────────────────────────────────────

const T_TOOLS = Symbol('mcpTools');
const T_SERVERS = Symbol('mcpServers');
const T_CONNECTORS = Symbol('connectors');
const T_IMPLS = Symbol('toolImplementations');

function getRowsForTable(table: unknown): Row[] {
  if (table === T_SERVERS) return serverRows;
  if (table === T_CONNECTORS) return connectorRows;
  if (table === T_IMPLS) return implRows;
  return toolRows;
}

mock.module('../../../src/db', () => ({ ...tableStubs,
  db: {
    select: (fields?: unknown) => ({
      from: (table: unknown) => {
        const rows = getRowsForTable(table);
        const chain = (data: Row[] = rows) => ({
          where: () => chain(data),
          orderBy: () => chain(data),
          all: () => data,
          get: () => data[0] ?? null,
          filter: (fn: (r: Row) => boolean) => data.filter(fn),
          then: (resolve: (v: Row[]) => void) => resolve(data),
          map: (fn: (v: Row) => unknown) => data.map(fn),
          [Symbol.iterator]: () => data[Symbol.iterator](),
        });
        return chain(rows);
      },
    }),
    insert: () => ({
      values: (v: Row) => {
        inserted.push(v);
        return { run: () => {}, returning: () => ({ then: (r: (v: Row[]) => void) => r([v]) }) };
      },
    }),
    update: () => ({
      set: (v: Row) => {
        updated.push(v);
        return { where: () => ({ run: () => {} }), run: () => {} };
      },
    }),
    delete: () => ({
      where: () => { deleted.push('deleted'); return { run: () => {} }; },
    }),
  },
}));

mock.module('../../../src/db', () => ({ ...tableStubs,
  mcpTools: T_TOOLS,
  mcpServers: T_SERVERS,
  connectors: T_CONNECTORS,
  toolImplementations: T_IMPLS,
}));

mock.module('../../../src/routes/helpers', () => ({
  nanoid: () => 'new-id-001',
}));

mock.module('../../../src/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../src/paths', () => ({ ...pathsStubs,
  REPO_ROOT: '/mock/repo',
}));

mock.module('../../../src/engine-stubs', () => ({ ...engineStubs,
  getToolToSkillsMap: () => skillMap,
}));

// ── Import route after mocks ────────────────────────────────────────────────

const { default: toolMgmtApp } = await import('../../../src/mcp/tool-management');

function buildApp() {
  const app = new Hono();
  app.route('/api/mcp/tool-management', toolMgmtApp);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  toolRows = [{ ...TOOL }];
  serverRows = [{ ...SERVER }];
  connectorRows = [{ ...CONNECTOR }];
  implRows = [{ ...IMPL }];
  inserted = [];
  updated = [];
  deleted = [];
  skillMap = new Map([['query_subscriber', ['bill-inquiry']]]);
});

describe('GET /api/mcp/tool-management', () => {
  test('returns tool list with skill mapping and risk flags', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management');
    expect(status).toBe(200);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBe(1);
    expect(body.items[0].name).toBe('query_subscriber');
    expect(body.items[0].skills).toEqual(['bill-inquiry']);
    expect(body.items[0].risk_flags).toBeInstanceOf(Array);
  });

  test('returns empty list when no tools exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tool-management');
    expect(body.items).toEqual([]);
  });
});

describe('POST /api/mcp/tool-management', () => {
  test('creates tool definition', async () => {
    // Return no existing tool for duplicate check
    const origRows = toolRows;
    toolRows = [];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management', {
      name: 'check_balance', description: '查询余额', server_id: 'srv-001',
    });
    expect(status).toBe(200);
    expect(body.id).toBe('new-id-001');
    expect(inserted.length).toBe(1);
    expect(inserted[0].name).toBe('check_balance');
    toolRows = origRows;
  });

  test('returns 400 when name is empty', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management', {
      description: '无名工具',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('name');
  });

  test('returns 400 for invalid name format', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management', {
      name: 'InvalidName',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('snake_case');
  });

  test('returns 409 when name already exists', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management', {
      name: 'query_subscriber',
    });
    expect(status).toBe(409);
    expect(body.error).toContain('已存在');
  });
});

describe('GET /api/mcp/tool-management/handlers', () => {
  test('returns available handler servers', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/handlers');
    expect(status).toBe(200);
    expect(body.handlers).toBeInstanceOf(Array);
    expect(body.handlers.length).toBe(2);
    expect(body.handlers[0]).toHaveProperty('key');
    expect(body.handlers[0]).toHaveProperty('tool_name');
    expect(body.handlers[0]).toHaveProperty('server_name');
    expect(body.handlers[0]).toHaveProperty('file');
  });
});

describe('GET /api/mcp/tool-management/:id', () => {
  test('returns tool detail with skills', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/tool-001');
    expect(status).toBe(200);
    expect(body.name).toBe('query_subscriber');
    expect(body.skills).toEqual(['bill-inquiry']);
  });

  test('returns 404 for non-existent tool', async () => {
    toolRows = [];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/nonexistent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('PUT /api/mcp/tool-management/:id', () => {
  test('updates tool metadata', async () => {
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/tool-management/tool-001', {
      description: '更新后的描述',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated.length).toBe(1);
    expect(updated[0].description).toBe('更新后的描述');
  });

  test('returns 404 when tool does not exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/tool-management/nonexistent', { description: 'x' });
    expect(status).toBe(404);
  });
});

describe('DELETE /api/mcp/tool-management/:id', () => {
  test('deletes tool', async () => {
    const app = buildApp();
    const { status, body } = await deleteJSON(app, '/api/mcp/tool-management/tool-001');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deleted.length).toBe(1);
  });
});

describe('PUT /api/mcp/tool-management/:id/mock-rules', () => {
  test('updates mock rules', async () => {
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/tool-management/tool-001/mock-rules', {
      rules: [{ tool_name: 'query_subscriber', match: '*', response: '{"found":false}' }],
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated.length).toBe(1);
  });

  test('clears mock rules when empty array', async () => {
    const app = buildApp();
    await putJSON(app, '/api/mcp/tool-management/tool-001/mock-rules', { rules: [] });
    expect(updated[0].mock_rules).toBeNull();
  });

  test('returns 404 when tool does not exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/tool-management/nonexistent/mock-rules', { rules: [] });
    expect(status).toBe(404);
  });
});

describe('PUT /api/mcp/tool-management/:id/toggle-mock', () => {
  test('toggles mock flag from true to false', async () => {
    toolRows = [{ ...TOOL, mocked: true }];
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/tool-management/tool-001/toggle-mock', {});
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mocked).toBe(false);
  });

  test('toggles mock flag from false to true', async () => {
    toolRows = [{ ...TOOL, mocked: false }];
    const app = buildApp();
    const { body } = await putJSON(app, '/api/mcp/tool-management/tool-001/toggle-mock', {});
    expect(body.mocked).toBe(true);
  });

  test('returns 404 when tool does not exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/tool-management/nonexistent/toggle-mock', {});
    expect(status).toBe(404);
  });
});

describe('POST /api/mcp/tool-management/:id/sql-preview', () => {
  test('generates SELECT SQL preview', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management/tool-001/sql-preview', {
      table: 'subscribers',
      columns: ['phone', 'name', 'status'],
      where: [{ param: 'phone', column: 'phone' }],
    });
    expect(status).toBe(200);
    expect(body.sql).toContain('SELECT phone, name, status');
    expect(body.sql).toContain('FROM subscribers');
    expect(body.sql).toContain('phone = :phone');
    expect(body.table).toBe('subscribers');
  });

  test('generates UPDATE SQL preview', async () => {
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/tool-001/sql-preview', {
      table: 'subscribers', operation: 'update_one',
      where: [{ param: 'id', column: 'id' }],
    });
    expect(body.sql).toContain('UPDATE subscribers');
    expect(body.operation).toBe('update_one');
  });

  test('generates select_many SQL', async () => {
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/tool-001/sql-preview', {
      table: 'bills', operation: 'select_many',
    });
    expect(body.sql).toContain('SELECT * FROM bills');
    expect(body.sql).not.toContain('LIMIT');
  });

  test('returns 400 when table is missing', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management/tool-001/sql-preview', {});
    expect(status).toBe(400);
    expect(body.error).toContain('table');
  });
});

describe('POST /api/mcp/tool-management/:id/validate-output', () => {
  test('returns valid:true when no schema defined', async () => {
    toolRows = [{ ...TOOL, output_schema: null }];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management/tool-001/validate-output', {
      data: { phone: '138' },
    });
    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });

  test('validates data against inline schema', async () => {
    toolRows = [{
      ...TOOL,
      output_schema: JSON.stringify({
        type: 'object',
        required: ['phone', 'name'],
        properties: { phone: { type: 'string' }, name: { type: 'string' } },
      }),
    }];
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/tool-001/validate-output', {
      data: { phone: '13800000001', name: '张三' },
    });
    expect(body.valid).toBe(true);
    expect(body.errors).toEqual([]);
  });

  test('returns errors for missing required fields', async () => {
    toolRows = [{
      ...TOOL,
      output_schema: JSON.stringify({
        type: 'object',
        required: ['phone', 'name'],
        properties: { phone: { type: 'string' }, name: { type: 'string' } },
      }),
    }];
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/tool-001/validate-output', {
      data: { phone: '138' },
    });
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0]).toContain('name');
  });

  test('returns 404 when tool does not exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { status } = await postJSON(app, '/api/mcp/tool-management/nonexistent/validate-output', {
      data: {},
    });
    expect(status).toBe(404);
  });
});

describe('POST /api/mcp/tool-management/infer-schema', () => {
  test('infers schema from sample JSON', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management/infer-schema', {
      example: { phone: '13800000001', balance: 99.5, active: true },
    });
    expect(status).toBe(200);
    expect(body.schema).toBeDefined();
    expect(body.schema.type).toBe('object');
    expect(body.schema.properties.phone.type).toBe('string');
    expect(body.schema.properties.balance.type).toBe('number');
    expect(body.schema.properties.active.type).toBe('boolean');
    expect(body.schema.required).toContain('phone');
  });

  test('infers integer type for whole numbers', async () => {
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/infer-schema', {
      example: { count: 5 },
    });
    expect(body.schema.properties.count.type).toBe('integer');
  });

  test('handles null values as string|null', async () => {
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/infer-schema', {
      example: { name: null },
    });
    expect(body.schema.properties.name.type).toEqual(['string', 'null']);
  });

  test('handles nested arrays', async () => {
    const app = buildApp();
    const { body } = await postJSON(app, '/api/mcp/tool-management/infer-schema', {
      example: { items: [{ id: 1, name: 'a' }] },
    });
    expect(body.schema.properties.items.type).toBe('array');
    expect(body.schema.properties.items.items.type).toBe('object');
  });

  test('returns 400 when example is not an object', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/tool-management/infer-schema', {
      example: 'not an object',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('object');
  });
});

describe('GET /api/mcp/tool-management/:id/implementation', () => {
  test('returns implementation detail with connector', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/tool-001/implementation');
    expect(status).toBe(200);
    expect(body.adapter_type).toBe('script');
    expect(body.connector).toBeDefined();
    expect(body._source).toBe('tool_implementations');
  });

  test('returns none source when no implementation exists', async () => {
    implRows = [];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/tool-001/implementation');
    expect(status).toBe(200);
    expect(body._source).toBe('none');
  });

  test('returns 404 when tool does not exist and no impl', async () => {
    implRows = [];
    toolRows = [];
    const app = buildApp();
    const { status } = await getJSON(app, '/api/mcp/tool-management/nonexistent/implementation');
    expect(status).toBe(404);
  });
});

describe('PUT /api/mcp/tool-management/:id/implementation', () => {
  test('updates existing implementation', async () => {
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/tool-management/tool-001/implementation', {
      adapter_type: 'db', connector_id: 'conn-001',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated.length).toBe(1);
  });

  test('creates new implementation when none exists', async () => {
    implRows = [];
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/tool-management/tool-001/implementation', {
      adapter_type: 'api_call', handler_key: 'account.check',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(inserted.length).toBe(1);
    expect(inserted[0].adapter_type).toBe('api_call');
  });

  test('returns 404 when tool does not exist', async () => {
    toolRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/tool-management/nonexistent/implementation', {
      adapter_type: 'script',
    });
    expect(status).toBe(404);
  });
});

// ── Runtime Bindings ──────────────────────────────────────────────────────────

describe('GET /api/mcp/tool-management/bindings', () => {
  test('returns joined tool + impl + connector + server data', async () => {
    serverRows = [{ ...SERVER, kind: 'internal' }];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/bindings');
    expect(status).toBe(200);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBe(1);
    const item = body.items[0];
    expect(item.tool_id).toBe('tool-001');
    expect(item.tool_name).toBe('query_subscriber');
    expect(item.server_name).toBe('internal-service');
    expect(item.adapter_type).toBe('script');
    expect(item.connector_id).toBe('conn-001');
    expect(item.connector_name).toBe('account-db');
    expect(item.handler_key).toBe('user_info.query_subscriber');
    expect(item.impl_status).toBe('active');
    expect(item.host_server_id).toBe('srv-001');
    expect(item.host_server_name).toBe('internal-service');
    expect(item.contract_ready).toBe(false); // TOOL has input_schema but no output_schema
    expect(item.disabled).toBe(false);
    expect(item.mocked).toBe(true);
  });

  test('returns null fields when tool has no implementation', async () => {
    implRows = [];
    connectorRows = [];
    serverRows = [{ ...SERVER, kind: 'internal' }];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/bindings');
    expect(status).toBe(200);
    expect(body.items.length).toBe(1);
    const item = body.items[0];
    expect(item.impl_id).toBeNull();
    expect(item.adapter_type).toBeNull();
    expect(item.connector_id).toBeNull();
    expect(item.handler_key).toBeNull();
    expect(item.host_server_id).toBeNull();
    expect(item.host_server_name).toBeNull();
    expect(item.contract_ready).toBe(false);
  });

  test('returns empty list when no tools', async () => {
    toolRows = [];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tool-management/bindings');
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
  });
});
