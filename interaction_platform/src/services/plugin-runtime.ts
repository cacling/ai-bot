/**
 * plugin-runtime.ts — Plugin execution runtime.
 *
 * Loads plugin bindings for a queue+slot, executes them with timeout/fallback,
 * and logs execution results.
 *
 * Plugin slots:
 *   - queue_selector:    selects target queue for an interaction
 *   - candidate_scorer:  scores/ranks agent candidates
 *   - offer_strategy:    decides push_offer vs direct_assign vs pull_claim
 *   - overflow_policy:   handles queue overflow (redirect, callback, etc.)
 *
 * Plugins are read-only: they receive snapshots and return decisions.
 * They cannot directly write to interactions/assignments tables.
 */
import {
  db,
  ixPluginCatalog,
  ixPluginBindings,
  ixPluginExecutionLogs,
  eq,
  and,
} from '../db';

// ── Types ──────────────────────────────────────────────────────────────────

export type PluginSlot = 'queue_selector' | 'candidate_scorer' | 'offer_strategy' | 'overflow_policy';

export interface AgentCandidate {
  agent_id: string;
  presence_status: string;
  active_chat_count: number;
  active_voice_count: number;
  max_chat_slots: number;
  max_voice_slots: number;
  available_slots: number;
  queue_codes?: string[];
}

export interface ScoredCandidate extends AgentCandidate {
  score: number;
  reason?: string;
}

export interface InteractionSnapshot {
  interaction_id: string;
  tenant_id: string;
  conversation_id: string;
  work_model: string;
  channel?: string;
  queue_code?: string;
  priority: number;
  customer_party_id?: string | null;
  handoff_summary?: string | null;
  intent_code?: string;
  wait_seconds?: number;
  queue_backlog?: number;
}

export interface QueueSelectorResult {
  queue_code: string;
  reason?: string;
}

export interface OfferStrategyResult {
  routing_mode: 'push_offer' | 'direct_assign' | 'pull_claim';
  reason?: string;
}

export interface OverflowPolicyResult {
  action: 'wait' | 'overflow' | 'callback' | 'abandon';
  overflow_queue?: string;
  reason?: string;
}

export type PluginResult = ScoredCandidate[] | QueueSelectorResult | OfferStrategyResult | OverflowPolicyResult;

/** Resolved binding with plugin metadata */
export interface ResolvedBinding {
  binding_id: string;
  plugin_id: string;
  plugin_name: string;
  slot: PluginSlot;
  priority_order: number;
  shadow_mode: boolean;
  timeout_ms: number;
  fallback_behavior: string;
  config: Record<string, unknown>;
  handler_module: string;
}

// ── Plugin Handler Registry ────────────────────────────────────────────────

/**
 * Built-in plugin handlers, keyed by handler_module name.
 * External plugins would load from file system (future).
 */
export type CandidateScorerFn = (candidates: AgentCandidate[], interaction: InteractionSnapshot, config: Record<string, unknown>) => Promise<ScoredCandidate[]>;
export type QueueSelectorFn = (interaction: InteractionSnapshot, config: Record<string, unknown>) => Promise<QueueSelectorResult>;
export type OfferStrategyFn = (interaction: InteractionSnapshot, candidates: AgentCandidate[], config: Record<string, unknown>) => Promise<OfferStrategyResult>;
export type OverflowPolicyFn = (interaction: InteractionSnapshot, config: Record<string, unknown>) => Promise<OverflowPolicyResult>;

const candidateScorerHandlers = new Map<string, CandidateScorerFn>();
const queueSelectorHandlers = new Map<string, QueueSelectorFn>();
const offerStrategyHandlers = new Map<string, OfferStrategyFn>();
const overflowPolicyHandlers = new Map<string, OverflowPolicyFn>();

/** Register a built-in candidate scorer plugin */
export function registerCandidateScorer(name: string, handler: CandidateScorerFn) {
  candidateScorerHandlers.set(name, handler);
}

/** Register a built-in queue selector plugin */
export function registerQueueSelector(name: string, handler: QueueSelectorFn) {
  queueSelectorHandlers.set(name, handler);
}

/** Register a built-in offer strategy plugin */
export function registerOfferStrategy(name: string, handler: OfferStrategyFn) {
  offerStrategyHandlers.set(name, handler);
}

/** Register a built-in overflow policy plugin */
export function registerOverflowPolicy(name: string, handler: OverflowPolicyFn) {
  overflowPolicyHandlers.set(name, handler);
}

