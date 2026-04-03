/**
 * replay-engine.test.ts — Unit tests for routing decision replay.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('replay');

beforeAll(async () => {
  await testDb.pushSchema();
  const { loadAllPlugins } = await import('../../src/plugins/loader');
  await loadAllPlugins();
});
afterAll(() => testDb.cleanup());

const { replayRouting, batchReplay } = await import('../../src/services/replay-engine');
const { db, ixConversations, ixInteractions, ixInteractionEvents, ixAgentPresence, ixAssignments, eq } = await import('../../src/db');

// ── Seed Helpers ──────────────────────────────────────────────────────────

async function seedAgent(agentId: string, chatCount = 0) {
  await db.insert(ixAgentPresence).values({
    agent_id: agentId,
    presence_status: 'online',
    max_chat_slots: 3,
    max_voice_slots: 1,
    active_chat_count: chatCount,
    active_voice_count: 0,
  }).catch(() => {});
}

async function seedInteraction(opts: {
  interactionId: string;
  conversationId: string;
  agentId?: string;
  state?: string;
  queueCode?: string;
}) {
  await db.insert(ixConversations).values({
    conversation_id: opts.conversationId,
    customer_party_id: 'party-replay-test',
    channel: 'webchat',
    status: 'active',
  }).catch(() => {});

  await db.insert(ixInteractions).values({
    interaction_id: opts.interactionId,
    conversation_id: opts.conversationId,
    work_model: 'live_chat',
    source_object_type: 'conversation',
    source_object_id: opts.conversationId,
    queue_code: opts.queueCode ?? 'default_chat',
    state: opts.state ?? 'assigned',
    assigned_agent_id: opts.agentId ?? null,
    priority: 50,
  });

  // Record assignment event if agent assigned
  if (opts.agentId) {
    await db.insert(ixInteractionEvents).values({
      interaction_id: opts.interactionId,
      event_type: 'assigned',
      actor_type: 'system',
      from_state: 'created',
      to_state: 'assigned',
      payload_json: JSON.stringify({ agent_id: opts.agentId }),
    });
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('replay-engine', () => {
  beforeAll(async () => {
    await seedAgent('replay-agent-1', 0);
    await seedAgent('replay-agent-2', 1);
  });

  test('replays a historical interaction', async () => {
    await seedInteraction({
      interactionId: 'replay-ix-001',
      conversationId: 'replay-conv-001',
      agentId: 'replay-agent-1',
      state: 'closed',
    });

    const result = await replayRouting({ interaction_id: 'replay-ix-001' });

    expect(result.interaction_id).toBe('replay-ix-001');
    expect(result.original.assigned_agent_id).toBe('replay-agent-1');
    expect(result.original.state).toBe('closed');
    expect(result.replayed.scored_candidates.length).toBeGreaterThan(0);
    expect(result.replayed.would_assign).toBeDefined();
  });

  test('detects divergence when replay differs from original', async () => {
    // Create an interaction originally assigned to agent-2, but now agent-1 has more capacity
    await seedInteraction({
      interactionId: 'replay-ix-002',
      conversationId: 'replay-conv-002',
      agentId: 'replay-agent-2', // originally assigned to less-available agent
      state: 'closed',
    });

    const result = await replayRouting({ interaction_id: 'replay-ix-002' });

    // With current state, replay would assign to agent-1 (more available)
    if (result.replayed.would_assign !== 'replay-agent-2') {
      expect(result.divergence).toBe(true);
      expect(result.divergence_summary).toBeDefined();
    }
  });

  test('override_queue_code applies during replay', async () => {
    await seedInteraction({
      interactionId: 'replay-ix-003',
      conversationId: 'replay-conv-003',
      agentId: 'replay-agent-1',
      state: 'closed',
      queueCode: 'default_chat',
    });

    const result = await replayRouting({
      interaction_id: 'replay-ix-003',
      override_queue_code: 'vip_chat',
    });

    expect(result.replayed.queue_selector_result).toBeDefined();
  });

  test('non-existent interaction throws', async () => {
    expect(replayRouting({ interaction_id: 'non-existent' })).rejects.toThrow();
  });

  describe('batch replay', () => {
    test('replays multiple interactions', async () => {
      const result = await batchReplay(['replay-ix-001', 'replay-ix-002', 'replay-ix-003']);
      expect(result.total).toBe(3);
      expect(result.results.length).toBe(3);
      expect(typeof result.divergence_count).toBe('number');
    });

    test('skips non-existent interactions gracefully', async () => {
      const result = await batchReplay(['replay-ix-001', 'non-existent-id']);
      expect(result.total).toBe(1);
    });

    test('empty input returns empty results', async () => {
      const result = await batchReplay([]);
      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
    });
  });
});
