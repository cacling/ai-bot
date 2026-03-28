/**
 * API tests for: src/agent/km/mcp/servers.ts
 * Routes: GET/POST/PUT/DELETE /api/mcp/servers, POST discover/health/invoke/mock-invoke
 * Mock: db(mcpServers, mcpTools, connectors), MCP(Client), mock-engine
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON, postJSON, putJSON, deleteJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const SERVER = {
  id: 'srv-001', name: 'account-service', description: '账户服务',
  transport: 'http', enabled: true, kind: 'internal',
  url: 'http://localhost:18003/mcp', headers_json: null,
  command: null, args_json: null, cwd: null,
  env_json: null, env_prod_json: null, env_test_json: null,
  tools_json: JSON.stringify([{ name: 'query_subscriber', description: '查询用户' }]),
  disabled_tools: null, mocked_tools: null, mock_rules: null,
  last_connected_at: null, created_at: '2026-03-01', updated_at: '2026-03-01',
};

const TOOL_DB_ROW = {
  id: 'tool-001', name: 'query_subscriber', description: '查询用户',
  server_id: 'srv-001', disabled: false, mocked: true,
  input_schema: null, response_example: null, annotations: null,
};

const IMPL_ROW = {
  id: 'impl-001', tool_id: 'tool-001', adapter_type: 'script',
  host_server_id: 'srv-001', connector_id: null,
  config: null, handler_key: 'user_info.query_subscriber', status: 'active',
};

const CONNECTOR_ROW = {
  id: 'conn-001', name: 'account-db', type: 'sqlite', status: 'active', server_id: 'srv-001',
};

// ── Mutable state ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
let serverRows: Row[] = [];
let toolDbRows: Row[] = [];
let connectorRows: Row[] = [];
let implRows: Row[] = [];
let inserted: Row[] = [];
let updated: Row[] = [];
let deleted: string[] = [];
let mockRuleResult: string | null = null;

// ── Mock tables ─────────────────────────────────────────────────────────────

const T_SERVERS = Symbol('mcpServers');
const T_TOOLS = Symbol('mcpTools');
const T_CONNECTORS = Symbol('connectors');
const T_IMPLS = Symbol('toolImplementations');

function getRowsForTable(table: unknown): Row[] {
  if (table === T_TOOLS) return toolDbRows;
  if (table === T_CONNECTORS) return connectorRows;
  if (table === T_IMPLS) return implRows;
  return serverRows;
}

mock.module('../../../../../src/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows = getRowsForTable(table);
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

mock.module('../../../../../src/db/schema', () => ({
  mcpServers: T_SERVERS,
  mcpTools: T_TOOLS,
  connectors: T_CONNECTORS,
  toolImplementations: T_IMPLS,
}));

mock.module('../../../../../src/db/nanoid', () => ({
  nanoid: () => 'new-id-001',
}));

mock.module('../../../../../src/services/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

mock.module('../../../../../src/services/mock-engine', () => ({
  matchMockRule: () => mockRuleResult,
}));

// Mock MCP Client — avoid real network calls
mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    async connect() {}
    async listTools() { return { tools: [{ name: 'query_subscriber', description: '查询', inputSchema: {} }] }; }
    async callTool() { return { content: [{ type: 'text', text: '{"found":true}' }] }; }
    async close() {}
  },
}));

mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class { constructor() {} },
}));

// ── Import route after mocks ────────────────────────────────────────────────

const { default: serversApp } = await import('../../../../../src/agent/km/mcp/servers');

function buildApp() {
  const app = new Hono();
  app.route('/api/mcp/servers', serversApp);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  serverRows = [{ ...SERVER }];
  toolDbRows = [{ ...TOOL_DB_ROW }];
  connectorRows = [{ ...CONNECTOR_ROW }];
  implRows = [{ ...IMPL_ROW }];
  inserted = [];
  updated = [];
  deleted = [];
  mockRuleResult = null;
});

describe('GET /api/mcp/servers', () => {
  test('returns server list from db', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/servers');
    expect(status).toBe(200);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].name).toBe('account-service');
  });
});

describe('POST /api/mcp/servers', () => {
  test('creates server with name, url, port', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers', {
      name: 'billing-service', url: 'http://localhost:18004/mcp',
    });
    expect(status).toBe(200);
    expect(body.id).toBe('new-id-001');
    expect(inserted.length).toBe(1);
    expect(inserted[0].name).toBe('billing-service');
  });

  test('creates server with default values for optional fields', async () => {
    const app = buildApp();
    await postJSON(app, '/api/mcp/servers', { name: 'test-service' });
    expect(inserted[0].transport).toBe('http');
    expect(inserted[0].enabled).toBe(true);
  });
});

describe('GET /api/mcp/servers/:id', () => {
  test('returns server detail', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/servers/srv-001');
    expect(status).toBe(200);
    expect(body.name).toBe('account-service');
    expect(body.id).toBe('srv-001');
  });

  test('returns 404 for non-existent server', async () => {
    serverRows = [];
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/servers/nonexistent');
    expect(status).toBe(404);
    expect(body.error).toBeDefined();
  });
});

describe('PUT /api/mcp/servers/:id', () => {
  test('updates server configuration', async () => {
    const app = buildApp();
    const { status, body } = await putJSON(app, '/api/mcp/servers/srv-001', {
      name: 'account-service-v2', description: '更新后的账户服务',
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('account-service-v2');
  });

  test('returns 404 when server does not exist', async () => {
    serverRows = [];
    const app = buildApp();
    const { status } = await putJSON(app, '/api/mcp/servers/nonexistent', { name: 'x' });
    expect(status).toBe(404);
  });
});

describe('DELETE /api/mcp/servers/:id', () => {
  test('returns 403 when deleting internal server', async () => {
    const app = buildApp();
    const { status, body } = await deleteJSON(app, '/api/mcp/servers/srv-001');
    expect(status).toBe(403);
    expect(body.error).toContain('Internal');
    expect(deleted.length).toBe(0);
  });

  test('deletes external server', async () => {
    serverRows = [{ ...SERVER, kind: 'external' }];
    const app = buildApp();
    const { status, body } = await deleteJSON(app, '/api/mcp/servers/srv-001');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deleted.length).toBe(1);
  });

  test('returns 404 when server not found', async () => {
    serverRows = [];
    const app = buildApp();
    const { status } = await deleteJSON(app, '/api/mcp/servers/nonexistent');
    expect(status).toBe(404);
  });
});

describe('GET /api/mcp/servers/:id/health', () => {
  test('returns health info with connector and tool summaries', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/servers/srv-001/health');
    expect(status).toBe(200);
    expect(body.server_id).toBe('srv-001');
    expect(body.server_name).toBe('account-service');
    expect(body.kind).toBe('internal');
    expect(body.connectors).toBeInstanceOf(Array);
    expect(body.connector_count).toBe(1);
    expect(body.tools).toBeDefined();
    expect(body.tools.total).toBe(1);
    expect(body.tools.mocked).toBe(1);
  });

  test('returns 404 when server not found', async () => {
    serverRows = [];
    const app = buildApp();
    const { status } = await getJSON(app, '/api/mcp/servers/nonexistent/health');
    expect(status).toBe(404);
  });
});

describe('POST /api/mcp/servers/:id/invoke', () => {
  test('invokes tool on MCP server and returns result', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/invoke', {
      tool_name: 'query_subscriber', arguments: { phone: '13800000001' },
    });
    expect(status).toBe(200);
    expect(body.result).toBeDefined();
    expect(body.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  test('returns 400 when tool_name is missing', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/invoke', {});
    expect(status).toBe(400);
    expect(body.error).toContain('tool_name');
  });

  test('returns 404 when server not found', async () => {
    serverRows = [];
    const app = buildApp();
    const { status } = await postJSON(app, '/api/mcp/servers/nonexistent/invoke', {
      tool_name: 'query_subscriber',
    });
    expect(status).toBe(404);
  });

  test('returns 400 when server is in planned status', async () => {
    serverRows = [{ ...SERVER, kind: 'planned' }];
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/invoke', {
      tool_name: 'query_subscriber',
    });
    expect(status).toBe(400);
    expect(body.error).toContain('planned');
  });
});

describe('POST /api/mcp/servers/:id/mock-invoke', () => {
  test('returns mock result when rule matches', async () => {
    mockRuleResult = '{"found":true,"name":"测试用户"}';
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/mock-invoke', {
      tool_name: 'query_subscriber', arguments: { phone: '13800000001' },
    });
    expect(status).toBe(200);
    expect(body.mock).toBe(true);
    expect(body.result.content[0].text).toBe('{"found":true,"name":"测试用户"}');
    expect(body.elapsed_ms).toBe(0);
  });

  test('returns 404 when no mock rule matches', async () => {
    mockRuleResult = null;
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/mock-invoke', {
      tool_name: 'unknown_tool', arguments: {},
    });
    expect(status).toBe(404);
    expect(body.error).toContain('No mock rules');
  });

  test('returns 400 when tool_name is missing', async () => {
    const app = buildApp();
    const { status, body } = await postJSON(app, '/api/mcp/servers/srv-001/mock-invoke', {});
    expect(status).toBe(400);
    expect(body.error).toContain('tool_name');
  });

  test('returns 404 when server not found', async () => {
    serverRows = [];
    const app = buildApp();
    const { status } = await postJSON(app, '/api/mcp/servers/nonexistent/mock-invoke', {
      tool_name: 'query_subscriber',
    });
    expect(status).toBe(404);
  });
});
