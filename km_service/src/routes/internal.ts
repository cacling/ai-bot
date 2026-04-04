/**
 * internal.ts — 内部 API（供 backend km-client 调用）
 *
 * 提供 skill registry、workflow specs、MCP tool bindings 等数据，
 * 使 backend 不再直接读取 km.db。
 */
import { Hono } from 'hono';
import { eq, and, lte, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import {
  db,
  skillRegistry,
  skillWorkflowSpecs,
  mcpServers,
  mcpTools,
  toolImplementations,
  connectors,
  kmAssets,
  kmDocVersions,
  kmPipelineJobs,
  kmRegressionWindows,
  kmGovernanceTasks,
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

// ══════════════════════════════════════════════════════════════════════════
// Test Personas（供 backend mock-data 使用）
// ══════════════════════════════════════════════════════════════════════════

app.get('/test-personas', async (c) => {
  // 代理到 outbound_service（testPersonas 数据已迁移）
  try {
    const res = await fetch(`http://localhost:${process.env.OUTBOUND_SERVICE_PORT ?? 18021}/api/outbound/test-personas`);
    if (res.ok) {
      const items = await res.json();
      return c.json({ items });
    }
  } catch { /* fallback below */ }
  return c.json({ items: [] });
});

// ══════════════════════════════════════════════════════════════════════════
// DB Query Proxy（供 tool-runtime/db-adapter 使用）
// ══════════════════════════════════════════════════════════════════════════

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** POST /db/query — 受限的 SELECT 查询代理 */
app.post('/db/query', async (c) => {
  const body = await c.req.json();
  const { table, columns, where } = body;

  if (!table || !SAFE_IDENTIFIER.test(table)) {
    return c.json({ error: 'invalid table name' }, 400);
  }

  const cols = (columns as string[] | undefined)?.filter(c => SAFE_IDENTIFIER.test(c)).join(', ') ?? '*';
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (where && typeof where === 'object') {
    for (const [col, val] of Object.entries(where)) {
      if (!SAFE_IDENTIFIER.test(col)) continue;
      conditions.push(`${col} = ?`);
      params.push(val);
    }
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT ${cols} FROM ${table}${whereClause}`;

  try {
    const { sqlite } = await import('../db');
    const stmt = sqlite.prepare(sql);
    const rows = stmt.all(...params);
    return c.json({ rows });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Temporal 配套端点（P3 新增）
// ══════════════════════════════════════════════════════════════════════════

/** GET /assets/scan-expired — 扫描 next_review_date 到期的资产 */
app.get('/assets/scan-expired', (c) => {
  const asOfDate = c.req.query('as_of_date') ?? new Date().toISOString().slice(0, 10);
  const rows = db.select({ id: kmAssets.id }).from(kmAssets)
    .where(and(lte(kmAssets.next_review_date, asOfDate), eq(kmAssets.status, 'online')))
    .all();
  return c.json({ asset_ids: rows.map((r) => r.id) });
});

/** GET /doc-versions/scan-pending — 扫描未处理的文档版本 */
app.get('/doc-versions/scan-pending', (c) => {
  const busyVersionIds = db.select({ dvId: kmPipelineJobs.doc_version_id }).from(kmPipelineJobs)
    .where(inArray(kmPipelineJobs.status, ['pending', 'running']))
    .all()
    .map((r) => r.dvId);

  let q = db.select({ id: kmDocVersions.id }).from(kmDocVersions)
    .where(inArray(kmDocVersions.status, ['draft', 'pending']));
  const rows = q.all().filter((r) => !busyVersionIds.includes(r.id));
  return c.json({ doc_version_ids: rows.map((r) => r.id) });
});

/** GET /regression-windows/scan-expired — 扫描 observe_until 到期的回归窗口 */
app.get('/regression-windows/scan-expired', (c) => {
  const asOfDate = c.req.query('as_of_date') ?? new Date().toISOString().slice(0, 10);
  const rows = db.select({ id: kmRegressionWindows.id }).from(kmRegressionWindows)
    .where(and(lte(kmRegressionWindows.observe_until, asOfDate), isNull(kmRegressionWindows.concluded_at)))
    .all();
  return c.json({ window_ids: rows.map((r) => r.id) });
});

/** PUT /regression-windows/:id/conclude — 关闭回归窗口 */
app.put('/regression-windows/:id/conclude', async (c) => {
  const windowId = c.req.param('id');
  const { verdict } = await c.req.json<{ verdict: 'pass' | 'fail' | 'inconclusive' }>();

  const existing = db.select().from(kmRegressionWindows).where(eq(kmRegressionWindows.id, windowId)).all();
  if (existing.length === 0) return c.json({ error: 'regression window not found' }, 404);
  if (existing[0].concluded_at) return c.json({ ok: true, window_id: windowId, verdict });

  db.update(kmRegressionWindows)
    .set({ verdict, concluded_at: new Date().toISOString() })
    .where(eq(kmRegressionWindows.id, windowId))
    .run();
  return c.json({ ok: true, window_id: windowId, verdict });
});

/** POST /pipeline/jobs — 创建流水线 jobs（幂等） */
app.post('/pipeline/jobs', async (c) => {
  const body = await c.req.json<{
    doc_version_id: string;
    stages: string[];
    idempotency_key?: string;
  }>();

  // 幂等：检查是否已有 pending/running jobs
  const existing = db.select({ id: kmPipelineJobs.id, stage: kmPipelineJobs.stage, status: kmPipelineJobs.status })
    .from(kmPipelineJobs)
    .where(and(eq(kmPipelineJobs.doc_version_id, body.doc_version_id), inArray(kmPipelineJobs.status, ['pending', 'running'])))
    .all();

  if (existing.length > 0) {
    return c.json({ jobs: existing });
  }

  const now = new Date().toISOString();
  const jobs: Array<{ id: string; stage: string; status: string }> = [];
  for (const stage of body.stages) {
    const id = `JOB-${body.doc_version_id}-${stage}-${Date.now()}`;
    db.insert(kmPipelineJobs).values({
      id, doc_version_id: body.doc_version_id, stage, status: 'pending', created_at: now,
    }).run();
    jobs.push({ id, stage, status: 'pending' });
  }
  return c.json({ jobs }, 201);
});

/** PUT /pipeline/jobs/:id/status — 更新 job 状态 */
app.put('/pipeline/jobs/:id/status', async (c) => {
  const jobId = c.req.param('id');
  const body = await c.req.json<{
    status: 'running' | 'completed' | 'failed';
    error_code?: string;
    error_message?: string;
    candidate_count?: number;
  }>();

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status: body.status };
  if (body.error_code) updates.error_code = body.error_code;
  if (body.error_message) updates.error_message = body.error_message;
  if (body.candidate_count != null) updates.candidate_count = body.candidate_count;
  if (body.status === 'running') updates.started_at = now;
  if (body.status === 'completed' || body.status === 'failed') updates.finished_at = now;

  db.update(kmPipelineJobs).set(updates).where(eq(kmPipelineJobs.id, jobId)).run();
  return c.json({ ok: true, job_id: jobId, status: body.status });
});

/** POST /pipeline/jobs/:id/execute — 执行 pipeline stage（P3 mock） */
app.post('/pipeline/jobs/:id/execute', async (c) => {
  const jobId = c.req.param('id');
  const body = await c.req.json<{ stage: string }>();

  // P3 mock: 每个 stage 返回成功
  logger.info('internal', 'pipeline_stage_executed', { job_id: jobId, stage: body.stage });
  return c.json({ status: 'completed', result: { stage: body.stage, mock: true } });
});

/** POST /governance/tasks — 创建治理任务（幂等） */
app.post('/governance/tasks', async (c) => {
  const body = await c.req.json<{
    task_type: string;
    source_type: string;
    source_ref_id: string;
    issue_category?: string;
    severity?: string;
    priority?: string;
  }>();

  // 幂等：同 (source_type, source_ref_id, issue_category) 返回已有
  if (body.issue_category) {
    const existing = db.select({ id: kmGovernanceTasks.id }).from(kmGovernanceTasks)
      .where(and(
        eq(kmGovernanceTasks.source_type, body.source_type),
        eq(kmGovernanceTasks.source_ref_id, body.source_ref_id),
        eq(kmGovernanceTasks.issue_category, body.issue_category),
        eq(kmGovernanceTasks.status, 'open'),
      ))
      .all();
    if (existing.length > 0) {
      return c.json({ ok: true, task_id: existing[0].id });
    }
  }

  const id = `GOV-${Date.now()}`;
  const now = new Date().toISOString();
  db.insert(kmGovernanceTasks).values({
    id,
    task_type: body.task_type,
    source_type: body.source_type,
    source_ref_id: body.source_ref_id,
    issue_category: body.issue_category ?? null,
    severity: body.severity ?? 'medium',
    priority: body.priority ?? 'medium',
    status: 'open',
    created_at: now,
    updated_at: now,
  }).run();
  return c.json({ ok: true, task_id: id }, 201);
});

export default app;
