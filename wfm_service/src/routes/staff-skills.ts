/**
 * staff-skills.ts — WFM 技能定义 + 坐席技能分配 CRUD
 */
import { Hono } from 'hono';
import { db, eq, wfmSkills, wfmStaffSkills } from '../db';

const router = new Hono();

// ── 技能定义 CRUD ──

router.get('/skills', async (c) => {
  const rows = db.select().from(wfmSkills).all();
  return c.json({ items: rows });
});

router.post('/skills', async (c) => {
  const body = await c.req.json();
  if (!body.code || !body.name) return c.json({ error: 'code 和 name 不能为空' }, 400);
  const [row] = db.insert(wfmSkills).values({
    code: body.code,
    name: body.name,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/skills/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmSkills).set({
    ...(body.code !== undefined && { code: body.code }),
    ...(body.name !== undefined && { name: body.name }),
  }).where(eq(wfmSkills.id, id)).run();

  const [updated] = db.select().from(wfmSkills).where(eq(wfmSkills.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/skills/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmSkills).where(eq(wfmSkills.id, id)).run();
  return c.json({ deleted: true });
});

// ── 技能下的坐席列表 ──

router.get('/skills/:id/agents', async (c) => {
  const skillId = Number(c.req.param('id'));
  const rows = db.select().from(wfmStaffSkills)
    .where(eq(wfmStaffSkills.skillId, skillId)).all();
  return c.json({ items: rows });
});

// ── 坐席技能分配 ──

router.get('/staff/:staffId/skills', async (c) => {
  const staffId = c.req.param('staffId');
  const rows = db.select().from(wfmStaffSkills)
    .where(eq(wfmStaffSkills.staffId, staffId)).all();
  return c.json({ items: rows });
});

router.post('/staff/:staffId/skills', async (c) => {
  const staffId = c.req.param('staffId');
  const body = await c.req.json();
  if (!body.skillId) return c.json({ error: 'skillId 不能为空' }, 400);
  const [row] = db.insert(wfmStaffSkills).values({
    staffId,
    skillId: body.skillId,
    proficiency: body.proficiency ?? 100,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/staff/:staffId/skills/:bindingId', async (c) => {
  const bindingId = Number(c.req.param('bindingId'));
  db.delete(wfmStaffSkills).where(eq(wfmStaffSkills.id, bindingId)).run();
  return c.json({ deleted: true });
});

export default router;
