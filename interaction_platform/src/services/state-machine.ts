/**
 * state-machine.ts — Interaction 状态机（纯函数）
 *
 * 状态图:
 *   created → queued, abandoned, assigned (direct_assign)
 *   queued  → offered, assigned, abandoned, overflow
 *   offered → assigned (accepted), queued (declined/expired)
 *   assigned → active
 *   active  → wrapping_up, transferred, abandoned
 *   transferred → queued
 *   wrapping_up → closed
 *
 * 核心原则: 状态机由 core 持有，不可插件化。
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type InteractionState =
  | 'created'
  | 'queued'
  | 'offered'
  | 'assigned'
  | 'active'
  | 'wrapping_up'
  | 'transferred'
  | 'closed'
  | 'abandoned';

export type TransitionEvent =
  | { type: 'enqueue' }
  | { type: 'direct_assign'; agent_id: string }
  | { type: 'offer'; agent_id: string; offer_id: string; expires_at?: Date }
  | { type: 'accept_offer'; agent_id: string; offer_id: string }
  | { type: 'decline_offer'; offer_id: string }
  | { type: 'offer_expired'; offer_id: string }
  | { type: 'activate' }
  | { type: 'transfer'; target_queue?: string }
  | { type: 'wrap_up'; code?: string; note?: string }
  | { type: 'close' }
  | { type: 'abandon'; reason?: string }
  | { type: 'overflow'; target_queue: string };

export type SideEffectType =
  | 'emit_event'
  | 'create_offer'
  | 'release_assignment'
  | 'create_assignment'
  | 'start_sla_timer'
  | 'stop_sla_timer'
  | 'notify_inbox'
  | 'update_agent_workload';

export interface SideEffect {
  type: SideEffectType;
  payload: Record<string, unknown>;
}

export interface TransitionResult {
  newState: InteractionState;
  sideEffects: SideEffect[];
}

export interface TransitionError {
  error: string;
}

// ── Transition table ───────────────────────────────────────────────────────

const TRANSITIONS: Record<InteractionState, (event: TransitionEvent) => TransitionResult | TransitionError> = {
  created(event) {
    switch (event.type) {
      case 'enqueue':
        return {
          newState: 'queued',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'queued' } },
            { type: 'start_sla_timer', payload: {} },
          ],
        };
      case 'direct_assign':
        return {
          newState: 'assigned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'assigned', agent_id: event.agent_id } },
            { type: 'create_assignment', payload: { agent_id: event.agent_id, type: 'primary' } },
            { type: 'update_agent_workload', payload: { agent_id: event.agent_id, delta: 1 } },
            { type: 'notify_inbox', payload: { agent_id: event.agent_id } },
            { type: 'start_sla_timer', payload: {} },
          ],
        };
      case 'abandon':
        return {
          newState: 'abandoned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'abandoned', reason: event.reason } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'created'` };
    }
  },

  queued(event) {
    switch (event.type) {
      case 'offer':
        return {
          newState: 'offered',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'offered', agent_id: event.agent_id } },
            { type: 'create_offer', payload: { agent_id: event.agent_id, offer_id: event.offer_id, expires_at: event.expires_at } },
            { type: 'notify_inbox', payload: { agent_id: event.agent_id } },
          ],
        };
      case 'direct_assign':
        return {
          newState: 'assigned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'assigned', agent_id: event.agent_id } },
            { type: 'create_assignment', payload: { agent_id: event.agent_id, type: 'primary' } },
            { type: 'update_agent_workload', payload: { agent_id: event.agent_id, delta: 1 } },
            { type: 'notify_inbox', payload: { agent_id: event.agent_id } },
          ],
        };
      case 'abandon':
        return {
          newState: 'abandoned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'abandoned', reason: event.reason } },
            { type: 'stop_sla_timer', payload: {} },
          ],
        };
      case 'overflow':
        return {
          newState: 'queued',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'overflow', target_queue: event.target_queue } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'queued'` };
    }
  },

  offered(event) {
    switch (event.type) {
      case 'accept_offer':
        return {
          newState: 'assigned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'offer_accepted', agent_id: event.agent_id, offer_id: event.offer_id } },
            { type: 'create_assignment', payload: { agent_id: event.agent_id, type: 'primary' } },
            { type: 'update_agent_workload', payload: { agent_id: event.agent_id, delta: 1 } },
            { type: 'notify_inbox', payload: { agent_id: event.agent_id } },
          ],
        };
      case 'decline_offer':
        return {
          newState: 'queued',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'offer_declined', offer_id: event.offer_id } },
          ],
        };
      case 'offer_expired':
        return {
          newState: 'queued',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'offer_expired', offer_id: event.offer_id } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'offered'` };
    }
  },

  assigned(event) {
    switch (event.type) {
      case 'activate':
        return {
          newState: 'active',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'active' } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'assigned'` };
    }
  },

  active(event) {
    switch (event.type) {
      case 'wrap_up':
        return {
          newState: 'wrapping_up',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'wrapping_up', code: event.code, note: event.note } },
            { type: 'stop_sla_timer', payload: {} },
          ],
        };
      case 'transfer':
        return {
          newState: 'transferred',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'transferred', target_queue: event.target_queue } },
            { type: 'release_assignment', payload: { reason: 'transferred' } },
            { type: 'update_agent_workload', payload: { delta: -1 } },
          ],
        };
      case 'abandon':
        return {
          newState: 'abandoned',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'abandoned', reason: event.reason } },
            { type: 'release_assignment', payload: { reason: 'abandoned' } },
            { type: 'update_agent_workload', payload: { delta: -1 } },
            { type: 'stop_sla_timer', payload: {} },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'active'` };
    }
  },

  transferred(event) {
    switch (event.type) {
      case 'enqueue':
        return {
          newState: 'queued',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'requeued' } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'transferred'` };
    }
  },

  wrapping_up(event) {
    switch (event.type) {
      case 'close':
        return {
          newState: 'closed',
          sideEffects: [
            { type: 'emit_event', payload: { event_type: 'closed' } },
            { type: 'release_assignment', payload: { reason: 'completed' } },
            { type: 'update_agent_workload', payload: { delta: -1 } },
          ],
        };
      default:
        return { error: `Invalid event '${event.type}' in state 'wrapping_up'` };
    }
  },

  closed() {
    return { error: 'Interaction is already closed; no further transitions allowed' };
  },

  abandoned() {
    return { error: 'Interaction is already abandoned; no further transitions allowed' };
  },
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Pure state machine transition function.
 * Returns new state + side effects, or an error message.
 */
export function transition(
  currentState: InteractionState,
  event: TransitionEvent,
): TransitionResult | TransitionError {
  const handler = TRANSITIONS[currentState];
  if (!handler) return { error: `Unknown state '${currentState}'` };
  return handler(event);
}

/** Type guard: check if a transition result is an error. */
export function isTransitionError(result: TransitionResult | TransitionError): result is TransitionError {
  return 'error' in result;
}

/** All valid terminal states (no outbound transitions). */
export const TERMINAL_STATES: ReadonlySet<InteractionState> = new Set(['closed', 'abandoned']);

/** All valid states. */
export const ALL_STATES: readonly InteractionState[] = [
  'created', 'queued', 'offered', 'assigned', 'active',
  'wrapping_up', 'transferred', 'closed', 'abandoned',
];
