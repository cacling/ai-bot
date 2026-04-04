/**
 * activities.ts — 活动类型 + 覆盖规则 CRUD
 */
import { Hono } from 'hono';
import { db, wfmActivities, wfmActivityCoverRules, eq } from '../db';

const router = new Hono();

// ── 活动类型 CRUD ──

router.get('/', async (c) => {
  const rows = db.select().from(wfmActivities).all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.code || !body.name) return c.json({ error: 'code 和 name 不能为空' }, 400);

  const [row] = db.insert(wfmActivities).values({
    code: body.code,
    name: body.name,
    color: body.color ?? '#9ca3af',
    icon: body.icon ?? 'circle',
    priority: body.priority ?? 50,
    isPaid: body.isPaid ?? true,
    isCoverable: body.isCoverable ?? false,
    canCover: body.canCover ?? false,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  db.update(wfmActivities).set({
    ...(body.code !== undefined && { code: body.code }),
    ...(body.name !== undefined && { name: body.name }),
    ...(body.color !== undefined && { color: body.color }),
    ...(body.icon !== undefined && { icon: body.icon }),
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.isPaid !== undefined && { isPaid: body.isPaid }),
    ...(body.isCoverable !== undefined && { isCoverable: body.isCoverable }),
    ...(body.canCover !== undefined && { canCover: body.canCover }),
  }).where(eq(wfmActivities.id, id)).run();

  const [updated] = db.select().from(wfmActivities).where(eq(wfmActivities.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmActivities).where(eq(wfmActivities.id, id)).run();
  return c.json({ deleted: true });
});

// ── 覆盖规则 ──

router.get('/:id/cover-rules', async (c) => {
  const id = Number(c.req.param('id'));
  const rows = db.select().from(wfmActivityCoverRules)
    .where(eq(wfmActivityCoverRules.sourceActivityId, id)).all();
  return c.json({ items: rows });
});

router.post('/:id/cover-rules', async (c) => {
  const sourceId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.targetActivityId) return c.json({ error: 'targetActivityId 不能为空' }, 400);

  const [row] = db.insert(wfmActivityCoverRules).values({
    sourceActivityId: sourceId,
    targetActivityId: body.targetActivityId,
    canCover: body.canCover ?? true,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/cover-rules/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmActivityCoverRules).where(eq(wfmActivityCoverRules.id, id)).run();
  return c.json({ deleted: true });
});

export default router;
