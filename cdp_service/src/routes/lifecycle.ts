/**
 * Lifecycle 路由 — 生命周期阶段管理
 */
import { Hono } from 'hono';
import {
  db,
  cdpLifecycleStages,
  cdpPartyLifecycle,
  cdpAuditLogs,
  eq,
  and,
  count,
  asc,
} from '../db';

const router = new Hono();

/** GET /stages — 阶段列表 */
router.get('/stages', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';

  const rows = await db
    .select()
    .from(cdpLifecycleStages)
    .where(eq(cdpLifecycleStages.tenant_id, tenantId))
    .orderBy(asc(cdpLifecycleStages.stage_order));

  // Enrich with party count per stage
  const enriched = await Promise.all(
    rows.map(async (stage) => {
      const result = await db
        .select({ value: count() })
        .from(cdpPartyLifecycle)
        .where(
          and(
            eq(cdpPartyLifecycle.tenant_id, tenantId),
            eq(cdpPartyLifecycle.stage_id, stage.stage_id),
          ),
        );
      return { ...stage, party_count: result[0]?.value ?? 0 };
    }),
  );

  return c.json({ items: enriched });
});

/** POST /stages — 创建/更新阶段 */
router.post('/stages', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    stage_id,
    stage_name,
    stage_order,
    description,
    rule_config,
    color,
    status = 'active',
  } = body;

  if (!stage_name || stage_order === undefined) {
    return c.json({ error: 'stage_name and stage_order are required' }, 400);
  }

  if (stage_id) {
    // Update existing
    await db.update(cdpLifecycleStages).set({
      stage_name,
      stage_order,
      description: description ?? null,
      rule_config: rule_config ? JSON.stringify(rule_config) : null,
      color: color ?? null,
      status,
      updated_at: new Date(),
    }).where(eq(cdpLifecycleStages.stage_id, stage_id));

    return c.json({ stage_id, updated: true });
  }

  // Create new
  const newId = crypto.randomUUID();
  await db.insert(cdpLifecycleStages).values({
    stage_id: newId,
    tenant_id,
    stage_name,
    stage_order,
    description: description ?? null,
    rule_config: rule_config ? JSON.stringify(rule_config) : null,
    color: color ?? null,
    status,
  });

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'lifecycle',
    object_id: newId,
    action: 'create',
    operator_id: c.req.header('x-staff-id') ?? null,
    operator_name: c.req.header('x-staff-name') ?? null,
    after_value: JSON.stringify({ stage_name, stage_order }),
  });

  return c.json({ stage_id: newId }, 201);
});

/** GET /funnel — 漏斗统计 */
router.get('/funnel', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';

  const stages = await db
    .select()
    .from(cdpLifecycleStages)
    .where(and(eq(cdpLifecycleStages.tenant_id, tenantId), eq(cdpLifecycleStages.status, 'active')))
    .orderBy(asc(cdpLifecycleStages.stage_order));

  const funnel = await Promise.all(
    stages.map(async (stage) => {
      const result = await db
        .select({ value: count() })
        .from(cdpPartyLifecycle)
        .where(
          and(
            eq(cdpPartyLifecycle.tenant_id, tenantId),
            eq(cdpPartyLifecycle.stage_id, stage.stage_id),
          ),
        );
      return {
        stage_id: stage.stage_id,
        stage_name: stage.stage_name,
        stage_order: stage.stage_order,
        color: stage.color,
        party_count: result[0]?.value ?? 0,
      };
    }),
  );

  return c.json({ funnel });
});

export default router;
