/**
 * leaves.ts — 假勤类型 + 假勤申请（含审批流）+ 例外安排 CRUD
 */
import { Hono } from 'hono';
import { db, eq, wfmLeaveTypes, wfmLeaves, wfmExceptions } from '../db';

const router = new Hono();

// ── 假勤类型 CRUD ──

router.get('/types', async (c) => {
  const rows = db.select().from(wfmLeaveTypes).all();
  return c.json({ items: rows });
});

router.post('/types', async (c) => {
  const body = await c.req.json();
  if (!body.code || !body.name) return c.json({ error: 'code 和 name 不能为空' }, 400);
  const [row] = db.insert(wfmLeaveTypes).values({
    code: body.code,
    name: body.name,
    isPaid: body.isPaid ?? false,
    maxDaysYear: body.maxDaysYear ?? 0,
    color: body.color ?? '#9ca3af',
  }).returning().all();
  return c.json(row, 201);
});

// ── 假勤申请 CRUD ──

router.get('/', async (c) => {
  const staffId = c.req.query('staff_id');
  const status = c.req.query('status');

  let query = db.select().from(wfmLeaves);
  if (staffId) query = query.where(eq(wfmLeaves.staffId, staffId)) as typeof query;
  if (status) query = query.where(eq(wfmLeaves.status, status)) as typeof query;

  const rows = query.all();
  return c.json({ items: rows });
});

router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.staffId || !body.leaveTypeId || !body.startTime || !body.endTime) {
    return c.json({ error: 'staffId, leaveTypeId, startTime, endTime 不能为空' }, 400);
  }
  const [row] = db.insert(wfmLeaves).values({
    staffId: body.staffId,
    leaveTypeId: body.leaveTypeId,
    startTime: body.startTime,
    endTime: body.endTime,
    isFullDay: body.isFullDay ?? true,
    status: 'pending',
    isPrePlanned: body.isPrePlanned ?? false,
  }).returning().all();
  return c.json(row, 201);
});

router.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  db.update(wfmLeaves).set({
    ...(body.startTime !== undefined && { startTime: body.startTime }),
    ...(body.endTime !== undefined && { endTime: body.endTime }),
    ...(body.isFullDay !== undefined && { isFullDay: body.isFullDay }),
    ...(body.isPrePlanned !== undefined && { isPrePlanned: body.isPrePlanned }),
  }).where(eq(wfmLeaves.id, id)).run();
  const [updated] = db.select().from(wfmLeaves).where(eq(wfmLeaves.id, id)).all();
  if (!updated) return c.json({ error: 'not found' }, 404);
  return c.json(updated);
});

router.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmLeaves).where(eq(wfmLeaves.id, id)).run();
  return c.json({ deleted: true });
});

// ── 审批操作 ──

router.put('/:id/approve', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const [leave] = db.select().from(wfmLeaves).where(eq(wfmLeaves.id, id)).all();
  if (!leave) return c.json({ error: 'not found' }, 404);
  if (leave.status !== 'pending') return c.json({ error: '只能审批 pending 状态的假勤' }, 400);

  db.update(wfmLeaves).set({
    status: 'approved',
    approvedBy: body.approvedBy ?? null,
    approvedAt: new Date().toISOString(),
  }).where(eq(wfmLeaves.id, id)).run();
  const [updated] = db.select().from(wfmLeaves).where(eq(wfmLeaves.id, id)).all();
  return c.json(updated);
});

router.put('/:id/reject', async (c) => {
  const id = Number(c.req.param('id'));
  const [leave] = db.select().from(wfmLeaves).where(eq(wfmLeaves.id, id)).all();
  if (!leave) return c.json({ error: 'not found' }, 404);
  if (leave.status !== 'pending') return c.json({ error: '只能拒绝 pending 状态的假勤' }, 400);

  db.update(wfmLeaves).set({ status: 'rejected' }).where(eq(wfmLeaves.id, id)).run();
  const [updated] = db.select().from(wfmLeaves).where(eq(wfmLeaves.id, id)).all();
  return c.json(updated);
});

// ── 例外安排 ──

router.get('/exceptions', async (c) => {
  const staffId = c.req.query('staff_id');
  let query = db.select().from(wfmExceptions);
  if (staffId) query = query.where(eq(wfmExceptions.staffId, staffId)) as typeof query;
  const rows = query.all();
  return c.json({ items: rows });
});

router.post('/exceptions', async (c) => {
  const body = await c.req.json();
  if (!body.staffId || !body.activityId || !body.startTime || !body.endTime) {
    return c.json({ error: 'staffId, activityId, startTime, endTime 不能为空' }, 400);
  }
  const [row] = db.insert(wfmExceptions).values({
    staffId: body.staffId,
    activityId: body.activityId,
    startTime: body.startTime,
    endTime: body.endTime,
    note: body.note ?? null,
  }).returning().all();
  return c.json(row, 201);
});

router.delete('/exceptions/:id', async (c) => {
  const id = Number(c.req.param('id'));
  db.delete(wfmExceptions).where(eq(wfmExceptions.id, id)).run();
  return c.json({ deleted: true });
});

export default router;
