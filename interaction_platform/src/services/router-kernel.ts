/**
 * router-kernel.ts — Shared Routing Kernel
 *
 * 路由流水线:
 *   1. 获取 interaction snapshot
 *   2. 队列选择 (plugin: queue_selector 或 materialization 指定)
 *   3. 拉候选 agent snapshot (online + capacity available)
 *   4. 打分 (plugin: candidate_scorer，默认 least-loaded)
 *   5. 分配策略 (plugin: offer_strategy，默认 direct_assign)
 *   6. 溢出策略 (plugin: overflow_policy，默认 wait)
 *
 * Phase 5: 所有决策点支持插件化，core 逻辑作为 fallback。
 */
import { db, ixAgentPresence, ixInteractions, ixAssignments, ixInteractionEvents, eq, and } from '../db';
import {
  type AgentCandidate,
  type InteractionSnapshot,
  executeCandidateScorers,
  executeQueueSelector,
  executeOfferStrategy,
  executeOverflowPolicy,
} from './plugin-runtime';
import { evaluateRules } from './rule-evaluator';

// ── Types ──────────────────────────────────────────────────────────────────

export type { AgentCandidate };

export interface RouteResult {
  success: boolean;
  assigned_agent_id?: string;
  assignment_id?: string;
  error?: string;
}

// ── Routing Pipeline ───────────────────────────────────────────────────────

/**
 * Route an interaction: find the best available agent and assign.
 *
 * Routing pipeline with plugin hooks at each decision point:
 *   1. Load interaction
 *   2. Queue selection (plugin: queue_selector)
 *   3. Find eligible agents
 *   4. Score candidates (plugin: candidate_scorer, default: least-loaded)
 *   5. Offer strategy (plugin: offer_strategy, default: direct_assign)
 *   6. Assign or queue (plugin: overflow_policy if no agents)
 */
