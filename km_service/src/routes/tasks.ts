/**
 * tasks.ts — 治理任务 CRUD
 */
import { Hono } from 'hono';
import { eq, desc, and, SQL, sql } from 'drizzle-orm';
import { db } from '../db';
import { kmGovernanceTasks } from '../db';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET /
app.get('/', async (c) => {
  const { status, task_type, assignee, priority, page = '1', size = '20' } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmGovernanceTasks.status, status));
  if (task_type) conditions.push(eq(kmGovernanceTasks.task_type, task_type));
  if (assignee) conditions.push(eq(kmGovernanceTasks.assignee, assignee));
  if (priority) conditions.push(eq(kmGovernanceTasks.priority, priority));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Number(size) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const rows = await db.select().from(kmGovernanceTasks).where(where)
    .orderBy(desc(kmGovernanceTasks.created_at)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(kmGovernanceTasks).where(where);
  return c.json({ items: rows, total: count });
});

// POST /
app.post('/', async (c) => {
  const body = await c.req.json<{
    task_type: string; source_type?: string; source_ref_id?: string;
    priority?: string; assignee?: string; due_date?: string;
  }>();
  const id = nanoid();
  const now = new Date().toISOString();
  await db.insert(kmGovernanceTasks).values({
    id, task_type: body.task_type,
    source_type: body.source_type, source_ref_id: body.source_ref_id,
    priority: body.priority ?? 'medium', assignee: body.assignee,
    due_date: body.due_date, status: 'open', created_at: now, updated_at: now,
  });
  return c.json({ id }, 201);
});

// PUT /:id
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    status?: string; assignee?: string; conclusion?: string; priority?: string;
  }>();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (body.status) updates.status = body.status;
  if (body.assignee) updates.assignee = body.assignee;
  if (body.conclusion) updates.conclusion = body.conclusion;
  if (body.priority) updates.priority = body.priority;
  await db.update(kmGovernanceTasks).set(updates).where(eq(kmGovernanceTasks.id, id));

  if (body.status === 'done' || body.status === 'closed') {
    await writeAudit({ action: 'close_task', object_type: 'governance_task', object_id: id, detail: { conclusion: body.conclusion } });
  }
  return c.json({ ok: true });
});

export default app;
