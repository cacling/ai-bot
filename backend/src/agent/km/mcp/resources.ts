/**
 * mcp/resources.ts — MCP 资源 CRUD
 *
 * GET    /                     — 列出某 server 下的资源
 * POST   /                     — 新建资源
 * GET    /:id                  — 获取资源详情
 * PUT    /:id                  — 更新资源
 * DELETE /:id                  — 删除资源
 * POST   /:id/discover         — Remote MCP 资源：发现工具
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { mcpResources, mcpTools } from '../../../db/schema';
import { nanoid } from '../../../db/nanoid';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../../../services/logger';

const app = new Hono();
const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const serverId = c.req.query('server_id');
  const rows = serverId
    ? db.select().from(mcpResources).where(eq(mcpResources.server_id, serverId)).all()
    : db.select().from(mcpResources).all();
  return c.json({ items: rows });
});

// ── Create ───────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json();
  const id = nanoid();
  db.insert(mcpResources).values({
    id,
    server_id: body.server_id,
    name: body.name,
    type: body.type,
    status: body.status ?? 'active',
    db_mode: body.db_mode ?? null,
    mcp_transport: body.mcp_transport ?? null,
    mcp_url: body.mcp_url ?? null,
    mcp_headers: body.mcp_headers ?? null,
    api_base_url: body.api_base_url ?? null,
    api_headers: body.api_headers ?? null,
    api_timeout: body.api_timeout ?? null,
    env_json: body.env_json ?? null,
    env_prod_json: body.env_prod_json ?? null,
    env_test_json: body.env_test_json ?? null,
    description: body.description ?? null,
    created_at: now(),
    updated_at: now(),
  }).run();
  logger.info('mcp', 'resource_created', { id, name: body.name, type: body.type });
  return c.json({ id });
});

// ── Get ──────────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const row = db.select().from(mcpResources).where(eq(mcpResources.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// ── Update ───────────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpResources).where(eq(mcpResources.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpResources).set({
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    status: body.status ?? existing.status,
    db_mode: body.db_mode ?? existing.db_mode,
    mcp_transport: body.mcp_transport ?? existing.mcp_transport,
    mcp_url: body.mcp_url ?? existing.mcp_url,
    mcp_headers: body.mcp_headers ?? existing.mcp_headers,
    api_base_url: body.api_base_url ?? existing.api_base_url,
    api_headers: body.api_headers ?? existing.api_headers,
    api_timeout: body.api_timeout ?? existing.api_timeout,
    env_json: body.env_json ?? existing.env_json,
    env_prod_json: body.env_prod_json ?? existing.env_prod_json,
    env_test_json: body.env_test_json ?? existing.env_test_json,
    description: body.description ?? existing.description,
    updated_at: now(),
  }).where(eq(mcpResources.id, id)).run();
  logger.info('mcp', 'resource_updated', { id });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  db.delete(mcpResources).where(eq(mcpResources.id, id)).run();
  logger.info('mcp', 'resource_deleted', { id });
  return c.json({ ok: true });
});

// ── Discover tools (Remote MCP 资源专用) ─────────────────────────────────────
app.post('/:id/discover', async (c) => {
  const resource = db.select().from(mcpResources).where(eq(mcpResources.id, c.req.param('id'))).get();
  if (!resource) return c.json({ error: 'Resource not found' }, 404);
  if (resource.type !== 'remote_mcp') return c.json({ error: 'Only Remote MCP resources can discover tools' }, 400);
  if (!resource.mcp_url) return c.json({ error: 'No URL configured' }, 400);

  try {
    const mcpClient = new Client({ name: 'resource-discover', version: '1.0' });
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(resource.mcp_url)));
    const { tools } = await mcpClient.listTools();
    await mcpClient.close();

    let created = 0;
    let updated = 0;
    for (const t of tools) {
      const existing = db.select().from(mcpTools).where(eq(mcpTools.name, t.name)).get();
      if (existing) {
        // 更新 inputSchema 和 description
        db.update(mcpTools).set({
          description: t.description ?? existing.description,
          input_schema: t.inputSchema ? JSON.stringify(t.inputSchema) : existing.input_schema,
          updated_at: now(),
        }).where(eq(mcpTools.id, existing.id)).run();
        updated++;
      } else {
        // 新建工具，绑定到该资源所属的 server + 该资源
        db.insert(mcpTools).values({
          id: nanoid(),
          name: t.name,
          description: t.description ?? '',
          server_id: resource.server_id,
          input_schema: t.inputSchema ? JSON.stringify(t.inputSchema) : null,
          execution_config: JSON.stringify({
            impl_type: 'remote_mcp',
            resource_id: resource.id,
            remote_mcp: { tool_name: t.name },
          }),
          mocked: false,
          disabled: false,
          created_at: now(),
          updated_at: now(),
        }).run();
        created++;
      }
    }

    logger.info('mcp', 'resource_discover', { resource_id: resource.id, remote: tools.length, created, updated });
    return c.json({ tools: tools.length, created, updated });
  } catch (err) {
    logger.error('mcp', 'resource_discover_error', { resource_id: resource.id, error: String(err) });
    return c.json({ error: `Connection failed: ${String(err)}` }, 502);
  }
});

export default app;
