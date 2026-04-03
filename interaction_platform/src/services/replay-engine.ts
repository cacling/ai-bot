/**
 * replay-engine.ts — Routing decision replay & comparison.
 *
 * Replays a historical interaction's routing decision using current plugin
 * configuration, allowing operators to:
 *   - Debug why an interaction was routed to a specific agent
 *   - Test "what-if" scenarios with different plugins/configs
 *   - Validate plugin changes against historical data
 */
import {
  db,
  ixInteractions,
  ixInteractionEvents,
  ixAgentPresence,
  ixPluginExecutionLogs,
  eq,
  and,
  desc,
} from '../db';
import {
  type AgentCandidate,
  type InteractionSnapshot,
  type ScoredCandidate,
  executeCandidateScorers,
  executeQueueSelector,
} from './plugin-runtime';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReplayInput {
  interaction_id: string;
  /** Override queue_code for what-if testing */
  override_queue_code?: string;
}

export interface ReplayResult {
  interaction_id: string;
  // Original routing decision
  original: {
    assigned_agent_id?: string | null;
    queue_code?: string | null;
    state: string;
    routed_at?: Date | null;
    plugin_logs: Array<{
      plugin_id: string;
      slot: string;
      status: string;
      duration_ms: number | null;
      output_snapshot: unknown;
    }>;
  };
  // Replayed routing decision (using current plugins)
  replayed: {
    queue_selector_result?: { queue_code: string; reason?: string };
    scored_candidates: ScoredCandidate[];
    would_assign?: string;
    shadow_results: Array<{ plugin: string; scored: ScoredCandidate[] }>;
  };
  // Comparison
  divergence: boolean;
  divergence_summary?: string;
}

// ── Replay ────────────────────────────────────────────────────────────────

/**
 * Replay an interaction's routing decision.
 *
 * 1. Load the original interaction + its routing events + plugin logs
 * 2. Reconstruct the agent presence snapshot at routing time (approximation)
 * 3. Re-run current plugins against the reconstructed snapshot
 * 4. Compare results
 */
export async function replayRouting(input: ReplayInput): Promise<ReplayResult> {
  const { interaction_id } = input;

  // 1. Load original interaction
  const interaction = await db.query.ixInteractions.findFirst({
    where: eq(ixInteractions.interaction_id, interaction_id),
  });
  if (!interaction) throw new Error(`Interaction not found: ${interaction_id}`);

  // 2. Load original routing events
  const events = await db.select().from(ixInteractionEvents)
    .where(eq(ixInteractionEvents.interaction_id, interaction_id))
    .orderBy(ixInteractionEvents.created_at)
    .all();

  const assignedEvent = events.find((e) => e.event_type === 'assigned');
  const originalAssignedAgent = assignedEvent?.payload_json
    ? (JSON.parse(assignedEvent.payload_json) as { agent_id?: string }).agent_id
    : interaction.assigned_agent_id;

  // 3. Load original plugin execution logs
  const pluginLogs = await db.select().from(ixPluginExecutionLogs)
    .where(eq(ixPluginExecutionLogs.interaction_id, interaction_id))
    .orderBy(ixPluginExecutionLogs.created_at)
    .all();

  // 4. Reconstruct agent presence snapshot (use current state as approximation)
  const agentPresence = await db.select().from(ixAgentPresence).all();
  const candidates: AgentCandidate[] = agentPresence
    .filter((a) => a.presence_status === 'online')
    .map((a) => ({
      agent_id: a.agent_id,
      presence_status: a.presence_status,
      active_chat_count: a.active_chat_count,
      active_voice_count: a.active_voice_count,
      max_chat_slots: a.max_chat_slots,
      max_voice_slots: a.max_voice_slots,
      available_slots: interaction.work_model === 'live_voice'
        ? a.max_voice_slots - a.active_voice_count
        : a.max_chat_slots - a.active_chat_count,
      queue_codes: a.queue_codes_json ? JSON.parse(a.queue_codes_json) : undefined,
    }));

  // 5. Build interaction snapshot
  const snapshot: InteractionSnapshot = {
    interaction_id: interaction.interaction_id,
    tenant_id: interaction.tenant_id,
    conversation_id: interaction.conversation_id,
    work_model: interaction.work_model,
    queue_code: input.override_queue_code ?? interaction.queue_code ?? undefined,
    priority: interaction.priority,
    customer_party_id: interaction.customer_party_id,
    handoff_summary: interaction.handoff_summary,
  };

  // 6. Re-run queue selector (if override or testing)
  const queueCode = snapshot.queue_code ?? 'default_chat';
  const { result: queueSelectorResult } = await executeQueueSelector(queueCode, snapshot);

  // 7. Re-run candidate scorers with current plugins
  const { scored, shadow_results } = await executeCandidateScorers(
    queueSelectorResult.queue_code,
    candidates,
    snapshot,
  );

  const wouldAssign = scored[0]?.agent_id;

  // 8. Compare
  const divergence = wouldAssign !== originalAssignedAgent;

  return {
    interaction_id,
    original: {
      assigned_agent_id: originalAssignedAgent,
      queue_code: interaction.queue_code,
      state: interaction.state,
      routed_at: assignedEvent?.created_at ?? null,
      plugin_logs: pluginLogs.map((l) => ({
        plugin_id: l.plugin_id,
        slot: l.slot,
        status: l.status,
        duration_ms: l.duration_ms,
        output_snapshot: l.output_snapshot_json ? JSON.parse(l.output_snapshot_json) : null,
      })),
    },
    replayed: {
      queue_selector_result: queueSelectorResult,
      scored_candidates: scored,
      would_assign: wouldAssign,
      shadow_results,
    },
    divergence,
    divergence_summary: divergence
      ? `Original: ${originalAssignedAgent ?? 'none'}, Replayed: ${wouldAssign ?? 'none'}`
      : undefined,
  };
}

/**
 * Batch replay: re-run routing for multiple historical interactions.
 * Useful for validating plugin changes against historical data.
 */
export async function batchReplay(
  interactionIds: string[],
  overrideQueueCode?: string,
): Promise<{ results: ReplayResult[]; divergence_count: number; total: number }> {
  const results: ReplayResult[] = [];

  for (const id of interactionIds) {
    try {
      const result = await replayRouting({
        interaction_id: id,
        override_queue_code: overrideQueueCode,
      });
      results.push(result);
    } catch {
      // Skip interactions that can't be replayed (deleted, etc.)
    }
  }

  return {
    results,
    divergence_count: results.filter((r) => r.divergence).length,
    total: results.length,
  };
}
