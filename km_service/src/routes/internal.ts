/**
 * internal.ts — 内部 API（供 backend km-client 调用）
 *
 * 提供 skill registry、workflow specs、MCP tool bindings 等数据，
 * 使 backend 不再直接读取 km.db。
 */
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import {
  db,
  skillRegistry,
  skillWorkflowSpecs,
  mcpServers,
  mcpTools,
  toolImplementations,
  connectors,
} from '../db';
import { logger } from '../logger';

const app = new Hono();

// ══════════════════════════════════════════════════════════════════════════
// Skill Registry
// ══════════════════════════════════════════════════════════════════════════

/** GET / — 返回全量 skill registry */
app.get('/skills/registry', (c) => {
  const rows = db.select().from(skillRegistry).all();
  return c.json({ items: rows });
});

/** GET /:skillId — 返回单个 skill */
app.get('/skills/registry/:skillId', (c) => {
  const row = db.select().from(skillRegistry).where(eq(skillRegistry.id, c.req.param('skillId'))).get();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** POST /:skillId/sync-metadata — 同步技能元数据 */
app.post('/skills/registry/:skillId/sync-metadata', async (c) => {
  const skillId = c.req.param('skillId');
  const body = await c.req.json();
  const now = new Date().toISOString();

  db.update(skillRegistry).set({
    description: body.description ?? undefined,
    channels: body.channels ?? undefined,
    mode: body.mode ?? undefined,
    trigger_keywords: body.trigger_keywords ?? undefined,
    tool_names: body.tool_names ?? undefined,
    mermaid: body.mermaid ?? undefined,
    tags: body.tags ?? undefined,
    reference_files: body.reference_files ?? undefined,
    updated_at: now,
  }).where(eq(skillRegistry.id, skillId)).run();

  logger.info('internal', 'skill_metadata_synced', { skill: skillId });
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════
// Workflow Specs
// ══════════════════════════════════════════════════════════════════════════

/** GET /skills/workflow-specs/:skillId — 返回 published spec */
app.get('/skills/workflow-specs/:skillId', (c) => {
  const row = db.select().from(skillWorkflowSpecs)
    .where(
      and(
        eq(skillWorkflowSpecs.skill_id, c.req.param('skillId')),
        eq(skillWorkflowSpecs.status, 'published'),
      ),
    )
    .get();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** POST /skills/workflow-specs — 插入或更新 spec */
app.post('/skills/workflow-specs', async (c) => {
  const body = await c.req.json();
  const { skill_id, version_no, spec_json, status = 'published' } = body;

  if (!skill_id || version_no == null || !spec_json) {
    return c.json({ error: 'skill_id, version_no, spec_json required' }, 400);
  }

  // 先删旧的同 skill+version
  db.delete(skillWorkflowSpecs)
    .where(and(eq(skillWorkflowSpecs.skill_id, skill_id), eq(skillWorkflowSpecs.version_no, version_no)))
    .run();

  db.insert(skillWorkflowSpecs).values({
    skill_id,
    version_no,
    status,
    spec_json,
  }).run();

  logger.info('internal', 'workflow_spec_upserted', { skill: skill_id, version: version_no });
  return c.json({ ok: true }, 201);
});

// ══════════════════════════════════════════════════════════════════════════
// MCP Servers & Tools
// ══════════════════════════════════════════════════════════════════════════

/** GET /mcp/servers-full — 返回全量 server 列表（含 mock_rules、disabled_tools 等） */
app.get('/mcp/servers-full', (c) => {
  const rows = db.select().from(mcpServers).all();
  return c.json({ items: rows });
});

/** GET /mcp/tools-full — 返回全量 mcpTools */
app.get('/mcp/tools-full', (c) => {
  const rows = db.select().from(mcpTools).all();
  return c.json({ items: rows });
});

/** GET /mcp/tool-bindings — 返回 toolImplementations + connectors */
app.get('/mcp/tool-bindings', (c) => {
  const impls = db.select().from(toolImplementations).all();
  const conns = db.select().from(connectors).all();
  return c.json({ implementations: impls, connectors: conns });
});

export default app;
