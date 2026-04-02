/**
 * Import/Export Task 路由 — 导入导出任务管理
 */
import { Hono } from 'hono';
import {
  db,
  cdpImportExportTasks,
  cdpAuditLogs,
  eq,
  and,
  count,
  desc,
} from '../db';

const router = new Hono();

/** GET / — 任务列表 */
router.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id') ?? 'default';
  const page = Math.max(Number(c.req.query('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('page_size') ?? 20), 1), 100);
  const offset = (page - 1) * pageSize;
  const taskType = c.req.query('task_type');
  const status = c.req.query('status');

  const conditions = [eq(cdpImportExportTasks.tenant_id, tenantId)];
  if (taskType) conditions.push(eq(cdpImportExportTasks.task_type, taskType));
  if (status) conditions.push(eq(cdpImportExportTasks.status, status));
  const whereClause = and(...conditions);

  const [totalResult, rows] = await Promise.all([
    db.select({ value: count() }).from(cdpImportExportTasks).where(whereClause),
    db.select().from(cdpImportExportTasks)
      .where(whereClause)
      .orderBy(desc(cdpImportExportTasks.created_at))
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

/** GET /:id — 任务详情 */
router.get('/:id', async (c) => {
  const taskId = c.req.param('id');

  const rows = await db.select().from(cdpImportExportTasks).where(eq(cdpImportExportTasks.task_id, taskId)).limit(1);
  if (rows.length === 0) return c.json({ error: 'task not found' }, 404);

  return c.json(rows[0]);
});

/** POST /import — 创建导入任务 */
router.post('/import', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', task_name, file_name, field_mapping, total_count = 0 } = body;

  const task_id = crypto.randomUUID();
  const operatorId = c.req.header('x-staff-id') ?? null;
  const operatorName = c.req.header('x-staff-name') ?? null;

  await db.insert(cdpImportExportTasks).values({
    task_id,
    tenant_id,
    task_type: 'import',
    task_name: task_name ?? null,
    file_name: file_name ?? null,
    field_mapping: field_mapping ? JSON.stringify(field_mapping) : null,
    total_count,
    operator_id: operatorId,
    operator_name: operatorName,
  });

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'import_task',
    object_id: task_id,
    action: 'import',
    operator_id: operatorId,
    operator_name: operatorName,
    after_value: JSON.stringify({ task_name, file_name, total_count }),
  });

  return c.json({ task_id }, 201);
});

/** POST /export — 创建导出任务 */
router.post('/export', async (c) => {
  const body = await c.req.json();
  const { tenant_id = 'default', task_name, total_count = 0 } = body;

  const task_id = crypto.randomUUID();
  const operatorId = c.req.header('x-staff-id') ?? null;
  const operatorName = c.req.header('x-staff-name') ?? null;

  await db.insert(cdpImportExportTasks).values({
    task_id,
    tenant_id,
    task_type: 'export',
    task_name: task_name ?? null,
    total_count,
    operator_id: operatorId,
    operator_name: operatorName,
    status: 'success',
    success_count: total_count,
    finished_at: new Date(),
  });

  await db.insert(cdpAuditLogs).values({
    audit_log_id: crypto.randomUUID(),
    tenant_id,
    object_type: 'import_task',
    object_id: task_id,
    action: 'export',
    operator_id: operatorId,
    operator_name: operatorName,
    after_value: JSON.stringify({ task_name, total_count }),
  });

  return c.json({ task_id }, 201);
});

/** POST /:id/retry — 重试失败任务 */
router.post('/:id/retry', async (c) => {
  const taskId = c.req.param('id');

  const rows = await db.select().from(cdpImportExportTasks).where(eq(cdpImportExportTasks.task_id, taskId)).limit(1);
  if (rows.length === 0) return c.json({ error: 'task not found' }, 404);

  const task = rows[0];
  if (task.status !== 'failed' && task.status !== 'partial_fail') {
    return c.json({ error: 'only failed/partial_fail tasks can be retried' }, 400);
  }

  await db.update(cdpImportExportTasks).set({
    status: 'pending',
  }).where(eq(cdpImportExportTasks.task_id, taskId));

  return c.json({ ok: true, status: 'pending' });
});

export default router;
