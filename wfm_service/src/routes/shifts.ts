/**
 * shifts.ts — 班制/班次/班次活动模板/班次包 CRUD
 */
import { Hono } from 'hono';
import {
  db, eq,
  wfmShiftPatterns, wfmShifts, wfmShiftActivities,
  wfmShiftPackages, wfmShiftPackageItems,
} from '../db';

const router = new Hono();

// ── 班制（Shift Patterns）──

router.get('/patterns', async (c) => {
  const rows = db.select().from(wfmShiftPatterns).all();
  return c.json({ items: rows });
});

router.post('/patterns', async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name 不能为空' }, 400);
  const [row] = db.insert(wfmShiftPatterns).values({
    name: body.name,
    description: body.description ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.get('/patterns/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const [pattern] = db.select().from(wfmShiftPatterns).where(eq(wfmShiftPatterns.id, id)).all();
  if (!pattern) return c.json({ error: 'not found' }, 404);
  const shifts = db.select().from(wfmShifts).where(eq(wfmShifts.patternId, id)).all();
  return c.json({ ...pattern, shifts });
});

router.delete('/patterns/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmShiftPatterns).where(eq(wfmShiftPatterns.id, id)).run();
  return c.json({ deleted: true });
});

// ── 班次（Shifts）──

router.get('/', async (c) => {
  const rows = db.select().from(wfmShifts).all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name || !body.patternId) return c.json({ error: 'name 和 patternId 不能为空' }, 400);
  const [row] = db.insert(wfmShifts).values({
    patternId: body.patternId,
    name: body.name,
    startTime: body.startTime,
    endTime: body.endTime,
    durationMinutes: body.durationMinutes,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmShifts).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.startTime !== undefined && { startTime: body.startTime }),
    ...(body.endTime !== undefined && { endTime: body.endTime }),
    ...(body.durationMinutes !== undefined && { durationMinutes: body.durationMinutes }),
  }).where(eq(wfmShifts.id, id)).run();
  const [updated] = db.select().from(wfmShifts).where(eq(wfmShifts.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmShifts).where(eq(wfmShifts.id, id)).run();
  return c.json({ deleted: true });
});

// ── 班次活动模板（Shift Activities）──

router.get('/:id/activities', async (c) => {
  const shiftId = Number(c.req.param('id'));
  const rows = db.select().from(wfmShiftActivities)
    .where(eq(wfmShiftActivities.shiftId, shiftId)).all();
  return c.json({ items: rows });
});

router.post('/:id/activities', async (c) => {
  const shiftId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.activityId) return c.json({ error: 'activityId 不能为空' }, 400);
  const [row] = db.insert(wfmShiftActivities).values({
    shiftId,
    activityId: body.activityId,
    offsetMinutes: body.offsetMinutes ?? 0,
    durationMinutes: body.durationMinutes ?? 30,
    sortOrder: body.sortOrder ?? 1,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/:shiftId/activities/:actId', async (c) => {
  const actId = Number(c.req.param('actId'));
  db.delete(wfmShiftActivities).where(eq(wfmShiftActivities.id, actId)).run();
  return c.json({ deleted: true });
});

// ── 班次包（Shift Packages）──

router.get('/packages', async (c) => {
  const rows = db.select().from(wfmShiftPackages).all();
  return c.json({ items: rows });
});

router.post('/packages', async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name 不能为空' }, 400);
  const [row] = db.insert(wfmShiftPackages).values({
    name: body.name,
    description: body.description ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.get('/packages/:id', async (c) => {
  const pkgId = Number(c.req.param('id'));
  const [pkg] = db.select().from(wfmShiftPackages).where(eq(wfmShiftPackages.id, pkgId)).all();
  if (!pkg) return c.json({ error: 'not found' }, 404);
  const items = db.select().from(wfmShiftPackageItems)
    .where(eq(wfmShiftPackageItems.packageId, pkgId)).all();
  return c.json({ ...pkg, items });
});

router.post('/packages/:id/items', async (c) => {
  const pkgId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.shiftId) return c.json({ error: 'shiftId 不能为空' }, 400);
  const [row] = db.insert(wfmShiftPackageItems).values({
    packageId: pkgId,
    shiftId: body.shiftId,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/packages/:pkgId/items/:itemId', async (c) => {
  const itemId = Number(c.req.param('itemId'));
  db.delete(wfmShiftPackageItems).where(eq(wfmShiftPackageItems.id, itemId)).run();
  return c.json({ deleted: true });
});

export default router;
