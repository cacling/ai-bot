/**
 * contracts.ts — 合同类型 + 合同↔班次包关联 CRUD
 */
import { Hono } from 'hono';
import { db, eq, and, wfmContracts, wfmContractPackages, wfmStaffContracts } from '../db';

const router = new Hono();

// ── 合同 CRUD ──

router.get('/', async (c) => {
  const rows = db.select().from(wfmContracts).all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name 不能为空' }, 400);
  const [row] = db.insert(wfmContracts).values({
    name: body.name,
    minHoursDay: body.minHoursDay ?? 0,
    maxHoursDay: body.maxHoursDay ?? 24,
    minHoursWeek: body.minHoursWeek ?? 0,
    maxHoursWeek: body.maxHoursWeek ?? 168,
    minBreakMinutes: body.minBreakMinutes ?? 0,
    lunchRequired: body.lunchRequired ?? false,
    lunchMinMinutes: body.lunchMinMinutes ?? 0,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmContracts).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.minHoursDay !== undefined && { minHoursDay: body.minHoursDay }),
    ...(body.maxHoursDay !== undefined && { maxHoursDay: body.maxHoursDay }),
    ...(body.minHoursWeek !== undefined && { minHoursWeek: body.minHoursWeek }),
    ...(body.maxHoursWeek !== undefined && { maxHoursWeek: body.maxHoursWeek }),
    ...(body.minBreakMinutes !== undefined && { minBreakMinutes: body.minBreakMinutes }),
    ...(body.lunchRequired !== undefined && { lunchRequired: body.lunchRequired }),
    ...(body.lunchMinMinutes !== undefined && { lunchMinMinutes: body.lunchMinMinutes }),
  }).where(eq(wfmContracts.id, id)).run();

  const [updated] = db.select().from(wfmContracts).where(eq(wfmContracts.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmContracts).where(eq(wfmContracts.id, id)).run();
  return c.json({ deleted: true });
});

// ── 合同↔班次包 关联 ──

router.get('/:id/packages', async (c) => {
  const contractId = Number(c.req.param('id'));
  const rows = db.select().from(wfmContractPackages)
    .where(eq(wfmContractPackages.contractId, contractId)).all();
  return c.json({ items: rows });
});

router.post('/:id/packages', async (c) => {
  const contractId = Number(c.req.param('id'));
  const body = await c.req.json();
  if (!body.packageId) return c.json({ error: 'packageId 不能为空' }, 400);
  const [row] = db.insert(wfmContractPackages).values({
    contractId,
    packageId: body.packageId,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/:id/packages/:bindingId', async (c) => {
  const bindingId = Number(c.req.param('bindingId'));
  db.delete(wfmContractPackages).where(eq(wfmContractPackages.id, bindingId)).run();
  return c.json({ deleted: true });
});

// ── 坐席合同绑定 ──

router.get('/staff', async (c) => {
  const rows = db.select().from(wfmStaffContracts).all();
  return c.json({ items: rows });
});

router.post('/staff', async (c) => {
  const body = await c.req.json();
  if (!body.staffId || !body.contractId) return c.json({ error: 'staffId 和 contractId 不能为空' }, 400);
  const [row] = db.insert(wfmStaffContracts).values({
    staffId: body.staffId,
    contractId: body.contractId,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/staff/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmStaffContracts).where(eq(wfmStaffContracts.id, id)).run();
  return c.json({ deleted: true });
});

export default router;
