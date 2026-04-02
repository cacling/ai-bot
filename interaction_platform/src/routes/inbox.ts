/**
 * inbox.ts — Agent Inbox API
 *
 * 返回坐席的 assigned interactions, pending offers, focused interaction。
 * 这是 Inbox 模型的核心 API，不再围绕 phone 工作。
 */
import { Hono } from 'hono';
import { db, ixInteractions, ixOffers, eq, and } from '../db';

const router = new Hono();

/** GET /:agentId — Get agent's inbox snapshot */
router.get('/:agentId', async (c) => {
  const agentId = c.req.param('agentId');

  // Assigned interactions (not closed/abandoned)
  const assigned = await db.select().from(ixInteractions)
    .where(
      and(
        eq(ixInteractions.assigned_agent_id, agentId),
        // Exclude terminal states by listing active states
      ),
    )
    .all();

  const activeInteractions = assigned.filter(
    (i) => !['closed', 'abandoned'].includes(i.state),
  );

  // Pending offers
  const offers = await db.select().from(ixOffers)
    .where(
      and(
        eq(ixOffers.agent_id, agentId),
        eq(ixOffers.status, 'pending'),
      ),
    )
    .all();

  return c.json({
    assigned: activeInteractions,
    offers,
    total_assigned: activeInteractions.length,
    total_offers: offers.length,
  });
});

/** GET /:agentId/interaction/:interactionId — Get interaction detail for agent */
router.get('/:agentId/interaction/:interactionId', async (c) => {
  const agentId = c.req.param('agentId');
  const interactionId = c.req.param('interactionId');

  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });

  if (!interaction) return c.json({ error: 'Interaction not found' }, 404);
  if (interaction.assigned_agent_id !== agentId) {
    return c.json({ error: 'Interaction not assigned to this agent' }, 403);
  }

  // Fetch the conversation
  const conversation = await db.query.ixConversations.findFirst({
    where: eq(db._.fullSchema.ixConversations.conversation_id, interaction.conversation_id),
  });

  return c.json({
    interaction,
    conversation,
  });
});

export default router;
