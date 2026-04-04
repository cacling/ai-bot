/**
 * tasks.ts — 外呼任务 CRUD + 回拨任务
 */
import { Hono } from 'hono';
import { db, obTasks, obCallbackTasks, eq, desc, asc } from '../db';
import { signalTemporal } from '@ai-bot/shared-temporal';

const router = new Hono();

// GET / — 列表（可选 ?type=collection|marketing）
router.get('/', async (c) => {
  const taskType = c.req.query('type');
  const rows = taskType
    ? db.select().from(obTasks).where(eq(obTasks.task_type, taskType)).orderBy(asc(obTasks.id)).all()
    : db.select().from(obTasks).orderBy(asc(obTasks.id)).all();
  return c.json({ tasks: rows });
});

// POST / — 创建
router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.id || !body.phone || !body.task_type) {
    return c.json({ error: 'id, phone, task_type 必填' }, 400);
  }
  try {
    db.insert(obTasks).values({
      ...body,
      label_zh: body.label_zh ?? '',
      label_en: body.label_en ?? '',
      data: body.data ?? '{}',
    }).run();
    return c.json({ ok: true, id: body.id }, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return c.json({ error: 'task id 已存在' }, 409);
    }
    throw err;
  }
});

// ── 回拨任务（必须在 /:taskId 之前，否则 "callbacks" 被当 param） ────────

// POST /callbacks — 创建回拨任务（幂等：同 task_id 返回 200 + 已有记录）
router.post('/callbacks', async (c) => {
  const body = await c.req.json();
  if (!body.original_task_id || !body.callback_phone || !body.preferred_time) {
    return c.json({ error: 'original_task_id, callback_phone, preferred_time 必填' }, 400);
  }
  const taskId = body.task_id ?? `CB-${Date.now()}`;

  // 幂等检查
  const existing = db.select().from(obCallbackTasks)
    .where(eq(obCallbackTasks.task_id, taskId)).all();
  if (existing.length > 0) {
    return c.json({ ok: true, task_id: taskId, status: existing[0].status });
  }

  db.insert(obCallbackTasks).values({
    task_id: taskId,
    original_task_id: body.original_task_id,
    customer_name: body.customer_name ?? '',
    callback_phone: body.callback_phone,
    preferred_time: body.preferred_time,
    product_name: body.product_name ?? '',
  }).run();

  // 启动 Temporal CallbackWorkflow（fire-and-forget，失败不阻断）
  signalTemporal(`/api/temporal/callbacks/${taskId}/start`, {
    callbackTaskId: taskId,
    originalTaskId: body.original_task_id,
    phone: body.callback_phone,
    preferredTime: body.preferred_time,
    customerName: body.customer_name,
    productName: body.product_name,
  });

  return c.json({ ok: true, task_id: taskId, status: 'pending' }, 201);
});

// GET /callbacks — 列表
router.get('/callbacks', async (c) => {
  const rows = db.select().from(obCallbackTasks).orderBy(desc(obCallbackTasks.created_at)).all();
  return c.json({ callbacks: rows });
});

// GET /callbacks/:id — 单条详情
router.get('/callbacks/:id', async (c) => {
  const taskId = c.req.param('id');
  const rows = db.select().from(obCallbackTasks)
    .where(eq(obCallbackTasks.task_id, taskId)).all();
  if (rows.length === 0) return c.json({ error: 'callback not found' }, 404);
  return c.json(rows[0]);
});

// ── 单条任务（param 路由放最后） ────────────────────────────────────────

// GET /:taskId — 详情
router.get('/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const rows = db.select().from(obTasks).where(eq(obTasks.id, taskId)).all();
  if (rows.length === 0) return c.json({ error: 'task not found' }, 404);
  return c.json(rows[0]);
});

// PUT /:taskId — 更新
router.put('/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const body = await c.req.json();
  const existing = db.select().from(obTasks).where(eq(obTasks.id, taskId)).all();
  if (existing.length === 0) return c.json({ error: 'task not found' }, 404);

  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  delete updates.id;
  db.update(obTasks).set(updates).where(eq(obTasks.id, taskId)).run();
  return c.json({ ok: true });
});

export default router;
