/**
 * conflicts.ts — 冲突记录 + 仲裁
 */
import { Hono } from 'hono';
import { eq, desc, and, SQL } from 'drizzle-orm';
import { db } from '../../db';
import { kmConflictRecords } from '../../db/schema';
import { nanoid, writeAudit } from './helpers';

const app = new Hono();

// GET /
app.get('/', async (c) => {
  const { status, conflict_type } = c.req.query();
  const conditions: SQL[] = [];
  if (status) conditions.push(eq(kmConflictRecords.status, status));
  if (conflict_type) conditions.push(eq(kmConflictRecords.conflict_type, conflict_type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(kmConflictRecords).where(where)
    .orderBy(desc(kmConflictRecords.created_at));
  return c.json({ items: rows });
});

// GET /:id
app.get('/:id', async (c) => {
  const [row] = await db.select().from(kmConflictRecords).where(eq(kmConflictRecords.id, c.req.param('id'))).limit(1);
  if (!row) return c.json({ error: '冲突记录不存在' }, 404);
  return c.json(row);
});

// POST / — 创建冲突记录
app.post('/', async (c) => {
  const body = await c.req.json<{
    conflict_type: string; item_a_id: string; item_b_id: string;
    overlap_scope?: string; blocking_policy?: string;
  }>();
  const id = nanoid();
  await db.insert(kmConflictRecords).values({
    id, conflict_type: body.conflict_type,
    item_a_id: body.item_a_id, item_b_id: body.item_b_id,
    overlap_scope: body.overlap_scope,
    blocking_policy: body.blocking_policy ?? 'block_submit',
    status: 'pending', created_at: new Date().toISOString(),
  });
  return c.json({ id }, 201);
});

// PUT /:id/resolve — 仲裁
app.put('/:id/resolve', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    resolution: string; arbiter?: string; blocking_policy?: string;
  }>();
  await db.update(kmConflictRecords).set({
    resolution: body.resolution, arbiter: body.arbiter,
    blocking_policy: body.blocking_policy,
    status: 'resolved', resolved_at: new Date().toISOString(),
  }).where(eq(kmConflictRecords.id, id));

  await writeAudit({
    action: 'conflict_resolved', object_type: 'conflict_record', object_id: id,
    operator: body.arbiter, detail: { resolution: body.resolution },
  });
  return c.json({ ok: true });
});

export default app;