export async function routeInteraction(interactionId: string): Promise<RouteResult> {
  // 1. Load interaction
  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });
  if (!interaction) return { success: false, error: 'Interaction not found' };
  if (interaction.state !== 'created' && interaction.state !== 'queued') {
    return { success: false, error: `Cannot route interaction in state '${interaction.state}'` };
  }

  // Build interaction snapshot for plugins
  const snapshot: InteractionSnapshot = {
    interaction_id: interaction.interaction_id,
    tenant_id: interaction.tenant_id,
    conversation_id: interaction.conversation_id,
    work_model: interaction.work_model,
    queue_code: interaction.queue_code ?? undefined,
    priority: interaction.priority,
    customer_party_id: interaction.customer_party_id,
    handoff_summary: interaction.handoff_summary,
  };

  // 1.5 Route rule evaluation (before plugin queue_selector)
  const ruleMatch = await evaluateRules(snapshot);
  let ruleQueue: string | undefined;
  if (ruleMatch.matched && ruleMatch.queue_code) {
    ruleQueue = ruleMatch.queue_code;
    // Apply action overrides from the rule
    if (ruleMatch.action_overrides?.set_priority !== undefined) {
      snapshot.priority = ruleMatch.action_overrides.set_priority;
    }
  }

  // 2. Queue selection (plugin hook)
  const queueCode = ruleQueue ?? interaction.queue_code ?? 'default_chat';
  const queueResult = await executeQueueSelector(queueCode, snapshot);
  const resolvedQueue = queueResult.queue_code;

  // Update queue_code if plugin changed it
  if (resolvedQueue !== interaction.queue_code) {
    await db.update(ixInteractions)
      .set({ queue_code: resolvedQueue, updated_at: new Date() })
      .where(eq(ixInteractions.interaction_id, interactionId));
  }

  // 3. Determine capacity type from work model
  const isVoice = interaction.work_model === 'live_voice';

  // 4. Find eligible agents (online + available capacity)
  const candidates = await db.select().from(ixAgentPresence)
    .where(
      and(
        eq(ixAgentPresence.tenant_id, interaction.tenant_id),
        eq(ixAgentPresence.presence_status, 'online'),
      ),
    )
    .all();

  const eligible: AgentCandidate[] = candidates
    .map((a) => ({
      agent_id: a.agent_id,
      presence_status: a.presence_status,
      active_chat_count: a.active_chat_count,
      active_voice_count: a.active_voice_count,
      max_chat_slots: a.max_chat_slots,
      max_voice_slots: a.max_voice_slots,
      available_slots: isVoice
        ? a.max_voice_slots - a.active_voice_count
        : a.max_chat_slots - a.active_chat_count,
    }))
    .filter((a) => {
      if (isVoice) {
        return a.active_voice_count < a.max_voice_slots && a.active_chat_count === 0;
      }
      return a.active_chat_count < a.max_chat_slots && a.active_voice_count === 0;
    });

  if (eligible.length === 0) {
    // 6. Overflow policy (plugin hook)
    const overflow = await executeOverflowPolicy(resolvedQueue, snapshot);

    if (overflow.action === 'overflow' && overflow.overflow_queue) {
      // Re-route to overflow queue
      await db.update(ixInteractions)
        .set({ queue_code: overflow.overflow_queue, state: 'queued', updated_at: new Date() })
        .where(eq(ixInteractions.interaction_id, interactionId));

      await db.insert(ixInteractionEvents).values({
        interaction_id: interactionId,
        event_type: 'overflow',
        actor_type: 'system',
        from_state: interaction.state,
        to_state: 'queued',
        payload_json: JSON.stringify({ from_queue: resolvedQueue, to_queue: overflow.overflow_queue, reason: overflow.reason }),
      });

      return { success: true };
    }

    // Default: move to queued state and wait
    await db.update(ixInteractions)
      .set({ state: 'queued', updated_at: new Date() })
      .where(eq(ixInteractions.interaction_id, interactionId));

    await db.insert(ixInteractionEvents).values({
      interaction_id: interactionId,
      event_type: 'queued',
      actor_type: 'system',
      from_state: interaction.state,
      to_state: 'queued',
    });

    return { success: true };
  }

  // 5. Score candidates (plugin hook — includes shadow scoring)
  const { scored } = await executeCandidateScorers(resolvedQueue, eligible, snapshot);
  const winner = scored[0]!;

  // Offer strategy (plugin hook) — determines routing mode
  const offerStrategy = await executeOfferStrategy(resolvedQueue, snapshot, eligible);

  // For now, only direct_assign is fully implemented
  // push_offer and pull_claim would integrate with workspace-ws offer protocol
  const assignmentId = crypto.randomUUID();
  const now = new Date();

  await db.update(ixInteractions)
    .set({
      state: 'assigned',
      assigned_agent_id: winner.agent_id,
      routing_mode: offerStrategy.routing_mode,
      updated_at: now,
    })
    .where(eq(ixInteractions.interaction_id, interactionId));

  await db.insert(ixAssignments).values({
    assignment_id: assignmentId,
    interaction_id: interactionId,
    agent_id: winner.agent_id,
    assignment_type: 'primary',
  });

  // Update agent workload
  if (isVoice) {
    await db.update(ixAgentPresence)
      .set({ active_voice_count: winner.active_voice_count + 1, updated_at: now })
      .where(eq(ixAgentPresence.agent_id, winner.agent_id));
  } else {
    await db.update(ixAgentPresence)
      .set({ active_chat_count: winner.active_chat_count + 1, updated_at: now })
      .where(eq(ixAgentPresence.agent_id, winner.agent_id));
  }

  // Record assignment event
  await db.insert(ixInteractionEvents).values({
    interaction_id: interactionId,
    event_type: 'assigned',
    actor_type: 'system',
    from_state: interaction.state,
    to_state: 'assigned',
    payload_json: JSON.stringify({
      agent_id: winner.agent_id,
      assignment_id: assignmentId,
      routing_mode: offerStrategy.routing_mode,
      score: winner.score,
      score_reason: winner.reason,
    }),
  });

  return { success: true, assigned_agent_id: winner.agent_id, assignment_id: assignmentId };
}
