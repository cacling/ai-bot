/**
 * groups.ts — 排班组 + 成员 CRUD
 */
import { Hono } from 'hono';
import { db, eq, wfmGroups, wfmGroupMembers } from '../db';

const router = new Hono();

// ── 排班组 CRUD ──

router.get('/', async (c) => {
  const rows = db.select().from(wfmGroups).all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name 不能为空' }, 400);
  const [row] = db.insert(wfmGroups).values({
    name: body.name,
    maxStartDiffMinutes: body.maxStartDiffMinutes ?? 120,
    maxEndDiffMinutes: body.maxEndDiffMinutes ?? 120,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmGroups).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.maxStartDiffMinutes !== undefined && { maxStartDiffMinutes: body.maxStartDiffMinutes }),
    ...(body.maxEndDiffMinutes !== undefined && { maxEndDiffMinutes: body.maxEndDiffMinutes }),
  }).where(eq(wfmGroups.id, id)).run();

  const [updated] = db.select().from(wfmGroups).where(eq(wfmGroups.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmGroups).where(eq(wfmGroups.id, id)).run();
  return c.json({ deleted: true });
});

// ── 组成员 ──

router.get('/:id/members', async (c) => {
  const groupId = Number(c.req.param('id'));
  const rows = db.select().from(wfmGroupMembers)
    .where(eq(wfmGroupMembers.groupId, groupId)).all();
  return c.json({ items: rows });
});

router.post('/:id/members', async (c) => {
  const groupId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.staffId) return c.json({ error: 'staffId 不能为空' }, 400);
  const [row] = db.insert(wfmGroupMembers).values({
    groupId,
    staffId: body.staffId,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/:id/members/:memberId', async (c) => {
  const memberId = Number(c.req.param('memberId'));
  db.delete(wfmGroupMembers).where(eq(wfmGroupMembers.id, memberId)).run();
  return c.json({ deleted: true });
});

export default router;
