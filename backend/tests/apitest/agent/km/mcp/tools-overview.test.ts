/**
 * API tests for: src/agent/km/mcp/tools-overview.ts
 * Routes: GET /api/mcp/tools
 * Mock: db(mcpServers, mcpTools), skills(getToolToSkillsMap)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { getJSON } from '../../../helpers';

// ── Mock data ───────────────────────────────────────────────────────────────

const TOOL_ROW = {
  id: 'tool-001', name: 'query_subscriber', description: '查询用户信息',
  server_id: 'srv-001', disabled: false, mocked: false,
  input_schema: JSON.stringify({ type: 'object', properties: { phone: { type: 'string' } } }),
  response_example: null, annotations: null,
};

const TOOL_ROW_DISABLED = {
  id: 'tool-002', name: 'cancel_service', description: '退订服务',
  server_id: 'srv-001', disabled: true, mocked: false,
  input_schema: null, response_example: null, annotations: null,
};

const TOOL_ROW_MOCKED = {
  id: 'tool-003', name: 'query_bill', description: '查询账单',
  server_id: 'srv-001', disabled: false, mocked: true,
  input_schema: null, response_example: null, annotations: null,
};

const SERVER_ROW = {
  id: 'srv-001', name: 'account-service', status: 'active', enabled: true,
  tools_json: null, disabled_tools: null, mocked_tools: null,
};

// ── Mutable mock state ──────────────────────────────────────────────────────

let toolRows: Record<string, unknown>[] = [];
let serverRows: Record<string, unknown>[] = [];
let skillMap = new Map<string, string[]>();

// ── Mock modules ────────────────────────────────────────────────────────────

const MOCK_TABLE_TOOLS = Symbol('mcpTools');
const MOCK_TABLE_SERVERS = Symbol('mcpServers');

mock.module('../../../../../src/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows = table === MOCK_TABLE_TOOLS ? toolRows : serverRows;
        const chain = (data: Record<string, unknown>[] = rows) => ({
          where: () => chain(data),
          orderBy: () => chain(data),
          all: () => data,
          get: () => data[0] ?? null,
          then: (resolve: (v: Record<string, unknown>[]) => void) => resolve(data),
          [Symbol.iterator]: () => data[Symbol.iterator](),
          map: (fn: (v: Record<string, unknown>) => unknown) => data.map(fn),
        });
        return chain(rows);
      },
    }),
  },
}));

mock.module('../../../../../src/db/schema', () => ({
  mcpServers: MOCK_TABLE_SERVERS,
  mcpTools: MOCK_TABLE_TOOLS,
}));

mock.module('../../../../../src/engine/skills', () => ({
  getToolToSkillsMap: () => skillMap,
}));

// ── Import route after mocks ────────────────────────────────────────────────

const { default: toolsOverviewApp } = await import('../../../../../src/agent/km/mcp/tools-overview');

function buildApp() {
  const app = new Hono();
  app.route('/api/mcp/tools', toolsOverviewApp);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/mcp/tools', () => {
  beforeEach(() => {
    toolRows = [TOOL_ROW];
    serverRows = [SERVER_ROW];
    skillMap = new Map([['query_subscriber', ['bill-inquiry', 'plan-inquiry']]]);
  });

  test('returns tool overview list with server and skill mapping', async () => {
    const app = buildApp();
    const { status, body } = await getJSON(app, '/api/mcp/tools');

    expect(status).toBe(200);
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items.length).toBeGreaterThan(0);

    // Find the MCP tool
    const tool = body.items.find((t: any) => t.name === 'query_subscriber');
    expect(tool).toBeDefined();
    expect(tool.source).toBe('account-service');
    expect(tool.skills).toEqual(['bill-inquiry', 'plan-inquiry']);
    expect(tool.source_type).toBe('mcp');
  });

  test('each tool has name, description, source, status, mocked, skills fields', async () => {
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    for (const item of body.items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('mocked');
      expect(item).toHaveProperty('skills');
      expect(typeof item.name).toBe('string');
      expect(typeof item.mocked).toBe('boolean');
      expect(Array.isArray(item.skills)).toBe(true);
    }
  });

  test('includes disabled tools with disabled status', async () => {
    toolRows = [TOOL_ROW, TOOL_ROW_DISABLED];
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    const disabled = body.items.find((t: any) => t.name === 'cancel_service');
    expect(disabled).toBeDefined();
    expect(disabled.status).toBe('disabled');
  });

  test('includes mocked flag on tools', async () => {
    toolRows = [TOOL_ROW, TOOL_ROW_MOCKED];
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    const mocked = body.items.find((t: any) => t.name === 'query_bill');
    expect(mocked).toBeDefined();
    expect(mocked.mocked).toBe(true);

    const notMocked = body.items.find((t: any) => t.name === 'query_subscriber');
    expect(notMocked).toBeDefined();
    expect(notMocked.mocked).toBe(false);
  });

  test('includes builtin tools (get_skill_instructions, transfer_to_human)', async () => {
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    const builtin = body.items.find((t: any) => t.name === 'get_skill_instructions');
    expect(builtin).toBeDefined();
    expect(builtin.source_type).toBe('builtin');
    expect(builtin.status).toBe('available');

    const transfer = body.items.find((t: any) => t.name === 'transfer_to_human');
    expect(transfer).toBeDefined();
    expect(transfer.source_type).toBe('builtin');
  });

  test('shows missing/planned tools referenced by skills but not registered', async () => {
    skillMap = new Map([
      ['query_subscriber', ['bill-inquiry']],
      ['some_future_tool', ['fault-diagnosis']],
    ]);
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    const planned = body.items.find((t: any) => t.name === 'some_future_tool');
    expect(planned).toBeDefined();
    expect(planned.status).toBe('planned');
    expect(planned.source).toBe('(未注册)');
    expect(planned.skills).toEqual(['fault-diagnosis']);
  });

  test('returns empty items array when no tools exist', async () => {
    toolRows = [];
    serverRows = [];
    skillMap = new Map();
    const app = buildApp();
    const { body } = await getJSON(app, '/api/mcp/tools');

    expect(body.items).toBeInstanceOf(Array);
    // Should still have builtin tools
    const builtins = body.items.filter((t: any) => t.source_type === 'builtin');
    expect(builtins.length).toBe(3);
  });
});
