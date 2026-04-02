/**
 * Segment 路由 — 客户分群管理
 */
import { Hono } from 'hono';
import {
  db,
  cdpSegments,
  cdpSegmentMembers,
  cdpParties,
  cdpAuditLogs,
  eq,
  and,
  count,
  desc,
} from '../db';

const router = new Hono();

/** GET / — 分群列表 */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 20), 1), 100);
  const offset = (page - 1) * pageSize;
  const status = c.req.query('status');

  const conditions = [eq(cdpSegments.tenant_id, tenantId)];
  if (status) conditions.push(eq(cdpSegments.status, status));
  const whereClause = and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpSegments).where(whereClause),
    db.select().from(cdpSegments)
      .where(whereClause)
      .orderBy(desc(cdpSegments.updated_at))
      .limit(pageSize)
      .offset(offset),
  ]);

  return c.json({
    items: rows,
    total: totalResult[0]?.value ?? 0,
    page,
    page_size: pageSize,
  });
});

/** POST / — 创建分群 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    segment_name,
    segment_type = 'dynamic',
    description,
    conditions: conditionsJson,
  } = body;

  if (!segment_name) return c.json({ error: 'segment_name is required' }, 400);

  const segment_id = crypto.randomUUID();
  await db.insert(cdpSegments).values({
    segment_id,
    tenant_id,
    segment_name,
    segment_type,
    description: description ?? null,
    conditions: conditionsJson ? JSON.stringify(conditionsJson) : null,
    created_by: c.req.header('x-staff-id') ?? null,
  });

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'segment',
    object_id: segment_id,
    action: 'create',
    operator_id: c.req.header('x-staff-id') ?? null,
    operator_name: c.req.header('x-staff-name') ?? null,
    after_value: JSON.stringify({ segment_name, segment_type }),
  });

  return c.json({ segment_id }, 201);
});

/** PATCH /:id — 编辑分群 */
router.patch('/:id', async (c) => {
  const segmentId = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.select().from(cdpSegments).where(eq(cdpSegments.segment_id, segmentId)).limit(1);
  if (existing.length === 0) return c.json({ error: 'segment not found' }, 404);

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.segment_name !== undefined) updates.segment_name = body.segment_name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.conditions !== undefined) updates.conditions = JSON.stringify(body.conditions);
  if (body.estimated_count !== undefined) updates.estimated_count = body.estimated_count;

  await db.update(cdpSegments).set(updates).where(eq(cdpSegments.segment_id, segmentId));
  return c.json({ ok: true });
});

/** GET /:id/members — 分群成员列表 */
router.get('/:id/members', async (c) => {
  const segmentId = c.req.param('id');
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Number(c.req.query('page_size') ?? 20), 100);
  const offset = (page - 1) * pageSize;

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpSegmentMembers)
      .where(and(eq(cdpSegmentMembers.tenant_id, tenantId), eq(cdpSegmentMembers.segment_id, segmentId))),
    db.select({
      member_id: cdpSegmentMembers.member_id,
      party_id: cdpSegmentMembers.party_id,
      added_at: cdpSegmentMembers.added_at,
      display_name: cdpParties.display_name,
    })
      .from(cdpSegmentMembers)
      .innerJoin(cdpParties, eq(cdpSegmentMembers.party_id, cdpParties.party_id))
      .where(and(eq(cdpSegmentMembers.tenant_id, tenantId), eq(cdpSegmentMembers.segment_id, segmentId)))
      .limit(pageSize)
      .offset(offset),
  ]);

  return c.json({
    items: rows,
    total: totalResult[0]?.value ?? 0,
    page,
    page_size: pageSize,
  });
});

/** POST /:id/estimate — 预估人数（简化：返回当前成员数） */
router.post('/:id/estimate', async (c) => {
  const segmentId = c.req.param('id');
  const tenantId = c.req.query('tenant_id') ?? 'default';

  const result = await db
    .select({ value: count() })
    .from(cdpSegmentMembers)
    .where(and(eq(cdpSegmentMembers.tenant_id, tenantId), eq(cdpSegmentMembers.segment_id, segmentId)));

  const estimated = result[0]?.value ?? 0;
  await db.update(cdpSegments)
    .set({ estimated_count: estimated, updated_at: new Date() })
    .where(eq(cdpSegments.segment_id, segmentId));

  return c.json({ estimated_count: estimated });
});

export default router;
