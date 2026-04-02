/**
 * materializer.ts — Conversation → Interaction materialization
 *
 * 将 conversation 中的人工介入需求物化为可路由的 interaction 对象。
 * 不是所有消息都自动变成 interaction，只有满足以下条件才 materialize:
 *   - bot 触发 handoff
 *   - 客户主动要求人工
 *   - 规则判定需要人工高风险确认
 *   - 坐席主动 claim
 */
import { db, ixConversations, ixInteractions, ixInteractionEvents, eq } from '../db';
import { routeInteraction } from './router-kernel';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MaterializeRequest {
  conversation_id: string;
  customer_party_id?: string;
  channel: string;
  work_model: string;
  queue_code?: string;
  priority?: number;
  handoff_summary?: string;
  provider?: string;
  tenant_id?: string;
}

export interface MaterializeResult {
  success: boolean;
  interaction_id?: string;
  conversation_id?: string;
  assigned_agent_id?: string;
  state?: string;
  error?: string;
}

// ── Materialization ────────────────────────────────────────────────────────

/**
 * Materialize a conversation into a routable interaction.
 *
 * 1. Ensure conversation exists (create if needed)
 * 2. Create interaction in 'created' state
 * 3. Run routing kernel to assign or queue
 */
export async function materializeInteraction(req: MaterializeRequest): Promise<MaterializeResult> {
  const now = new Date();

  // 1. Ensure conversation exists
  let conversation = await db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, req.conversation_id),
  });

  if (!conversation) {
    await db.insert(ixConversations).values({
      conversation_id: req.conversation_id,
      customer_party_id: req.customer_party_id ?? null,
      channel: req.channel,
      domain_scope: 'private_interaction',
      status: 'active',
      ...(req.tenant_id ? { tenant_id: req.tenant_id } : {}),
    });
    conversation = await db.query.ixConversations.findFirst({
      where: eq(ixConversations.conversation_id, req.conversation_id),
    });
  }

  // 2. Create interaction
  const interactionId = crypto.randomUUID();

  await db.insert(ixInteractions).values({
    interaction_id: interactionId,
    conversation_id: req.conversation_id,
    domain_scope: 'private_interaction',
    work_model: req.work_model,
    source_object_type: 'conversation',
    source_object_id: req.conversation_id,
    customer_party_id: req.customer_party_id ?? null,
    provider: req.provider ?? null,
    queue_code: req.queue_code ?? null,
    routing_mode: 'direct_assign',
    priority: req.priority ?? 50,
    state: 'created',
    handoff_summary: req.handoff_summary ?? null,
    ...(req.tenant_id ? { tenant_id: req.tenant_id } : {}),
  });

  // Record creation event
  await db.insert(ixInteractionEvents).values({
    interaction_id: interactionId,
    event_type: 'created',
    actor_type: 'system',
    to_state: 'created',
    payload_json: JSON.stringify({
      conversation_id: req.conversation_id,
      channel: req.channel,
      work_model: req.work_model,
      queue_code: req.queue_code,
    }),
  });

  // 3. Route the interaction
  const routeResult = await routeInteraction(interactionId);

  // Fetch final state
  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });

  return {
    success: true,
    interaction_id: interactionId,
    conversation_id: req.conversation_id,
    assigned_agent_id: routeResult.assigned_agent_id,
    state: interaction?.state ?? 'created',
  };
}
