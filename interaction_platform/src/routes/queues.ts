/**
 * queues.ts — Routing queue configuration CRUD
 */
import { Hono } from 'hono';
import { db, ixRoutingQueues, eq } from '../db';

const router = new Hono();

/** GET / — List all routing queues */
router.get('/', async (c) => {
  const rows = await db.select().from(ixRoutingQueues).all();
  return c.json({ items: rows });
});

/** GET /:code — Get a single queue */
router.get('/:code', async (c) => {
  const row = await db.query.ixRoutingQueues.findFirst({
    where: eq(ixRoutingQueues.queue_code, c.req.param('code')),
  });
  if (!row) return c.json({ error: 'Queue not found' }, 404);
  return c.json(row);
});

/** POST / — Create a routing queue */
router.post('/', async (c) => {
  const body = await c.req.json<{
    queue_code: string;
    display_name_zh: string;
    display_name_en: string;
    domain_scope?: string;
    work_model?: string;
    priority?: number;
    max_wait_seconds?: number;
    overflow_queue?: string;
    config_json?: string;
  }>();

  if (!body.queue_code || !body.display_name_zh || !body.display_name_en) {
    return c.json({ error: 'queue_code, display_name_zh, and display_name_en are required' }, 400);
  }

  await db.insert(ixRoutingQueues).values({
    queue_code: body.queue_code,
    display_name_zh: body.display_name_zh,
    display_name_en: body.display_name_en,
    domain_scope: body.domain_scope ?? 'private_interaction',
    work_model: body.work_model ?? 'live_chat',
    priority: body.priority ?? 50,
    max_wait_seconds: body.max_wait_seconds ?? 300,
    overflow_queue: body.overflow_queue ?? null,
    config_json: body.config_json ?? null,
  });

  const row = await db.query.ixRoutingQueues.findFirst({
    where: eq(ixRoutingQueues.queue_code, body.queue_code),
  });
  return c.json(row, 201);
});

/** PUT /:code — Update a routing queue */
router.put('/:code', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json<Record<string, unknown>>();

  const allowed = ['display_name_zh', 'display_name_en', 'priority', 'max_wait_seconds', 'overflow_queue', 'status', 'config_json'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400);
  }

  await db.update(ixRoutingQueues).set(updates).where(eq(ixRoutingQueues.queue_code, code));

  const row = await db.query.ixRoutingQueues.findFirst({
    where: eq(ixRoutingQueues.queue_code, code),
  });
  if (!row) return c.json({ error: 'Queue not found' }, 404);
  return c.json(row);
});

export default router;
