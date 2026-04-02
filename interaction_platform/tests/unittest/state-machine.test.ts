import { describe, test, expect } from 'bun:test';
import {
  transition,
  isTransitionError,
  TERMINAL_STATES,
  ALL_STATES,
  type InteractionState,
  type TransitionEvent,
} from '../../src/services/state-machine';

// ── Helpers ──────────────────────────────────────────────────────────────────

function expectSuccess(state: InteractionState, event: TransitionEvent, expectedState: InteractionState) {
  const result = transition(state, event);
  expect(isTransitionError(result)).toBe(false);
  if (!isTransitionError(result)) {
    expect(result.newState).toBe(expectedState);
  }
  return result;
}

function expectError(state: InteractionState, event: TransitionEvent) {
  const result = transition(state, event);
  expect(isTransitionError(result)).toBe(true);
  return result;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('state-machine', () => {
  describe('created', () => {
    test('enqueue → queued', () => {
      const result = expectSuccess('created', { type: 'enqueue' }, 'queued');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'start_sla_timer')).toBe(true);
      }
    });

    test('direct_assign → assigned', () => {
      const result = expectSuccess('created', { type: 'direct_assign', agent_id: 'a1' }, 'assigned');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'create_assignment')).toBe(true);
        expect(result.sideEffects.some(e => e.type === 'update_agent_workload')).toBe(true);
        expect(result.sideEffects.some(e => e.type === 'notify_inbox')).toBe(true);
      }
    });

    test('abandon → abandoned', () => {
      expectSuccess('created', { type: 'abandon', reason: 'timeout' }, 'abandoned');
    });

    test('invalid event → error', () => {
      expectError('created', { type: 'activate' });
      expectError('created', { type: 'close' });
    });
  });

  describe('queued', () => {
    test('offer → offered', () => {
      expectSuccess('queued', { type: 'offer', agent_id: 'a1', offer_id: 'o1' }, 'offered');
    });

    test('direct_assign → assigned', () => {
      expectSuccess('queued', { type: 'direct_assign', agent_id: 'a1' }, 'assigned');
    });

    test('abandon → abandoned', () => {
      const result = expectSuccess('queued', { type: 'abandon' }, 'abandoned');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'stop_sla_timer')).toBe(true);
      }
    });

    test('overflow → queued (same state, different queue)', () => {
      expectSuccess('queued', { type: 'overflow', target_queue: 'vip_chat' }, 'queued');
    });

    test('invalid event → error', () => {
      expectError('queued', { type: 'activate' });
      expectError('queued', { type: 'close' });
    });
  });

  describe('offered', () => {
    test('accept_offer → assigned', () => {
      expectSuccess('offered', { type: 'accept_offer', agent_id: 'a1', offer_id: 'o1' }, 'assigned');
    });

    test('decline_offer → queued', () => {
      expectSuccess('offered', { type: 'decline_offer', offer_id: 'o1' }, 'queued');
    });

    test('offer_expired → queued', () => {
      expectSuccess('offered', { type: 'offer_expired', offer_id: 'o1' }, 'queued');
    });

    test('invalid event → error', () => {
      expectError('offered', { type: 'activate' });
    });
  });

  describe('assigned', () => {
    test('activate → active', () => {
      expectSuccess('assigned', { type: 'activate' }, 'active');
    });

    test('invalid event → error', () => {
      expectError('assigned', { type: 'close' });
      expectError('assigned', { type: 'enqueue' });
    });
  });

  describe('active', () => {
    test('wrap_up → wrapping_up', () => {
      const result = expectSuccess('active', { type: 'wrap_up', code: 'resolved' }, 'wrapping_up');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'stop_sla_timer')).toBe(true);
      }
    });

    test('transfer → transferred', () => {
      const result = expectSuccess('active', { type: 'transfer', target_queue: 'vip_chat' }, 'transferred');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'release_assignment')).toBe(true);
        expect(result.sideEffects.some(e => e.type === 'update_agent_workload')).toBe(true);
      }
    });

    test('abandon → abandoned', () => {
      const result = expectSuccess('active', { type: 'abandon', reason: 'customer_left' }, 'abandoned');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'release_assignment')).toBe(true);
        expect(result.sideEffects.some(e => e.type === 'stop_sla_timer')).toBe(true);
      }
    });

    test('invalid event → error', () => {
      expectError('active', { type: 'enqueue' });
    });
  });

  describe('transferred', () => {
    test('enqueue → queued', () => {
      expectSuccess('transferred', { type: 'enqueue' }, 'queued');
    });

    test('invalid event → error', () => {
      expectError('transferred', { type: 'activate' });
    });
  });

  describe('wrapping_up', () => {
    test('close → closed', () => {
      const result = expectSuccess('wrapping_up', { type: 'close' }, 'closed');
      if (!isTransitionError(result)) {
        expect(result.sideEffects.some(e => e.type === 'release_assignment')).toBe(true);
        expect(result.sideEffects.some(e => e.type === 'update_agent_workload')).toBe(true);
      }
    });

    test('invalid event → error', () => {
      expectError('wrapping_up', { type: 'activate' });
    });
  });

  describe('terminal states', () => {
    test('closed rejects all events', () => {
      expectError('closed', { type: 'enqueue' });
      expectError('closed', { type: 'activate' });
      expectError('closed', { type: 'close' });
    });

    test('abandoned rejects all events', () => {
      expectError('abandoned', { type: 'enqueue' });
      expectError('abandoned', { type: 'activate' });
    });
  });

  describe('full lifecycle', () => {
    test('created → queued → offered → assigned → active → wrapping_up → closed', () => {
      let state: InteractionState = 'created';

      let r = transition(state, { type: 'enqueue' });
      expect(!isTransitionError(r) && r.newState).toBe('queued');
      state = 'queued';

      r = transition(state, { type: 'offer', agent_id: 'a1', offer_id: 'o1' });
      expect(!isTransitionError(r) && r.newState).toBe('offered');
      state = 'offered';

      r = transition(state, { type: 'accept_offer', agent_id: 'a1', offer_id: 'o1' });
      expect(!isTransitionError(r) && r.newState).toBe('assigned');
      state = 'assigned';

      r = transition(state, { type: 'activate' });
      expect(!isTransitionError(r) && r.newState).toBe('active');
      state = 'active';

      r = transition(state, { type: 'wrap_up', code: 'resolved' });
      expect(!isTransitionError(r) && r.newState).toBe('wrapping_up');
      state = 'wrapping_up';

      r = transition(state, { type: 'close' });
      expect(!isTransitionError(r) && r.newState).toBe('closed');
    });

    test('created → direct_assign → active → transfer → queued → assigned', () => {
      let state: InteractionState = 'created';

      let r = transition(state, { type: 'direct_assign', agent_id: 'a1' });
      expect(!isTransitionError(r) && r.newState).toBe('assigned');
      state = 'assigned';

      r = transition(state, { type: 'activate' });
      expect(!isTransitionError(r) && r.newState).toBe('active');
      state = 'active';

      r = transition(state, { type: 'transfer', target_queue: 'vip_chat' });
      expect(!isTransitionError(r) && r.newState).toBe('transferred');
      state = 'transferred';

      r = transition(state, { type: 'enqueue' });
      expect(!isTransitionError(r) && r.newState).toBe('queued');
      state = 'queued';

      r = transition(state, { type: 'direct_assign', agent_id: 'a2' });
      expect(!isTransitionError(r) && r.newState).toBe('assigned');
    });
  });

  describe('helpers', () => {
    test('TERMINAL_STATES contains closed and abandoned', () => {
      expect(TERMINAL_STATES.has('closed')).toBe(true);
      expect(TERMINAL_STATES.has('abandoned')).toBe(true);
      expect(TERMINAL_STATES.has('active')).toBe(false);
    });

    test('ALL_STATES has 9 states', () => {
      expect(ALL_STATES.length).toBe(9);
    });

    test('isTransitionError distinguishes results', () => {
      expect(isTransitionError({ error: 'bad' })).toBe(true);
      expect(isTransitionError({ newState: 'active', sideEffects: [] })).toBe(false);
    });
  });
});
