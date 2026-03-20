/**
 * mcp/tool-management.ts — MCP 工具独立管理 CRUD
 *
 * GET    /                     — 列出所有工具（支持 server_id 过滤）
 * POST   /                     — 新建工具
 * GET    /:id                  — 获取工具详情
 * PUT    /:id                  — 更新工具
 * DELETE /:id                  — 删除工具
 * PUT    /:id/execution-config — 更新执行配置
 * PUT    /:id/mock-rules       — 更新 Mock 规则
 * PUT    /:id/toggle-mock      — 切换 Mock/Real 模式
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { mcpTools, mcpResources } from '../../../db/schema';
import { nanoid } from '../../../db/nanoid';
import { logger } from '../../../services/logger';
import { getToolToSkillsMap } from '../../../engine/skills';

const app = new Hono();
const now = () => new Date().toISOString();

// ── List ─────────────────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const serverId = c.req.query('server_id');
  const rows = serverId
    ? db.select().from(mcpTools).where(eq(mcpTools.server_id, serverId)).all()
    : db.select().from(mcpTools).all();

  // 附加 skill 引用信息
  const toolSkillsMap = getToolToSkillsMap();
  const items = rows.map(t => ({
    ...t,
    skills: toolSkillsMap.get(t.name) ?? [],
    // 解析 execution_config 中的 impl_type 和 resource_id
    impl_type: t.execution_config ? (JSON.parse(t.execution_config) as { impl_type?: string }).impl_type ?? null : null,
    resource_id: t.execution_config ? (JSON.parse(t.execution_config) as { resource_id?: string }).resource_id ?? null : null,
  }));

  return c.json({ items });
});

// ── Create ───────────────────────────────────────────────────────────────────
app.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name?.trim()) return c.json({ error: 'name 不能为空' }, 400);

  const id = nanoid();
  db.insert(mcpTools).values({
    id,
    name: body.name.trim(),
    description: body.description ?? '',
    server_id: body.server_id ?? null,
    input_schema: body.input_schema ?? null,
    execution_config: body.execution_config ?? null,
    mock_rules: body.mock_rules ?? null,
    mocked: body.mocked ?? true, // 新建工具默认 Mock 模式
    disabled: body.disabled ?? false,
    response_example: body.response_example ?? null,
    created_at: now(),
    updated_at: now(),
  }).run();
  logger.info('mcp', 'tool_created', { id, name: body.name });
  return c.json({ id });
});

// ── Get ──────────────────────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const row = db.select().from(mcpTools).where(eq(mcpTools.id, c.req.param('id'))).get();
  if (!row) return c.json({ error: 'Not found' }, 404);

  // 附加 skill 引用和资源信息
  const toolSkillsMap = getToolToSkillsMap();
  const cfg = row.execution_config ? JSON.parse(row.execution_config) as { resource_id?: string } : null;
  const resource = cfg?.resource_id
    ? db.select().from(mcpResources).where(eq(mcpResources.id, cfg.resource_id)).get()
    : null;

  return c.json({
    ...row,
    skills: toolSkillsMap.get(row.name) ?? [],
    resource: resource ? { id: resource.id, name: resource.name, type: resource.type } : null,
  });
});

// ── Update ───────────────────────────────────────────────────────────────────
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    server_id: body.server_id ?? existing.server_id,
    input_schema: body.input_schema ?? existing.input_schema,
    execution_config: body.execution_config ?? existing.execution_config,
    mock_rules: body.mock_rules ?? existing.mock_rules,
    mocked: body.mocked ?? existing.mocked,
    disabled: body.disabled ?? existing.disabled,
    response_example: body.response_example ?? existing.response_example,
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_updated', { id, name: body.name ?? existing.name });
  return c.json({ ok: true });
});

// ── Delete ───────────────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  db.delete(mcpTools).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_deleted', { id });
  return c.json({ ok: true });
});

// ── Update execution config ──────────────────────────────────────────────────
app.put('/:id/execution-config', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    execution_config: JSON.stringify(body),
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_execution_config_updated', { id, impl_type: body.impl_type });
  return c.json({ ok: true });
});

// ── Update mock rules ────────────────────────────────────────────────────────
app.put('/:id/mock-rules', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ rules: Array<{ tool_name: string; match: string; response: string }> }>();
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  db.update(mcpTools).set({
    mock_rules: body.rules.length > 0 ? JSON.stringify(body.rules) : null,
    updated_at: now(),
  }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_mock_rules_updated', { id, count: body.rules.length });
  return c.json({ ok: true });
});

// ── Toggle mock/real ─────────────────────────────────────────────────────────
app.put('/:id/toggle-mock', async (c) => {
  const id = c.req.param('id');
  const existing = db.select().from(mcpTools).where(eq(mcpTools.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const newMocked = !existing.mocked;
  db.update(mcpTools).set({ mocked: newMocked, updated_at: now() }).where(eq(mcpTools.id, id)).run();
  logger.info('mcp', 'tool_mock_toggled', { id, mocked: newMocked });
  return c.json({ ok: true, mocked: newMocked });
});

export default app;
