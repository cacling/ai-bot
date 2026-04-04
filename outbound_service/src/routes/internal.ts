/**
 * internal.ts — Temporal Activity 调用的内部 API
 * 这些端点不对外暴露，仅供 temporal_orchestrator Activity 使用
 */
import { Hono } from 'hono';
import { db, obCallbackTasks, obHandoffCases, obTasks, eq } from '../db';

const router = new Hono();

// ─── callback 状态更新 ───

// PUT /callbacks/:id/status
router.put('/callbacks/:id/status', async (c) => {
  const taskId = c.req.param('id');
  const { status } = await c.req.json<{
    status: 'in_progress' | 'completed' | 'cancelled' | 'rescheduled';
  }>();

  const existing = db.select().from(obCallbackTasks)
    .where(eq(obCallbackTasks.task_id, taskId)).all();
  if (existing.length === 0) return c.json({ error: 'callback not found' }, 404);

  // 幂等：已经是目标状态则直接返回 200
  if (existing[0].status === status) {
    return c.json({ ok: true, task_id: taskId, status });
  }

  db.update(obCallbackTasks)
    .set({ status })
    .where(eq(obCallbackTasks.task_id, taskId))
    .run();

  return c.json({ ok: true, task_id: taskId, status });
});

// GET /callbacks/:id — 单条详情
router.get('/callbacks/:id', async (c) => {
  const taskId = c.req.param('id');
  const rows = db.select().from(obCallbackTasks)
    .where(eq(obCallbackTasks.task_id, taskId)).all();
  if (rows.length === 0) return c.json({ error: 'callback not found' }, 404);
  return c.json(rows[0]);
});

// ─── handoff 状态更新 ───

// PUT /handoff-cases/:id/status
router.put('/handoff-cases/:id/status', async (c) => {
  const caseId = c.req.param('id');
  const { status } = await c.req.json<{
    status: 'accepted' | 'resolved' | 'resumed_ai' | 'escalated';
  }>();

  const existing = db.select().from(obHandoffCases)
    .where(eq(obHandoffCases.case_id, caseId)).all();
  if (existing.length === 0) return c.json({ error: 'handoff case not found' }, 404);

  // 幂等
  if (existing[0].status === status) {
    return c.json({ ok: true, case_id: caseId, status });
  }

  db.update(obHandoffCases)
    .set({ status })
    .where(eq(obHandoffCases.case_id, caseId))
    .run();

  return c.json({ ok: true, case_id: caseId, status });
});

// ─── P2: outbound task 状态更新 ───

// PUT /tasks/:id/status
router.put('/tasks/:id/status', async (c) => {
  const taskId = c.req.param('id');
  const { status } = await c.req.json<{
    status: 'in_progress' | 'completed' | 'cancelled' | 'dnd_blocked' | 'max_retry_reached';
  }>();

  const existing = db.select().from(obTasks)
    .where(eq(obTasks.id, taskId)).all();
  if (existing.length === 0) return c.json({ error: 'task not found' }, 404);

  // 幂等
  if (existing[0].status === status) {
    return c.json({ ok: true, task_id: taskId, status });
  }

  db.update(obTasks)
    .set({ status, updated_at: new Date().toISOString() })
    .where(eq(obTasks.id, taskId))
    .run();

  return c.json({ ok: true, task_id: taskId, status });
});

// ─── P2: 外呼门控 ───

// GET /check-allowed-hours — 检查当前是否在合法外呼时段
router.get('/check-allowed-hours', async (c) => {
  const taskType = c.req.query('task_type') ?? 'collection';
  const now = new Date();
  const hour = now.getHours();

  // 安静时段：21:00 - 08:00
  const quietStart = 21;
  const quietEnd = 8;
  const allowed = hour >= quietEnd && hour < quietStart;

  let nextWindowAt: string | undefined;
  if (!allowed) {
    const next = new Date(now);
    if (hour >= quietStart) {
      // 今天 21:00 之后 → 明天 08:00
      next.setDate(next.getDate() + 1);
    }
    next.setHours(quietEnd, 0, 0, 0);
    nextWindowAt = next.toISOString();
  }

  return c.json({
    allowed,
    nextWindowAt,
    quiet_start: `${quietStart}:00`,
    quiet_end: `0${quietEnd}:00`,
    task_type: taskType,
  });
});

// GET /check-dnd — 检查号码是否在 DND 名单
router.get('/check-dnd', async (c) => {
  const phone = c.req.query('phone') ?? '';

  // P2 阶段：简单实现，无实际 DND 名单
  // 后续可从 CDP 或独立 DND 表查询
  return c.json({ is_dnd: false, phone });
});

export default router;
