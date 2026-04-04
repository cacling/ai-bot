/**
 * staffing.ts — 人力需求 CRUD
 */
import { Hono } from 'hono';
import { db, eq, wfmStaffingRequirements } from '../db';

const router = new Hono();

router.get('/requirements', async (c) => {
  const planId = c.req.query('plan_id');
  if (!planId) return c.json({ error: 'plan_id 参数必填' }, 400);

  const rows = db.select().from(wfmStaffingRequirements)
    .where(eq(wfmStaffingRequirements.planId, Number(planId))).all();
  return c.json({ items: rows });
});

router.post('/requirements', async (c) => {
  const body = await c.req.json();
  if (!body.planId || !body.date || !body.startTime || !body.endTime || body.minAgents === undefined) {
    return c.json({ error: 'planId, date, startTime, endTime, minAgents 不能为空' }, 400);
  }
  const [row] = db.insert(wfmStaffingRequirements).values({
    planId: body.planId,
    date: body.date,
    startTime: body.startTime,
    endTime: body.endTime,
    minAgents: body.minAgents,
    skillId: body.skillId ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/requirements/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmStaffingRequirements).set({
    ...(body.date !== undefined && { date: body.date }),
    ...(body.startTime !== undefined && { startTime: body.startTime }),
    ...(body.endTime !== undefined && { endTime: body.endTime }),
    ...(body.minAgents !== undefined && { minAgents: body.minAgents }),
    ...(body.skillId !== undefined && { skillId: body.skillId }),
  }).where(eq(wfmStaffingRequirements.id, id)).run();

  const [updated] = db.select().from(wfmStaffingRequirements)
    .where(eq(wfmStaffingRequirements.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/requirements/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmStaffingRequirements).where(eq(wfmStaffingRequirements.id, id)).run();
  return c.json({ deleted: true });
});

export default router;