// ── Binding Resolution ────────────────────────────────────────────────────

/**
 * Load all active bindings for a queue+slot, resolved with plugin metadata.
 */
export async function resolveBindings(queueCode: string, slot: PluginSlot): Promise<ResolvedBinding[]> {
  const bindings = await db.select()
    .from(ixPluginBindings)
    .where(
      and(
        eq(ixPluginBindings.queue_code, queueCode),
        eq(ixPluginBindings.slot, slot),
        eq(ixPluginBindings.enabled, true),
      ),
    )
    .all();

  const resolved: ResolvedBinding[] = [];

  for (const b of bindings) {
    const plugin = await db.query.ixPluginCatalog.findFirst({
      where: and(
        eq(ixPluginCatalog.plugin_id, b.plugin_id),
        eq(ixPluginCatalog.status, 'active'),
      ),
    });
    if (!plugin) continue;

    const defaultConfig = plugin.default_config_json ? JSON.parse(plugin.default_config_json) : {};
    const overrideConfig = b.config_override_json ? JSON.parse(b.config_override_json) : {};

    resolved.push({
      binding_id: b.binding_id,
      plugin_id: b.plugin_id,
      plugin_name: plugin.name,
      slot: b.slot as PluginSlot,
      priority_order: b.priority_order,
      shadow_mode: b.shadow_mode,
      timeout_ms: plugin.timeout_ms,
      fallback_behavior: plugin.fallback_behavior,
      config: { ...defaultConfig, ...overrideConfig },
      handler_module: plugin.handler_module,
    });
  }

  return resolved.sort((a, b) => a.priority_order - b.priority_order);
}

// ── Execution with Timeout ────────────────────────────────────────────────

/** Run a function with a timeout. Rejects with 'timeout' if exceeded. */
function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fn().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Log plugin execution result */
async function logExecution(
  interactionId: string,
  binding: ResolvedBinding,
  inputSnapshot: unknown,
  outputSnapshot: unknown,
  durationMs: number,
  status: 'success' | 'timeout' | 'error' | 'fallback',
  errorMessage?: string,
) {
  await db.insert(ixPluginExecutionLogs).values({
    interaction_id: interactionId,
    plugin_id: binding.plugin_id,
    binding_id: binding.binding_id,
    slot: binding.slot,
    shadow: binding.shadow_mode,
    input_snapshot_json: JSON.stringify(inputSnapshot),
    output_snapshot_json: outputSnapshot ? JSON.stringify(outputSnapshot) : null,
    duration_ms: durationMs,
    status,
    error_message: errorMessage ?? null,
  });
}

// ── Slot Executors ────────────────────────────────────────────────────────

/**
 * Execute candidate_scorer plugins for a queue.
 * Returns scored candidates. Falls back to core_least_loaded if no plugins or all fail.
 */
export async function executeCandidateScorers(
  queueCode: string,
  candidates: AgentCandidate[],
  interaction: InteractionSnapshot,
): Promise<{ scored: ScoredCandidate[]; shadow_results: Array<{ plugin: string; scored: ScoredCandidate[] }> }> {
  const bindings = await resolveBindings(queueCode, 'candidate_scorer');
  const shadowResults: Array<{ plugin: string; scored: ScoredCandidate[] }> = [];
  let primaryResult: ScoredCandidate[] | null = null;

  for (const binding of bindings) {
    const handler = candidateScorerHandlers.get(binding.handler_module);
    if (!handler) continue;

    const start = Date.now();
    try {
      const result = await withTimeout(
        () => handler(candidates, interaction, binding.config),
        binding.timeout_ms,
      );
      const duration = Date.now() - start;

      await logExecution(interaction.interaction_id, binding, { candidates_count: candidates.length }, result, duration, 'success');

      if (binding.shadow_mode) {
        shadowResults.push({ plugin: binding.plugin_name, scored: result });
      } else if (!primaryResult) {
        primaryResult = result;
      }
    } catch (err) {
      const duration = Date.now() - start;
      const isTimeout = err instanceof Error && err.message === 'timeout';
      const status = isTimeout ? 'timeout' : 'error';

      await logExecution(interaction.interaction_id, binding, { candidates_count: candidates.length }, null, duration, status, String(err));

      if (!binding.shadow_mode && binding.fallback_behavior === 'use_core') {
        // Fall through to core default
        await logExecution(interaction.interaction_id, binding, null, null, 0, 'fallback', `Falling back to core after ${status}`);
      }
    }
  }

  // Fallback to core least-loaded (or inline fallback if handler not yet registered)
  if (!primaryResult) {
    const coreFn = candidateScorerHandlers.get('core_least_loaded');
    if (coreFn) {
      primaryResult = await coreFn(candidates, interaction, {});
    } else {
      primaryResult = candidates.map((c) => ({
        ...c,
        score: c.available_slots,
        reason: `available_slots=${c.available_slots} (inline fallback)`,
      })).sort((a, b) => b.score - a.score);
    }
  }

  return { scored: primaryResult, shadow_results: shadowResults };
}

