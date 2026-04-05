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
import { db, ixAgentPresence, ixInteractions, ixConversations, ixAssignments, ixInteractionEvents, eq, and, count } from '../db';
import { pushToAgent } from '../routes/workspace-ws';
import {
  type AgentCandidate,
  type InteractionSnapshot,
  executeCandidateScorers,
  executeQueueSelector,
  executeOfferStrategy,
  executeOverflowPolicy,
} from './plugin-runtime';
import { evaluateRules } from './rule-evaluator';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Extract intent code from handoff_summary. Convention: `[intent:XXX]` prefix. */
function parseIntentCode(summary: string | null | undefined): string | undefined {
  if (!summary) return undefined;
  const match = summary.match(/\[intent:([^\]]+)\]/);
  return match?.[1];
}

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

  // Load conversation to get channel
  const conversation = await db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, interaction.conversation_id),
  });

  // Build interaction snapshot for plugins
  const snapshot: InteractionSnapshot = {
    interaction_id: interaction.interaction_id,
    tenant_id: interaction.tenant_id,
    conversation_id: interaction.conversation_id,
    work_model: interaction.work_model,
    channel: conversation?.channel,
    queue_code: interaction.queue_code ?? undefined,
    priority: interaction.priority,
    customer_party_id: interaction.customer_party_id,
    handoff_summary: interaction.handoff_summary,
    intent_code: parseIntentCode(interaction.handoff_summary),
    wait_seconds: Math.floor((Date.now() - interaction.created_at.getTime()) / 1000),
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
  const { result: queueResult } = await executeQueueSelector(queueCode, snapshot);
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
    .map((a) => {
      const queueCodes: string[] = a.queue_codes_json ? JSON.parse(a.queue_codes_json) : [];
      return {
        agent_id: a.agent_id,
        presence_status: a.presence_status,
        active_chat_count: a.active_chat_count,
        active_voice_count: a.active_voice_count,
        max_chat_slots: a.max_chat_slots,
        max_voice_slots: a.max_voice_slots,
        available_slots: isVoice
          ? a.max_voice_slots - a.active_voice_count
          : a.max_chat_slots - a.active_chat_count,
        queue_codes: queueCodes,
      };
    })
    .filter((a) => {
      if (isVoice) {
        return a.active_voice_count < a.max_voice_slots && a.active_chat_count === 0;
      }
      return a.active_chat_count < a.max_chat_slots && a.active_voice_count === 0;
    })
    // Queue eligibility: agents with no queue assignment match all queues (backward compat)
    .filter((a) => a.queue_codes!.length === 0 || a.queue_codes!.includes(resolvedQueue));

  if (eligible.length === 0) {
    // Enrich snapshot with queue backlog for overflow decisions
    const backlogRows = await db.select({ value: count() }).from(ixInteractions)
      .where(and(eq(ixInteractions.queue_code, resolvedQueue), eq(ixInteractions.state, 'queued')));
    snapshot.queue_backlog = backlogRows[0]?.value ?? 0;

    // 6. Overflow policy (plugin hook)
    const { result: overflow } = await executeOverflowPolicy(resolvedQueue, snapshot);

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

    // Notify customer of queue position
    const backlog = snapshot.queue_backlog ?? 0;
    notifyCustomer(interaction.handoff_summary, 'queue_position', undefined, { position: backlog });

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

  // Push interaction_assigned to agent's workspace WS
  const updatedInteraction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interactionId),
  });
  if (updatedInteraction) {
    pushToAgent(winner.agent_id, {
      type: 'interaction_assigned',
      interaction: updatedInteraction,
      routing_metadata: {
        routing_mode: offerStrategy.routing_mode,
        matched_rule: winner.reason ?? null,
        from_queue: interaction.queue_code,
        is_overflow: false,
      },
    });

    // Push handoff_card if handoff_summary is present (so agent workbench shows the handoff card)
    if (updatedInteraction.handoff_summary) {
      const summary = updatedInteraction.handoff_summary;
      const intentMatch = summary.match(/\[intent:([^\]]+)\]/);
      pushToAgent(winner.agent_id, {
        type: 'handoff_card',
        interaction_id: interactionId,
        data: {
          session_summary: summary,
          customer_intent: intentMatch ? intentMatch[1] : undefined,
          handoff_reason: 'bot_transfer',
        },
      });
    }

    // Notify customer that agent has joined (fire-and-forget)
    notifyCustomer(updatedInteraction.handoff_summary, 'agent_joined', winner.agent_id);
  }

  return { success: true, assigned_agent_id: winner.agent_id, assignment_id: assignmentId };
}

// ── Customer notification helpers ─────────────────────────────────────────

/** Parse [key:value] tags from handoff_summary */
function parseSummaryTag(summary: string | null | undefined, tag: string): string | undefined {
  if (!summary) return undefined;
  const match = summary.match(new RegExp(`\\[${tag}:([^\\]]+)\\]`));
  return match?.[1];
}

/** Fire-and-forget: notify customer WS via backend's internal API */
function notifyCustomer(
  handoffSummary: string | null | undefined,
  eventType: 'queue_position' | 'agent_joined' | 'session_closed',
  agentId?: string,
  extra?: Record<string, unknown>,
) {
  const phone = parseSummaryTag(handoffSummary, 'phone');
  if (!phone) return;
  const lang = parseSummaryTag(handoffSummary, 'lang') ?? 'zh';
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:18472';

  fetch(`${backendUrl}/api/internal/notify/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, event_type: eventType, agent_id: agentId, lang, ...extra }),
  }).catch(() => { /* fire-and-forget */ });
}
