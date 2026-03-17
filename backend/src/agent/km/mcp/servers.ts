/**
 * mcp/servers.ts — MCP Server CRUD + discover + invoke + mock
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { mcpServers } from '../../../db/schema';
import { nanoid } from '../../../db/nanoid';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../../../services/logger';

const app = new Hono();

const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const { keyword, transport, status } = c.req.query();
  let rows = db.select().from(mcpServers).all();
  if (keyword) rows = rows.filter(r => r.name.includes(keyword) || r.description.includes(keyword));
  if (transport) rows = rows.filter(r => r.transport === transport);
  if (status) rows = rows.filter(r => r.status === status);
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
    status: body.status ?? 'active',
    enabled: body.enabled ?? true,
    url: body.url ?? null,
    headers_json: body.headers_json ?? null,
    command: body.command ?? null,
    args_json: body.args_json ?? null,
    cwd: body.cwd ?? null,
    env_json: body.env_json ?? null,
    env_prod_json: body.env_prod_json ?? null,
    env_test_json: body.env_test_json ?? null,
    tools_cache: body.tools_cache ?? null,
    tools_manual: body.tools_manual ?? null,
    disabled_tools: body.disabled_tools ?? null,
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
    status: body.status ?? existing.status,
    enabled: body.enabled ?? existing.enabled,
    url: body.url ?? existing.url,
    headers_json: body.headers_json ?? existing.headers_json,
    command: body.command ?? existing.command,
    args_json: body.args_json ?? existing.args_json,
    cwd: body.cwd ?? existing.cwd,
    env_json: body.env_json ?? existing.env_json,
    env_prod_json: body.env_prod_json ?? existing.env_prod_json,
    env_test_json: body.env_test_json ?? existing.env_test_json,
    tools_manual: body.tools_manual ?? existing.tools_manual,
    disabled_tools: body.disabled_tools ?? existing.disabled_tools,
    mock_rules: body.mock_rules ?? existing.mock_rules,
    updated_at: now(),
  }).where(eq(mcpServers.id, id)).run();
  logger.info('mcp', 'server_updated', { id });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run();
  logger.info('mcp', 'server_deleted', { id });
  return c.json({ ok: true });
});

// ── Discover tools ───────────────────────────────────────────────────────────
app.post('/:id/discover', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.status === 'planned') return c.json({ error: 'Server is in planned status, cannot connect' }, 400);
  if (!row.url && row.transport !== 'stdio') return c.json({ error: 'No URL configured' }, 400);

  try {
    const mcpClient = new Client({ name: 'mcp-manager', version: '1.0' });
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(row.url!)));

    const { tools } = await mcpClient.listTools();
    const toolsInfo = tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));

    await mcpClient.close();

    db.update(mcpServers).set({
      tools_cache: JSON.stringify(toolsInfo),
      last_connected_at: now(),
      updated_at: now(),
    }).where(eq(mcpServers.id, row.id)).run();

    logger.info('mcp', 'tools_discovered', { id: row.id, name: row.name, count: toolsInfo.length });
    return c.json({ tools: toolsInfo });
  } catch (err) {
    logger.error('mcp', 'discover_error', { id: row.id, error: String(err) });
    return c.json({ error: `Connection failed: ${String(err)}` }, 502);
  }
});

// ── Invoke a tool (real MCP call) ────────────────────────────────────────────
app.post('/:id/invoke', async (c) => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.status === 'planned') return c.json({ error: 'Server is in planned status' }, 400);

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

  const rules: Array<{ tool_name: string; match: string; response: string }> =
    row.mock_rules ? JSON.parse(row.mock_rules) : [];
  const toolRules = rules.filter(r => r.tool_name === tool_name);

  if (toolRules.length === 0) {
    return c.json({ error: `No mock rules defined for tool "${tool_name}"` }, 404);
  }

  // Find matching rule: evaluate match expression against args
  const args = toolArgs ?? {};
  let matched: typeof toolRules[0] | undefined;

  for (const rule of toolRules) {
    if (!rule.match || rule.match.trim() === '' || rule.match.trim() === '*') {
      // Default/fallback rule
      if (!matched) matched = rule;
      continue;
    }
    try {
      // Simple match: evaluate as JS expression with args in scope
      // e.g. "phone == '13800000001'" or "issue_type == 'slow_data'"
      const fn = new Function(...Object.keys(args), `return (${rule.match})`);
      if (fn(...Object.values(args))) {
        matched = rule;
        break; // First specific match wins
      }
    } catch {
      // Invalid expression, skip
    }
  }

  if (!matched) {
    return c.json({ error: 'No matching mock rule found', args }, 404);
  }

  let response: unknown;
  try {
    response = JSON.parse(matched.response);
  } catch {
    response = matched.response;
  }

  logger.info('mcp', 'mock_invoked', { id: row.id, tool: tool_name, match: matched.match ?? '(default)' });
  return c.json({
    result: { content: [{ type: 'text', text: typeof response === 'string' ? response : JSON.stringify(response) }] },
    elapsed_ms: 0,
    mock: true,
    matched_rule: matched.match || '(default)',
  });
});

export default app;
