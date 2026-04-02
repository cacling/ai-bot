/**
 * plugin-runtime.test.ts — Unit tests for plugin execution runtime.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { type AgentCandidate, type InteractionSnapshot } from '../../src/services/plugin-runtime';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('plugin-runtime');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const {
  registerCandidateScorer,
  registerQueueSelector,
  executeCandidateScorers,
  executeQueueSelector,
  executeOfferStrategy,
  executeOverflowPolicy,
  resolveBindings,
} = await import('../../src/services/plugin-runtime');
const { db, ixPluginCatalog, ixPluginBindings, ixPluginExecutionLogs, eq } = await import('../../src/db');

// ── Fixtures ──────────────────────────────────────────────────────────────

const CANDIDATES: AgentCandidate[] = [
  { agent_id: 'a1', presence_status: 'online', active_chat_count: 2, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 1 },
  { agent_id: 'a2', presence_status: 'online', active_chat_count: 0, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 3 },
  { agent_id: 'a3', presence_status: 'online', active_chat_count: 1, active_voice_count: 0, max_chat_slots: 3, max_voice_slots: 1, available_slots: 2 },
];

const SNAPSHOT: InteractionSnapshot = {
  interaction_id: 'ix-test-001',
  tenant_id: 'default',
  conversation_id: 'conv-test-001',
  work_model: 'live_chat',
  queue_code: 'default_chat',
  priority: 50,
  customer_party_id: 'party-001',
  handoff_summary: 'Test interaction',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('plugin-runtime', () => {
  describe('built-in core_least_loaded scorer', () => {
    test('sorts candidates by available_slots desc', async () => {
      const { scored } = await executeCandidateScorers('nonexistent_queue', CANDIDATES, SNAPSHOT);
      expect(scored[0].agent_id).toBe('a2'); // 3 available
      expect(scored[1].agent_id).toBe('a3'); // 2 available
      expect(scored[2].agent_id).toBe('a1'); // 1 available
    });

    test('all candidates have score and reason', async () => {
      const { scored } = await executeCandidateScorers('nonexistent_queue', CANDIDATES, SNAPSHOT);
      for (const c of scored) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.reason).toBeDefined();
      }
    });
  });

  describe('built-in vip_priority_scorer', () => {
    test('registers and can be resolved', async () => {
      // Seed a plugin + binding
      const pluginId = 'test-vip-scorer';
      await db.insert(ixPluginCatalog).values({
        plugin_id: pluginId,
        name: 'vip_priority_scorer',
        display_name_zh: 'VIP评分',
        display_name_en: 'VIP Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'vip_priority_scorer',
        default_config_json: JSON.stringify({ vip_boost: 10 }),
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-vip',
        queue_code: 'test_vip_queue',
        plugin_id: pluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      const bindings = await resolveBindings('test_vip_queue', 'candidate_scorer');
      expect(bindings.length).toBe(1);
      expect(bindings[0].handler_module).toBe('vip_priority_scorer');
    });

    test('boosts score for VIP interactions', async () => {
      const vipSnapshot = { ...SNAPSHOT, priority: 10 }; // VIP = priority <= 20
      const { scored } = await executeCandidateScorers('test_vip_queue', CANDIDATES, vipSnapshot);
      // VIP boost of 10 should be added to all scores
      for (const c of scored) {
        expect(c.reason).toContain('VIP');
      }
    });

    test('no boost for standard interactions', async () => {
      const { scored } = await executeCandidateScorers('test_vip_queue', CANDIDATES, SNAPSHOT);
      for (const c of scored) {
        expect(c.reason).toBe('standard');
      }
    });
  });

  describe('shadow mode', () => {
    test('shadow binding runs but does not affect primary result', async () => {
      // Register a shadow scorer that inverts the order
      registerCandidateScorer('test_invert_scorer', async (candidates) => {
        return candidates.map(c => ({ ...c, score: -c.available_slots, reason: 'inverted' }))
          .sort((a, b) => b.score - a.score);
      });

      const shadowPluginId = 'test-shadow-plugin';
      await db.insert(ixPluginCatalog).values({
        plugin_id: shadowPluginId,
        name: 'test_invert_scorer',
        display_name_zh: '反转评分',
        display_name_en: 'Invert Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'test_invert_scorer',
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-shadow',
        queue_code: 'test_shadow_queue',
        plugin_id: shadowPluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: true,
      });

      const { scored, shadow_results } = await executeCandidateScorers('test_shadow_queue', CANDIDATES, SNAPSHOT);

      // Primary should be core_least_loaded (fallback since shadow is not primary)
      expect(scored[0].agent_id).toBe('a2');

      // Shadow result should exist
      expect(shadow_results.length).toBe(1);
      expect(shadow_results[0].plugin).toBe('test_invert_scorer');
    });
  });

  describe('timeout and fallback', () => {
    test('slow plugin times out and falls back to core', async () => {
      registerCandidateScorer('test_slow_scorer', async () => {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Way longer than timeout
        return [];
      });

      const slowPluginId = 'test-slow-plugin';
      await db.insert(ixPluginCatalog).values({
        plugin_id: slowPluginId,
        name: 'test_slow_scorer',
        display_name_zh: '慢评分',
        display_name_en: 'Slow Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'test_slow_scorer',
        timeout_ms: 100, // Very short timeout
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-slow',
        queue_code: 'test_slow_queue',
        plugin_id: slowPluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      const { scored } = await executeCandidateScorers('test_slow_queue', CANDIDATES, SNAPSHOT);

      // Should fall back to core_least_loaded
      expect(scored[0].agent_id).toBe('a2');
      expect(scored.length).toBe(3);

      // Execution log should record timeout
      const logs = await db.select().from(ixPluginExecutionLogs)
        .where(eq(ixPluginExecutionLogs.plugin_id, slowPluginId))
        .all();
      expect(logs.some(l => l.status === 'timeout')).toBe(true);
    });

    test('erroring plugin falls back to core', async () => {
      registerCandidateScorer('test_error_scorer', async () => {
        throw new Error('plugin crashed');
      });

      const errorPluginId = 'test-error-plugin';
      await db.insert(ixPluginCatalog).values({
        plugin_id: errorPluginId,
        name: 'test_error_scorer',
        display_name_zh: '错误评分',
        display_name_en: 'Error Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'test_error_scorer',
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-error',
        queue_code: 'test_error_queue',
        plugin_id: errorPluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      const { scored } = await executeCandidateScorers('test_error_queue', CANDIDATES, SNAPSHOT);
      expect(scored[0].agent_id).toBe('a2'); // Core fallback
    });
  });

  describe('queue selector', () => {
    test('no plugin → returns current queue_code', async () => {
      const result = await executeQueueSelector('default_chat', SNAPSHOT);
      expect(result.queue_code).toBe('default_chat');
    });

    test('skill_based_selector routes by work_model', async () => {
      const selectorId = 'test-skill-selector';
      await db.insert(ixPluginCatalog).values({
        plugin_id: selectorId,
        name: 'skill_based_selector',
        display_name_zh: '技能选择器',
        display_name_en: 'Skill Selector',
        plugin_type: 'queue_selector',
        handler_module: 'skill_based_selector',
        timeout_ms: 2000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-selector',
        queue_code: 'test_selector_queue',
        plugin_id: selectorId,
        slot: 'queue_selector',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      const voiceSnapshot = { ...SNAPSHOT, work_model: 'live_voice' };
      const result = await executeQueueSelector('test_selector_queue', voiceSnapshot);
      expect(result.queue_code).toBe('voice_queue');
    });
  });

  describe('offer strategy', () => {
    test('no plugin → returns direct_assign', async () => {
      const result = await executeOfferStrategy('nonexistent_queue', SNAPSHOT, CANDIDATES);
      expect(result.routing_mode).toBe('direct_assign');
    });
  });

  describe('overflow policy', () => {
    test('no plugin → returns wait', async () => {
      const result = await executeOverflowPolicy('nonexistent_queue', SNAPSHOT);
      expect(result.action).toBe('wait');
    });
  });

  describe('binding resolution', () => {
    test('disabled bindings are excluded', async () => {
      const pluginId = 'test-disabled-plugin';
      await db.insert(ixPluginCatalog).values({
        plugin_id: pluginId,
        name: 'disabled_scorer',
        display_name_zh: '禁用评分',
        display_name_en: 'Disabled Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'core_least_loaded',
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-disabled',
        queue_code: 'test_disabled_queue',
        plugin_id: pluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: false,
        shadow_mode: false,
      });

      const bindings = await resolveBindings('test_disabled_queue', 'candidate_scorer');
      expect(bindings.length).toBe(0);
    });

    test('disabled plugins are excluded', async () => {
      const pluginId = 'test-inactive-plugin';
      await db.insert(ixPluginCatalog).values({
        plugin_id: pluginId,
        name: 'inactive_scorer',
        display_name_zh: '停用评分',
        display_name_en: 'Inactive Scorer',
        plugin_type: 'candidate_scorer',
        handler_module: 'core_least_loaded',
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
        status: 'disabled',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-inactive',
        queue_code: 'test_inactive_queue',
        plugin_id: pluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
      });

      const bindings = await resolveBindings('test_inactive_queue', 'candidate_scorer');
      expect(bindings.length).toBe(0);
    });

    test('config override merges with default config', async () => {
      const pluginId = 'test-config-merge';
      await db.insert(ixPluginCatalog).values({
        plugin_id: pluginId,
        name: 'config_merge_scorer',
        display_name_zh: '配置合并',
        display_name_en: 'Config Merge',
        plugin_type: 'candidate_scorer',
        handler_module: 'core_least_loaded',
        default_config_json: JSON.stringify({ a: 1, b: 2 }),
        timeout_ms: 3000,
        fallback_behavior: 'use_core',
      });
      await db.insert(ixPluginBindings).values({
        binding_id: 'test-binding-config',
        queue_code: 'test_config_queue',
        plugin_id: pluginId,
        slot: 'candidate_scorer',
        priority_order: 0,
        enabled: true,
        shadow_mode: false,
        config_override_json: JSON.stringify({ b: 20, c: 30 }),
      });

      const bindings = await resolveBindings('test_config_queue', 'candidate_scorer');
      expect(bindings.length).toBe(1);
      expect(bindings[0].config).toEqual({ a: 1, b: 20, c: 30 });
    });
  });
});
