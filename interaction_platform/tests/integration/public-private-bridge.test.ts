/**
 * public-private-bridge.test.ts — Integration tests for triage → bridge → interaction chain.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('bridge');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { triageItem } = await import('../../src/services/triage-engine');
const { bridgeToPrivate } = await import('../../src/services/public-private-bridge');
const { db, ixEngagementItems, ixConversations, ixInteractions, ixAgentPresence, eq } = await import('../../src/db');

// ── Helpers ──────────────────────────────────────────────────────────────

async function insertEngagementItem(body: string, opts?: { sentiment?: string; provider?: string; authorId?: string }) {
  const itemId = crypto.randomUUID();
  await db.insert(ixEngagementItems).values({
    item_id: itemId,
    provider: opts?.provider ?? 'mock',
    item_type: 'comment',
    author_name: 'Bridge Test User',
    author_id: opts?.authorId ?? `mock-bridge-${Math.random().toString(36).slice(2, 6)}`,
    body,
    sentiment: opts?.sentiment ?? null,
    status: 'new',
  });
  return itemId;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('public-private-bridge', () => {
  beforeAll(async () => {
    // Seed an online agent for routing
    await db.insert(ixAgentPresence).values({
      agent_id: 'bridge-agent-001',
      presence_status: 'online',
      max_chat_slots: 5,
      max_voice_slots: 1,
      active_chat_count: 0,
      active_voice_count: 0,
    });
  });

  describe('bridgeToPrivate', () => {
    test('creates conversation + interaction for engagement item', async () => {
      const itemId = await insertEngagementItem('我要投诉你们的服务');

      const result = await bridgeToPrivate(itemId);

      expect(result.success).toBe(true);
      expect(result.conversation_id).toBeDefined();
      expect(result.interaction_id).toBeDefined();

      // Verify conversation was created
      const conv = await db.query.ixConversations.findFirst({
        where: eq(ixConversations.conversation_id, result.conversation_id!),
      });
      expect(conv).toBeDefined();
      expect(conv!.channel).toContain('public');

      // Verify interaction was created
      const ix = await db.query.ixInteractions.findFirst({
        where: eq(ixInteractions.interaction_id, result.interaction_id!),
      });
      expect(ix).toBeDefined();
      expect(ix!.work_model).toBe('async_public_engagement');
    });

    test('updates engagement item status to actioned', async () => {
      const itemId = await insertEngagementItem('帮我查一下余额');
      await bridgeToPrivate(itemId);

      const item = await db.query.ixEngagementItems.findFirst({
        where: eq(ixEngagementItems.item_id, itemId),
      });
      expect(item?.status).toBe('actioned');
    });

    test('assigns to agent if available', async () => {
      const itemId = await insertEngagementItem('紧急投诉');
      const result = await bridgeToPrivate(itemId, { priority: 10 });

      expect(result.success).toBe(true);
      expect(result.assigned_agent_id).toBeDefined();
    });

    test('custom priority and queue_code are applied', async () => {
      const itemId = await insertEngagementItem('VIP客户紧急');
      const result = await bridgeToPrivate(itemId, {
        queue_code: 'vip_chat',
        priority: 5,
      });

      expect(result.success).toBe(true);
      const ix = await db.query.ixInteractions.findFirst({
        where: eq(ixInteractions.interaction_id, result.interaction_id!),
      });
      expect(ix?.queue_code).toBe('vip_chat');
      expect(ix?.priority).toBe(5);
    });

    test('non-existent item returns error', async () => {
      const result = await bridgeToPrivate('non-existent-item');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('reuses existing conversation for same author+channel', async () => {
      const authorId = 'same-author-test';
      const item1 = await insertEngagementItem('第一条消息', { authorId });
      const item2 = await insertEngagementItem('第二条消息', { authorId });

      const result1 = await bridgeToPrivate(item1);
      const result2 = await bridgeToPrivate(item2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Same author+channel should reuse the conversation
      expect(result1.conversation_id).toBe(result2.conversation_id);
      // But different interactions
      expect(result1.interaction_id).not.toBe(result2.interaction_id);
    });
  });

  describe('triage → bridge end-to-end', () => {
    test('crisis item → triage(materialize) → bridge → interaction', async () => {
      const itemId = await insertEngagementItem('我已经联系律师了，准备起诉');

      // Step 1: Triage
      const triage = await triageItem(itemId);
      expect(triage.classification).toBe('crisis');
      expect(triage.recommendation).toBe('materialize');

      // Step 2: Bridge (as mock-social would do)
      const bridge = await bridgeToPrivate(itemId, {
        priority: triage.risk_level === 'critical' ? 10 : 50,
      });

      expect(bridge.success).toBe(true);
      expect(bridge.interaction_id).toBeDefined();
      expect(bridge.conversation_id).toBeDefined();
    });

    test('inquiry item → triage(convert_private) → bridge → conversation', async () => {
      const itemId = await insertEngagementItem('请问套餐怎么升级？');

      const triage = await triageItem(itemId);
      expect(triage.classification).toBe('inquiry');
      expect(triage.recommendation).toBe('convert_private');

      const bridge = await bridgeToPrivate(itemId);
      expect(bridge.success).toBe(true);
      expect(bridge.conversation_id).toBeDefined();
    });

    test('spam item → triage(ignore) → no bridge needed', async () => {
      const itemId = await insertEngagementItem('免费领优惠券加微信');

      const triage = await triageItem(itemId);
      expect(triage.classification).toBe('spam');
      expect(triage.recommendation).toBe('ignore');
      // No bridge call needed for ignore
    });

    test('praise item → triage(moderate_only) → no bridge needed', async () => {
      const itemId = await insertEngagementItem('服务很好，五星好评', 'positive');

      const triage = await triageItem(itemId);
      expect(triage.classification).toBe('praise');
      expect(triage.recommendation).toBe('moderate_only');
    });
  });
});
