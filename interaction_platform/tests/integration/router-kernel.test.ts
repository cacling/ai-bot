/**
 * router-kernel.test.ts — Integration tests for the routing pipeline + plugins.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('router-kernel');

beforeAll(async () => {
  await testDb.pushSchema();
  const { loadAllPlugins } = await import('../../src/plugins/loader');
  await loadAllPlugins();
});
afterAll(() => testDb.cleanup());

const { routeInteraction } = await import('../../src/services/router-kernel');
const { db, ixConversations, ixInteractions, ixInteractionEvents, ixAgentPresence, ixAssignments, ixPluginCatalog, ixPluginBindings, ixPluginExecutionLogs, eq } = await import('../../src/db');

// ── Seed Helpers ──────────────────────────────────────────────────────────

async function seedConversation(convId: string, tenant = 'default') {
  await db.insert(ixConversations).values({
    conversation_id: convId,
    customer_party_id: 'party-rk-test',
    channel: 'webchat',
    status: 'active',
    tenant_id: tenant,
  });
}

async function seedInteraction(id: string, convId: string, opts?: { workModel?: string; queueCode?: string; priority?: number; tenant?: string }) {
  await db.insert(ixInteractions).values({
    interaction_id: id,
    conversation_id: convId,
    work_model: opts?.workModel ?? 'live_chat',
    source_object_type: 'conversation',
    source_object_id: convId,
    queue_code: opts?.queueCode ?? 'default_chat',
    state: 'created',
    priority: opts?.priority ?? 50,
    tenant_id: opts?.tenant ?? 'default',
  });
}

async function seedAgent(agentId: string, opts?: { chatCount?: number; voiceCount?: number; status?: string; tenant?: string }) {
  await db.insert(ixAgentPresence).values({
    agent_id: agentId,
    presence_status: opts?.status ?? 'online',
    max_chat_slots: 3,
    max_voice_slots: 1,
    active_chat_count: opts?.chatCount ?? 0,
    active_voice_count: opts?.voiceCount ?? 0,
    tenant_id: opts?.tenant ?? 'default',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('router-kernel', () => {
  describe('basic routing (no plugins)', () => {
    test('routes to least-loaded agent', async () => {
      await seedConversation('rk-conv-001');
      await seedAgent('rk-agent-1', { chatCount: 2 });
      await seedAgent('rk-agent-2', { chatCount: 0 });
      await seedInteraction('rk-ix-001', 'rk-conv-001');

      const result = await routeInteraction('rk-ix-001');

      expect(result.success).toBe(true);
      expect(result.assigned_agent_id).toBe('rk-agent-2'); // Most available
      expect(result.assignment_id).toBeDefined();
    });

    test('queues when no agents available', async () => {
      const t = 'rk-noagent';
      await seedConversation('rk-conv-002', t);
      // All agents are at max capacity
      await seedAgent('rk-agent-3', { chatCount: 3, tenant: t }); // maxed out

      await seedInteraction('rk-ix-002', 'rk-conv-002', { tenant: t });

      const result = await routeInteraction('rk-ix-002');

      expect(result.success).toBe(true);
      expect(result.assigned_agent_id).toBeUndefined(); // queued

      const ix = await db.query.ixInteractions.findFirst({
        where: eq(ixInteractions.interaction_id, 'rk-ix-002'),
      });
      expect(ix?.state).toBe('queued');
    });

    test('rejects routing for non-routable state', async () => {
      // Create an interaction that's already assigned
      await seedConversation('rk-conv-003');
      await db.insert(ixInteractions).values({
        interaction_id: 'rk-ix-003',
        conversation_id: 'rk-conv-003',
        work_model: 'live_chat',
        source_object_type: 'conversation',
        source_object_id: 'rk-conv-003',
        state: 'active', // Not created or queued
        priority: 50,
      });

      const result = await routeInteraction('rk-ix-003');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot route');
    });

    test('non-existent interaction returns error', async () => {
      const result = await routeInteraction('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('voice exclusivity', () => {
    test('voice does not assign to agent with active chat', async () => {
      const t = 'rk-voice-1';
      await seedConversation('rk-conv-voice-1', t);
      await seedAgent('rk-agent-voice-1', { chatCount: 1, tenant: t }); // has active chat
      await seedInteraction('rk-ix-voice-1', 'rk-conv-voice-1', { workModel: 'live_voice', tenant: t });

      const result = await routeInteraction('rk-ix-voice-1');
      expect(result.assigned_agent_id).toBeUndefined(); // queued, agent busy with chat
    });

    test('chat does not assign to agent with active voice', async () => {
      const t = 'rk-voice-2';
      await seedConversation('rk-conv-voice-2', t);
      await seedAgent('rk-agent-voice-2', { voiceCount: 1, tenant: t });
      await seedInteraction('rk-ix-voice-2', 'rk-conv-voice-2', { workModel: 'live_chat', tenant: t });

      const result = await routeInteraction('rk-ix-voice-2');
      expect(result.assigned_agent_id).toBeUndefined(); // queued, agent on voice
    });
  });

  describe('workload tracking', () => {
    test('agent workload increments after assignment', async () => {
      await seedConversation('rk-conv-wl-1');
      await seedAgent('rk-agent-wl-1', { chatCount: 0 });
      await seedInteraction('rk-ix-wl-1', 'rk-conv-wl-1');

      await routeInteraction('rk-ix-wl-1');

      const agent = await db.query.ixAgentPresence.findFirst({
        where: eq(ixAgentPresence.agent_id, 'rk-agent-wl-1'),
      });
      expect(agent?.active_chat_count).toBe(1);
    });
  });

  describe('event recording', () => {
    test('assigned event includes agent_id and assignment_id', async () => {
      await seedConversation('rk-conv-evt-1');
      await seedAgent('rk-agent-evt-1', { chatCount: 0 });
      await seedInteraction('rk-ix-evt-1', 'rk-conv-evt-1');

      const result = await routeInteraction('rk-ix-evt-1');

      const events = await db.select().from(ixInteractionEvents)
        .where(eq(ixInteractionEvents.interaction_id, 'rk-ix-evt-1'))
        .all();

      const assignedEvt = events.find(e => e.event_type === 'assigned');
      expect(assignedEvt).toBeDefined();
      const payload = JSON.parse(assignedEvt!.payload_json!);
      expect(payload.agent_id).toBe(result.assigned_agent_id);
      expect(payload.assignment_id).toBe(result.assignment_id);
    });

    test('queued event recorded when no agents available', async () => {
      await seedConversation('rk-conv-evt-2');
      // No online agents for this interaction
      await seedInteraction('rk-ix-evt-2', 'rk-conv-evt-2');

      // Route — all existing agents are either maxed out or offline by now
      await seedAgent('rk-agent-evt-2-offline', { status: 'offline' });
      // We need an interaction in a queue with no available agents
      await db.insert(ixInteractions).values({
        interaction_id: 'rk-ix-evt-noagent',
        conversation_id: 'rk-conv-evt-2',
        work_model: 'live_chat',
        source_object_type: 'conversation',
        source_object_id: 'rk-conv-evt-2',
        state: 'created',
        priority: 50,
        tenant_id: 'isolated_tenant', // isolate to avoid picking up other agents
      });

      const result = await routeInteraction('rk-ix-evt-noagent');
      expect(result.assigned_agent_id).toBeUndefined();

      const events = await db.select().from(ixInteractionEvents)
        .where(eq(ixInteractionEvents.interaction_id, 'rk-ix-evt-noagent'))
        .all();
      expect(events.some(e => e.event_type === 'queued')).toBe(true);
    });
  });

  describe('with plugin bindings', () => {
    test('plugin scorer affects assignment order', async () => {
      // Register a plugin that reverses default scoring
      const { registerCandidateScorer } = await import('../../src/services/plugin-runtime');
      registerCandidateScorer('test_reverse_scorer', async (candidates) => {
        return candidates.map(c => ({
          ...c,
          score: -c.available_slots, // Prefer busiest agent
          reason: 'reversed',
        })).sort((a, b) => b.score - a.score);
      });

      await db.insert(ixPluginCatalog).values({
        plugin_id: 'rk-reverse-plugin',
        name: 'test_reverse_scorer',
        display_name_zh: '反转',
        display_name_en: 'Reverse',
        plugin_type: 'candidate_scorer',
        handler_module: 'test_reverse_scorer',
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'rk-binding-reverse',
        queue_code: 'rk_test_queue',
        plugin_id: 'rk-reverse-plugin',
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      // Seed agents + interaction on the test queue (isolated tenant)
      const t = 'rk-plugin';
      await seedConversation('rk-conv-plugin-1', t);
      await seedAgent('rk-agent-free', { chatCount: 0, tenant: t });
      await seedAgent('rk-agent-busy', { chatCount: 2, tenant: t });
      await seedInteraction('rk-ix-plugin-1', 'rk-conv-plugin-1', { queueCode: 'rk_test_queue', tenant: t });

      const result = await routeInteraction('rk-ix-plugin-1');
      expect(result.success).toBe(true);
      // Reversed scorer prefers busiest agent
      expect(result.assigned_agent_id).toBe('rk-agent-busy');

      // Execution log should exist
      const logs = await db.select().from(ixPluginExecutionLogs)
        .where(eq(ixPluginExecutionLogs.interaction_id, 'rk-ix-plugin-1'))
        .all();
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
