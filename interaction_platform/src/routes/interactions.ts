/**
 * interactions.ts — Interaction CRUD + state transitions + materialize
 */
import { Hono } from 'hono';
import { db, ixInteractions, ixInteractionEvents, ixAgentPresence, eq, and, desc } from '../db';
import { materializeInteraction, type MaterializeRequest } from '../services/materializer';
import { routeInteraction } from '../services/router-kernel';
import { createFollowUp, type FollowUpRequest } from '../services/work-order-bridge';
import { pushToAgent } from './workspace-ws';

const router = new Hono();

/** POST /materialize — Create interaction from conversation and route it */
router.post('/materialize', async (c) => {
  const body = await c.req.json<MaterializeRequest>();
  if (!body.conversation_id || !body.channel || !body.work_model) {
    return c.json({ error: 'conversation_id, channel, and work_model are required' }, 400);
  }

  const result = await materializeInteraction(body);
  if (!result.success) return c.json({ error: result.error }, 500);
  return c.json(result, 201);
});

/** GET / — List interactions (with optional filters) */
router.get('/', async (c) => {
  const state = c.req.query('state');
  const agentId = c.req.query('assigned_agent_id');
  const conversationId = c.req.query('conversation_id');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  let query = db.select().from(ixInteractions).$dynamic();

  if (state) query = query.where(eq(ixInteractions.state, state));
  if (agentId) query = query.where(eq(ixInteractions.assigned_agent_id, agentId));
  if (conversationId) query = query.where(eq(ixInteractions.conversation_id, conversationId));

  const rows = await query.limit(limit).all();
  return c.json({ items: rows });
});

/** GET /:id — Get a single interaction */
router.get('/:id', async (c) => {
  const row = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, c.req.param('id')),
  });
  if (!row) return c.json({ error: 'Interaction not found' }, 404);
  return c.json(row);
});

/** POST /:id/activate — Transition to active */
router.post('/:id/activate', async (c) => {
  const id = c.req.param('id');
  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.state !== 'assigned') {
    return c.json({ error: `Cannot activate interaction in state '${interaction.state}'` }, 409);
  }

  const now = new Date();
  await db.update(ixInteractions)
    .set({ state: 'active', updated_at: now })
    .where(eq(ixInteractions.interaction_id, id));

  await db.insert(ixInteractionEvents).values({
    interaction_id: id,
    event_type: 'active',
    actor_type: 'agent',
    actor_id: interaction.assigned_agent_id,
    from_state: 'assigned',
    to_state: 'active',
  });

  const updated = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  return c.json(updated);
});

/** POST /:id/wrap-up — Start wrap-up */
router.post('/:id/wrap-up', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ code?: string; note?: string }>();

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.state !== 'active') {
    return c.json({ error: `Cannot wrap up interaction in state '${interaction.state}'` }, 409);
  }

  const now = new Date();
  await db.update(ixInteractions)
    .set({
      state: 'wrapping_up',
      wrap_up_code: body.code ?? null,
      wrap_up_note: body.note ?? null,
      updated_at: now,
    })
    .where(eq(ixInteractions.interaction_id, id));

  await db.insert(ixInteractionEvents).values({
    interaction_id: id,
    event_type: 'wrapping_up',
    actor_type: 'agent',
    actor_id: interaction.assigned_agent_id,
    from_state: 'active',
    to_state: 'wrapping_up',
    payload_json: JSON.stringify({ code: body.code, note: body.note }),
  });

  const updated = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  return c.json(updated);
});

/** POST /:id/close — Close interaction (with optional follow-up work order) */
router.post('/:id/close', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    wrap_up_code?: string;
    wrap_up_note?: string;
    follow_up?: FollowUpRequest;
  }>();

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.state !== 'wrapping_up' && interaction.state !== 'active') {
    return c.json({ error: `Cannot close interaction in state '${interaction.state}'` }, 409);
  }

  const agentId = interaction.assigned_agent_id;
  const now = new Date();

  // Close the interaction
  await db.update(ixInteractions)
    .set({
      state: 'closed',
      wrap_up_code: body.wrap_up_code ?? interaction.wrap_up_code,
      wrap_up_note: body.wrap_up_note ?? interaction.wrap_up_note,
      closed_at: now,
      updated_at: now,
    })
    .where(eq(ixInteractions.interaction_id, id));

  await db.insert(ixInteractionEvents).values({
    interaction_id: id,
    event_type: 'closed',
    actor_type: 'agent',
    actor_id: agentId,
    from_state: interaction.state,
    to_state: 'closed',
    payload_json: JSON.stringify({ wrap_up_code: body.wrap_up_code, wrap_up_note: body.wrap_up_note }),
  });

  // Release agent workload
  if (agentId) {
    const isVoice = interaction.work_model === 'live_voice';
    const agent = await db.query.ixAgentPresence.findFirst({
      where: eq(ixAgentPresence.agent_id, agentId),
    });
    if (agent) {
      if (isVoice) {
        await db.update(ixAgentPresence)
          .set({ active_voice_count: Math.max(0, agent.active_voice_count - 1), updated_at: now })
          .where(eq(ixAgentPresence.agent_id, agentId));
      } else {
        await db.update(ixAgentPresence)
          .set({ active_chat_count: Math.max(0, agent.active_chat_count - 1), updated_at: now })
          .where(eq(ixAgentPresence.agent_id, agentId));
      }
    }

    // Notify agent inbox
    pushToAgent(agentId, {
      type: 'interaction_state_changed',
      interaction_id: id,
      state: 'closed',
    });
  }

  // Create follow-up work order if requested
  let followUpResult = null;
  if (body.follow_up) {
    followUpResult = await createFollowUp(id, agentId ?? 'system', body.follow_up);
  }

  const updated = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  return c.json({ ...updated, follow_up: followUpResult });
});

/** POST /:id/transfer — Transfer interaction to another queue */
router.post('/:id/transfer', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ target_queue: string }>();
  if (!body.target_queue) return c.json({ error: 'target_queue is required' }, 400);

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.state !== 'active' && interaction.state !== 'assigned') {
    return c.json({ error: `Cannot transfer interaction in state '${interaction.state}'` }, 409);
  }

  const now = new Date();
  // Move to transferred → queued
  await db.update(ixInteractions)
    .set({
      state: 'queued',
      queue_code: body.target_queue,
      assigned_agent_id: null,
      updated_at: now,
    })
    .where(eq(ixInteractions.interaction_id, id));

  await db.insert(ixInteractionEvents).values({
    interaction_id: id,
    event_type: 'transferred',
    actor_type: 'agent',
    actor_id: interaction.assigned_agent_id,
    from_state: interaction.state,
    to_state: 'queued',
    payload_json: JSON.stringify({ target_queue: body.target_queue }),
  });

  // Re-route in the new queue
  const routeResult = await routeInteraction(id);

  const updated = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, id),
  });
  return c.json(updated);
});

export default router;
