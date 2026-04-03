/**
 * vip-priority-scorer.test.ts — Tests for enhanced VIP priority scorer plugin.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { type AgentCandidate, type InteractionSnapshot } from '../../src/services/plugin-runtime';
import { handler } from '../../src/plugins/vip-priority-scorer/handler';

// ── Fixtures ──────────────────────────────────────────────────────────────

const makeCandidates = (): AgentCandidate[] => [
  { agent_id: 'a1', presence_status: 'online', active_chat_count: 0, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 3, queue_codes: ['vip_chat'] },
  { agent_id: 'a2', presence_status: 'online', active_chat_count: 2, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 1, queue_codes: ['vip_chat'] },
  { agent_id: 'a3', presence_status: 'online', active_chat_count: 1, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 2, queue_codes: ['vip_chat'] },
];

const makeSnapshot = (overrides: Partial<InteractionSnapshot> = {}): InteractionSnapshot => ({
  interaction_id: 'ix-vip-test',
  tenant_id: 'default',
  conversation_id: 'conv-vip-test',
  work_model: 'live_chat',
  queue_code: 'vip_chat',
  priority: 50,
  customer_party_id: 'party-001',
  handoff_summary: null,
  ...overrides,
});

const DEFAULT_CONFIG = {
  vip_boost: 20,
  vip_threshold: 20,
  wait_seconds_weight: 0.08,
  max_wait_cap: 300,
  load_penalty: 5,
  queue_match_bonus: 0,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('vip-priority-scorer', () => {
  test('VIP interaction gets vip_boost', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 10 }), DEFAULT_CONFIG);
    // a1: base=3 + vip=20 - load=0 = 23
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(23);
    expect(a1.reason).toContain('vip_boost');
  });

  test('non-VIP interaction gets no vip_boost', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 50 }), DEFAULT_CONFIG);
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(3); // base=3, no boost, no load penalty
    expect(a1.reason).not.toContain('vip_boost');
  });

  test('vip_threshold boundary: exactly at threshold is VIP', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 20 }), DEFAULT_CONFIG);
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(23); // 3 + 20
  });

  test('vip_threshold boundary: one above threshold is not VIP', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 21 }), DEFAULT_CONFIG);
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(3);
  });

  test('load_penalty reduces score for busy agents', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 50 }), DEFAULT_CONFIG);
    // a2: base=1 - load_penalty=5*2 = -9
    const a2 = scored.find((s) => s.agent_id === 'a2')!;
    expect(a2.score).toBe(-9);
    expect(a2.reason).toContain('load_penalty');
  });

  test('wait_seconds_weight adds score based on wait time', async () => {
    const scored = await handler(
      makeCandidates(),
      makeSnapshot({ priority: 50, wait_seconds: 100 }),
      DEFAULT_CONFIG,
    );
    // a1: base=3 + wait=0.08*100=8 - load=0 = 11
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(11);
    expect(a1.reason).toContain('wait_bonus');
  });

  test('wait_seconds capped at max_wait_cap', async () => {
    const scored = await handler(
      makeCandidates(),
      makeSnapshot({ priority: 50, wait_seconds: 9999 }),
      DEFAULT_CONFIG,
    );
    // a1: base=3 + wait=0.08*300(cap)=24 - load=0 = 27
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(27);
  });

  test('wait_seconds undefined defaults to 0', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot(), DEFAULT_CONFIG);
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    expect(a1.score).toBe(3); // no wait bonus
  });

  test('candidates sorted by score descending', async () => {
    const scored = await handler(makeCandidates(), makeSnapshot({ priority: 10 }), DEFAULT_CONFIG);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  test('queue_match_bonus adds score when queue matches', async () => {
    const config = { ...DEFAULT_CONFIG, queue_match_bonus: 10 };
    const candidates = makeCandidates();
    candidates[0].queue_codes = ['vip_chat']; // matches
    candidates[1].queue_codes = ['default_chat']; // no match

    const scored = await handler(candidates, makeSnapshot({ priority: 50 }), config);
    const a1 = scored.find((s) => s.agent_id === 'a1')!;
    const a2 = scored.find((s) => s.agent_id === 'a2')!;
    expect(a1.reason).toContain('queue_match');
    expect(a2.reason).not.toContain('queue_match');
  });
});
