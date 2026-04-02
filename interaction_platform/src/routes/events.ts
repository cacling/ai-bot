/**
 * events.ts — Interaction events query API (read-only audit trail)
 */
import { Hono } from 'hono';
import { db, ixInteractionEvents, eq, desc } from '../db';

const router = new Hono();

/** GET / — Query events (by interaction_id or event_type) */
router.get('/', async (c) => {
  const interactionId = c.req.query('interaction_id');
  const eventType = c.req.query('event_type');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 500);

  let query = db.select().from(ixInteractionEvents).$dynamic();

  if (interactionId) query = query.where(eq(ixInteractionEvents.interaction_id, interactionId));
  if (eventType) query = query.where(eq(ixInteractionEvents.event_type, eventType));

  const rows = await query.orderBy(desc(ixInteractionEvents.created_at)).limit(limit).all();
  return c.json({ items: rows });
});

/** GET /interaction/:id — Get all events for an interaction (ordered) */
router.get('/interaction/:id', async (c) => {
  const rows = await db.select().from(ixInteractionEvents)
    .where(eq(ixInteractionEvents.interaction_id, c.req.param('id')))
    .orderBy(ixInteractionEvents.event_id)
    .all();
  return c.json({ items: rows });
});

export default router;
