/**
 * mcp/servers.ts — MCP Server CRUD + discover + invoke + mock
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { mcpServers, mcpTools, connectors, toolImplementations } from '../../../db/schema';
import { nanoid } from '../../../db/nanoid';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../../../services/logger';
import { matchMockRule } from '../../../services/mock-engine';

const app = new Hono();

const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const { keyword, transport, kind } = c.req.query();
  let rows = db.select().from(mcpServers).all();
  if (keyword) rows = rows.filter(r => r.name.includes(keyword) || r.description.includes(keyword));
  if (transport) rows = rows.filter(r => r.transport === transport);
  if (kind) rows = rows.filter(r => r.kind === kind);
  return c.json({ items: rows });
});

// ── Get ──────────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// ── Create ───────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json();
  const id = nanoid();
  db.insert(mcpServers).values({
    id,
    name: body.name,
    description: body.description ?? '',
    transport: body.transport ?? 'http',
    enabled: body.enabled ?? true,
    kind: body.kind ?? 'internal',
    url: body.url ?? null,
    headers_json: body.headers_json ?? null,
    command: body.command ?? null,
    args_json: body.args_json ?? null,
    cwd: body.cwd ?? null,
    env_json: body.env_json ?? null,
    env_prod_json: body.env_prod_json ?? null,
    env_test_json: body.env_test_json ?? null,
    tools_json: body.tools_json ?? null,
    disabled_tools: body.disabled_tools ?? null,
    mocked_tools: body.mocked_tools ?? null,
    mock_rules: body.mock_rules ?? null,
    created_at: now(),
    updated_at: now(),
  }).run();
  logger.info('mcp', 'server_created', { id, name: body.name });
  return c.json({ id });
});

// ── Update ───────────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpServers).set({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    transport: body.transport ?? existing.transport,
    enabled: body.enabled ?? existing.enabled,
    kind: body.kind ?? existing.kind,
    url: body.url ?? existing.url,
    headers_json: body.headers_json ?? existing.headers_json,
    command: body.command ?? existing.command,
    args_json: body.args_json ?? existing.args_json,
    cwd: body.cwd ?? existing.cwd,
    env_json: body.env_json ?? existing.env_json,
    env_prod_json: body.env_prod_json ?? existing.env_prod_json,
    env_test_json: body.env_test_json ?? existing.env_test_json,
    tools_json: body.tools_json ?? existing.tools_json,
    disabled_tools: body.disabled_tools ?? existing.disabled_tools,
    mocked_tools: body.mocked_tools ?? existing.mocked_tools,
    mock_rules: body.mock_rules ?? existing.mock_rules,
    updated_at: now(),
  }).where(eq(mcpServers.id, id)).run();
  logger.info('mcp', 'server_updated', { id });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.kind === 'internal') {
    return c.json({ error: 'Internal servers cannot be deleted (managed by start.sh)' }, 403);
  }
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
  logger.info('mcp', 'server_deleted', { id });
  return c.json({ ok: true });
});

// ── Discover tools (shared logic) ────────────────────────────────────────────

/**
 * 连接 MCP Server，发现工具并合并写入 DB。
 * - 远端有的：更新 description 和 inputSchema
 * - 远端没有但本地手动添加的：保留（用户可能还没在代码中实现）
 * - 关联数据（disabled_tools、mocked_tools、mock_rules）中引用已不在 merged 列表中的工具会被清理
 * 返回合并后的工具列表，失败时抛异常。
 */
export async function discoverServerTools(serverId: string): Promise<Array<Record<string, unknown>>> {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
  if (!row) throw new Error('Server not found');
  if (row.kind === 'planned') throw new Error('Server is in planned status');
  if (!row.url && row.transport !== 'stdio') throw new Error('No URL configured');

  const mcpClient = new Client({ name: 'mcp-sync', version: '1.0' });
  await mcpClient.connect(new StreamableHTTPClientTransport(new URL(row.url!)));
  const { tools } = await mcpClient.listTools();
  await mcpClient.close();

  // Merge: update existing tools' inputSchema/description, add new ones
  const existing: Array<Record<string, unknown>> = row.tools_json ? JSON.parse(row.tools_json) : [];
  const existingMap = new Map(existing.map(t => [t.name as string, t]));

  const merged: Array<Record<string, unknown>> = [];
  const remoteNames = new Set<string>();

  // Remote tools: update or add
  for (const t of tools) {
    remoteNames.add(t.name);
    const local = existingMap.get(t.name);
    merged.push({
      ...(local ?? {}),
      name: t.name,
      description: t.description ?? local?.description ?? '',
      inputSchema: t.inputSchema,
    });
  }

  // Local-only tools: 保留手动添加但远端还没实现的工具
  for (const t of existing) {
    if (!remoteNames.has(t.name as string)) merged.push(t);
  }

  // 合并后的所有工具名（远端 + 本地手动添加）
  const allToolNames = new Set(merged.map(t => t.name as string));

  // 清理关联数据：只清理 merged 中已经不存在的工具
  const disabledTools: string[] = row.disabled_tools ? JSON.parse(row.disabled_tools) : [];
  const mockedTools: string[] = row.mocked_tools ? JSON.parse(row.mocked_tools) : [];
  const mockRules: Array<{ tool_name: string; match: string; response: string }> = row.mock_rules ? JSON.parse(row.mock_rules) : [];

  const cleanedDisabled = disabledTools.filter(n => allToolNames.has(n));
  const cleanedMocked = mockedTools.filter(n => allToolNames.has(n));
  const cleanedMockRules = mockRules.filter(r => allToolNames.has(r.tool_name));

  db.update(mcpServers).set({
    tools_json: JSON.stringify(merged),
    disabled_tools: cleanedDisabled.length > 0 ? JSON.stringify(cleanedDisabled) : null,
    mocked_tools: cleanedMocked.length > 0 ? JSON.stringify(cleanedMocked) : null,
    mock_rules: cleanedMockRules.length > 0 ? JSON.stringify(cleanedMockRules) : null,
    last_connected_at: now(),
    updated_at: now(),
  }).where(eq(mcpServers.id, row.id)).run();

  logger.info('mcp', 'tools_synced', { id: row.id, name: row.name, remote: tools.length, total: merged.length });
  return merged;
}