/**
 * Execute queue_selector plugins. Returns selected queue_code + shadow results.
 * Falls back to interaction's existing queue_code if no plugins match.
 */
export async function executeQueueSelector(
  currentQueueCode: string,
  interaction: InteractionSnapshot,
): Promise<{ result: QueueSelectorResult; shadow_results: Array<{ plugin: string; result: QueueSelectorResult }> }> {
  const bindings = await resolveBindings(currentQueueCode, 'queue_selector');
  const shadowResults: Array<{ plugin: string; result: QueueSelectorResult }> = [];
  let primaryResult: QueueSelectorResult | null = null;

  for (const binding of bindings) {
    const handler = queueSelectorHandlers.get(binding.handler_module);
    if (!handler) continue;

    const start = Date.now();
    try {
      const result = await withTimeout(
        () => handler(interaction, binding.config),
        binding.timeout_ms,
      );
      await logExecution(interaction.interaction_id, binding, interaction, result, Date.now() - start, 'success');

      if (binding.shadow_mode) {
        shadowResults.push({ plugin: binding.plugin_name, result });
      } else if (!primaryResult) {
        primaryResult = result;
      }
    } catch (err) {
      await logExecution(interaction.interaction_id, binding, interaction, null, Date.now() - start, err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error', String(err));
    }
  }

  return {
    result: primaryResult ?? { queue_code: currentQueueCode, reason: 'No queue selector plugin, using default' },
    shadow_results: shadowResults,
  };
}

/**
 * Execute offer_strategy plugins. Returns routing mode.
 * Falls back to direct_assign.
 */
export async function executeOfferStrategy(
  queueCode: string,
  interaction: InteractionSnapshot,
  candidates: AgentCandidate[],
): Promise<OfferStrategyResult> {
  const bindings = await resolveBindings(queueCode, 'offer_strategy');

  for (const binding of bindings) {
    if (binding.shadow_mode) continue;

    const handler = offerStrategyHandlers.get(binding.handler_module);
    if (!handler) continue;

    const start = Date.now();
    try {
      const result = await withTimeout(
        () => handler(interaction, candidates, binding.config),
        binding.timeout_ms,
      );
      await logExecution(interaction.interaction_id, binding, { interaction, candidates_count: candidates.length }, result, Date.now() - start, 'success');
      return result;
    } catch (err) {
      await logExecution(interaction.interaction_id, binding, null, null, Date.now() - start, err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error', String(err));
    }
  }

  return { routing_mode: 'direct_assign', reason: 'No offer strategy plugin, using default' };
}

/**
 * Execute overflow_policy plugins. Returns overflow action + shadow results.
 * Falls back to 'wait'.
 */
export async function executeOverflowPolicy(
  queueCode: string,
  interaction: InteractionSnapshot,
): Promise<{ result: OverflowPolicyResult; shadow_results: Array<{ plugin: string; result: OverflowPolicyResult }> }> {
  const bindings = await resolveBindings(queueCode, 'overflow_policy');
  const shadowResults: Array<{ plugin: string; result: OverflowPolicyResult }> = [];
  let primaryResult: OverflowPolicyResult | null = null;

  for (const binding of bindings) {
    const handler = overflowPolicyHandlers.get(binding.handler_module);
    if (!handler) continue;

    const start = Date.now();
    try {
      const result = await withTimeout(
        () => handler(interaction, binding.config),
        binding.timeout_ms,
      );
      await logExecution(interaction.interaction_id, binding, interaction, result, Date.now() - start, 'success');

      if (binding.shadow_mode) {
        shadowResults.push({ plugin: binding.plugin_name, result });
      } else if (!primaryResult) {
        primaryResult = result;
      }
    } catch (err) {
      await logExecution(interaction.interaction_id, binding, null, null, Date.now() - start, err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error', String(err));
    }
  }

  return {
    result: primaryResult ?? { action: 'wait', reason: 'No overflow policy plugin, using default wait' },
    shadow_results: shadowResults,
  };
}
