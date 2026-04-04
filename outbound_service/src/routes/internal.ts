/**
 * internal.ts — Temporal Activity 调用的内部 API
 * 这些端点不对外暴露，仅供 temporal_orchestrator Activity 使用
 */
import { Hono } from 'hono';
import { db, obCallbackTasks, obHandoffCases, eq } from '../db';

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

export default router;
