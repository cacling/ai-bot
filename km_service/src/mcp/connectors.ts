/**
 * mcp/connectors.ts — Connectors CRUD + Test
 *
 * Connectors 是 DB / API 后端连接依赖，属于本地实现层。
 *
 * GET    /              — 列出连接器（可按 type / server_id 筛选）
 * POST   /              — 新建连接器
 * GET    /:id           — 获取详情
 * PUT    /:id           — 更新
 * DELETE /:id           — 删除
 * POST   /:id/test      — 测试连接
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { connectors, toolImplementations } from '../db';
import { nanoid } from '../nanoid';
import { logger } from '../logger';

const app = new Hono();
const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const serverId = c.req.query('server_id');
  const type = c.req.query('type');
  let rows = db.select().from(connectors).all();
  if (serverId) rows = rows.filter(r => r.server_id === serverId);
  if (type) rows = rows.filter(r => r.type === type);
  return c.json({ items: rows });
});

// ── Create ───────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ error: '连接器名不能为空' }, 400);
  if (!body.type) return c.json({ error: '连接器类型不能为空' }, 400);
  const id = nanoid();
  db.insert(connectors).values({
    id,
    name: body.name.trim(),
    type: body.type,
    config: body.config ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config)) : null,
    status: body.status ?? 'active',
    description: body.description ?? null,
    env_json: body.env_json ?? null,
    env_prod_json: body.env_prod_json ?? null,
    env_test_json: body.env_test_json ?? null,
    server_id: body.server_id ?? null,
    created_at: now(),
    updated_at: now(),
  }).run();
  logger.info('mcp', 'connector_created', { id, name: body.name, type: body.type });
  return c.json({ id });
});

// ── Get ──────────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const row = db.select().from(connectors).where(eq(connectors.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  // 附带依赖此 connector 的工具实现列表
  const impls = db.select().from(toolImplementations)
    .where(eq(toolImplementations.connector_id, row.id)).all();
  return c.json({ ...row, tool_implementations: impls });
});

// ── Update ───────────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(connectors).where(eq(connectors.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(connectors).set({
    name: body.name ?? existing.name,
    type: body.type ?? existing.type,
    config: body.config !== undefined
      ? (typeof body.config === 'string' ? body.config : JSON.stringify(body.config))
      : existing.config,
    status: body.status ?? existing.status,
    description: body.description ?? existing.description,
    env_json: body.env_json ?? existing.env_json,
    env_prod_json: body.env_prod_json ?? existing.env_prod_json,
    env_test_json: body.env_test_json ?? existing.env_test_json,
    server_id: body.server_id ?? existing.server_id,
    updated_at: now(),
  }).where(eq(connectors.id, id)).run();
  logger.info('mcp', 'connector_updated', { id });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  db.delete(connectors).where(eq(connectors.id, id)).run();
  logger.info('mcp', 'connector_deleted', { id });
  return c.json({ ok: true });
});

// ── Test connection ──────────────────────────────────────────────────────────
app.post('/:id/test', async (c) => {
  const row = db.select().from(connectors).where(eq(connectors.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);

  const t0 = Date.now();
  try {
    if (row.type === 'api') {
      const cfg = row.config ? JSON.parse(row.config) : {};
      if (!cfg.base_url) return c.json({ ok: false, error: 'No base_url configured' });
      const res = await fetch(cfg.base_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return c.json({ ok: res.ok, elapsed_ms: Date.now() - t0, status: res.status });
    }

    return c.json({ ok: false, error: `Unknown type: ${row.type}` });
  } catch (err) {
    logger.error('mcp', 'connector_test_error', { id: row.id, error: String(err) });
    return c.json({ ok: false, error: String(err), elapsed_ms: Date.now() - t0 });
  }
});

export default app;