// ── Discover tools (HTTP endpoint) ──────────────────────────────────────────
app.post('/:id/discover', async (c) => {
  try {
    const merged = await discoverServerTools(c.req.param('id'));
    return c.json({ tools: merged });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('not found')) return c.json({ error: 'Not found' }, 404);
    if (msg.includes('planned')) return c.json({ error: 'Server is in planned status, cannot connect' }, 400);
    logger.error('mcp', 'discover_error', { id: c.req.param('id'), error: msg });
    return c.json({ error: `Connection failed: ${msg}` }, 502);
  }
});

// ── Health info (aggregated) ─────────────────────────────────────────────────
app.get('/:id/health', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);

  // Aggregate connector + tool health
  const conns = db.select().from(connectors).where(eq(connectors.server_id, row.id)).all();
  const tools = db.select().from(mcpTools).where(eq(mcpTools.server_id, row.id)).all();

  const resourceSummary = conns.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
  }));

  // Check which tools have implementations
  const allImpls = db.select().from(toolImplementations).all();
  const toolsWithImpl = new Set(allImpls.filter(i => i.host_server_id === row.id).map(i => i.tool_id));

  const toolsSummary = {
    total: tools.length,
    ready: tools.filter(t => toolsWithImpl.has(t.id) && !t.disabled).length,
    mocked: tools.filter(t => t.mocked).length,
    disabled: tools.filter(t => t.disabled).length,
    unconfigured: tools.filter(t => !toolsWithImpl.has(t.id) && !t.disabled).length,
  };

  return c.json({
    server_id: row.id,
    server_name: row.name,
    enabled: row.enabled,
    kind: row.kind,
    last_connected_at: row.last_connected_at,
    connectors: resourceSummary,
    connector_count: conns.length,
    tools: toolsSummary,
  });
});

// ── Invoke a tool (real MCP call) ────────────────────────────────────────────
app.post('/:id/invoke', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.kind === 'planned') return c.json({ error: 'Server is in planned status' }, 400);

  const { tool_name, arguments: toolArgs } = await c.req.json();
  if (!tool_name) return c.json({ error: 'tool_name is required' }, 400);

  try {
    const mcpClient = new Client({ name: 'mcp-manager', version: '1.0' });
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(row.url!)));

    const t0 = Date.now();
    const result = await mcpClient.callTool({ name: tool_name, arguments: toolArgs ?? {} });
    const elapsed = Date.now() - t0;

    await mcpClient.close();

    logger.info('mcp', 'tool_invoked', { id: row.id, tool: tool_name, ms: elapsed });
    return c.json({ result, elapsed_ms: elapsed });
  } catch (err) {
    logger.error('mcp', 'invoke_error', { id: row.id, tool: tool_name, error: String(err) });
    return c.json({ error: `Invoke failed: ${String(err)}` }, 502);
  }
});

// ── Mock invoke (match rules, return mock data) ──────────────────────────────
app.post('/:id/mock-invoke', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);

  const { tool_name, arguments: toolArgs } = await c.req.json();
  if (!tool_name) return c.json({ error: 'tool_name is required' }, 400);

  const mockText = matchMockRule(tool_name, toolArgs ?? {});
  if (mockText === null) {
    return c.json({ error: `No mock rules defined for tool "${tool_name}"` }, 404);
  }

  return c.json({
    result: { content: [{ type: 'text', text: mockText }] },
    elapsed_ms: 0,
    mock: true,
    matched_rule: '(matched)',
  });
});

export default app;
