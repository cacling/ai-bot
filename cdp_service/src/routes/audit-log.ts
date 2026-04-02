/**
 * Audit Log 路由 — 操作审计日志
 */
import { Hono } from 'hono';
import { db, cdpAuditLogs, eq, and, desc, count } from '../db';

const router = new Hono();

/** POST / — 写入审计日志 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const {
    tenant_id = 'default',
    object_type,
    object_id,
    action,
    operator_id,
    operator_name,
    before_value,
    after_value,
    ip,
  } = body;

  if (!object_type || !object_id || !action) {
    return c.json({ error: 'object_type, object_id, action are required' }, 400);
  }

  const audit_log_id = crypto.randomUUID();

  await db.insert(cdpAuditLogs).values({
    audit_log_id,
    tenant_id,
    object_type,
    object_id,
    action,
    operator_id: operator_id ?? c.req.header('x-staff-id') ?? null,
    operator_name: operator_name ?? c.req.header('x-staff-name') ?? null,
    before_value: before_value ? JSON.stringify(before_value) : null,
    after_value: after_value ? JSON.stringify(after_value) : null,
    ip: ip ?? c.req.header('x-forwarded-for') ?? null,
  });

  return c.json({ audit_log_id }, 201);
});

/** GET / — 查询审计日志（分页 + 筛选） */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 20), 1), 100);
  const offset = (page - 1) * pageSize;

  const objectType = c.req.query('object_type');
  const objectId = c.req.query('object_id');
  const operatorId = c.req.query('operator_id');
  const actionFilter = c.req.query('action');

  const conditions = [eq(cdpAuditLogs.tenant_id, tenantId)];

  if (objectType) conditions.push(eq(cdpAuditLogs.object_type, objectType));
  if (objectId) conditions.push(eq(cdpAuditLogs.object_id, objectId));
  if (operatorId) conditions.push(eq(cdpAuditLogs.operator_id, operatorId));
  if (actionFilter) conditions.push(eq(cdpAuditLogs.action, actionFilter));

  const whereClause = and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpAuditLogs).where(whereClause),
    db.select().from(cdpAuditLogs)
      .where(whereClause)
      .orderBy(desc(cdpAuditLogs.created_at))
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

export default router;
