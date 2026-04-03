/**
 * presence.ts — Agent presence & capacity management
 */
import { Hono } from 'hono';
import { db, ixAgentPresence, eq } from '../db';

const router = new Hono();

/** GET /:agentId — Get agent presence */
router.get('/:agentId', async (c) => {
  const row = await db.query.ixAgentPresence.findFirst({
    where: eq(ixAgentPresence.agent_id, c.req.param('agentId')),
  });
  if (!row) return c.json({ error: 'Agent presence not found' }, 404);
  return c.json(row);
});

/** PUT /:agentId — Update agent presence status */
router.put('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const body = await c.req.json<{
    status?: string;
    max_chat_slots?: number;
    max_voice_slots?: number;
    active_chat_count?: number;
    active_voice_count?: number;
  }>();

  const existing = await db.query.ixAgentPresence.findFirst({
    where: eq(ixAgentPresence.agent_id, agentId),
  });

  const now = new Date();

  if (!existing) {
    // Auto-create presence record
    await db.insert(ixAgentPresence).values({
      agent_id: agentId,
      presence_status: body.status ?? 'online',
      max_chat_slots: body.max_chat_slots ?? 3,
      max_voice_slots: body.max_voice_slots ?? 1,
      last_heartbeat_at: now,
    });
  } else {
    const updates: Record<string, unknown> = { updated_at: now, last_heartbeat_at: now };
    if (body.status) updates.presence_status = body.status;
    if (body.max_chat_slots !== undefined) updates.max_chat_slots = body.max_chat_slots;
    if (body.max_voice_slots !== undefined) updates.max_voice_slots = body.max_voice_slots;
    if (body.active_chat_count !== undefined) updates.active_chat_count = body.active_chat_count;
    if (body.active_voice_count !== undefined) updates.active_voice_count = body.active_voice_count;

    await db.update(ixAgentPresence)
      .set(updates)
      .where(eq(ixAgentPresence.agent_id, agentId));
  }

  const row = await db.query.ixAgentPresence.findFirst({
    where: eq(ixAgentPresence.agent_id, agentId),
  });
  return c.json(row);
});

/** POST /:agentId/heartbeat — Update heartbeat timestamp */
router.post('/:agentId/heartbeat', async (c) => {
  const agentId = c.req.param('agentId');
  const now = new Date();

  await db.update(ixAgentPresence)
    .set({ last_heartbeat_at: now, updated_at: now })
    .where(eq(ixAgentPresence.agent_id, agentId));

  return c.json({ ok: true });
});

/** GET / — List all agents' presence */
router.get('/', async (c) => {
  const status = c.req.query('status');
  let query = db.select().from(ixAgentPresence).$dynamic();
  if (status) query = query.where(eq(ixAgentPresence.presence_status, status));
  const rows = await query.all();
  return c.json({ items: rows });
});

export default router;
