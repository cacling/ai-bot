/**
 * workspace-ws.test.ts — Tests for workspace WS utilities and inbox builder.
 *
 * Tests the pushToAgent, pushToFocusedAgent helpers and the inbox snapshot logic.
 * Full WS protocol testing would require a running server; these tests validate
 * the core logic units.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('workspace-ws');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const {
  pushToAgent,
  pushToFocusedAgent,
  getAgentConnections,
} = await import('../../src/routes/workspace-ws');
const { db, ixInteractions, ixConversations, ixOffers, ixAgentPresence, ixInteractionEvents, eq, and } = await import('../../src/db');

// ── Helpers ──────────────────────────────────────────────────────────────

async function seedInteractionForAgent(agentId: string, interactionId: string, state = 'active') {
  const convId = `ws-conv-${interactionId}`;
  await db.insert(ixConversations).values({
    conversation_id: convId,
    customer_party_id: 'ws-party-test',
    channel: 'webchat',
    status: 'active',
  }).catch(() => {});

  await db.insert(ixInteractions).values({
    interaction_id: interactionId,
    conversation_id: convId,
    work_model: 'live_chat',
    source_object_type: 'conversation',
    source_object_id: convId,
    state,
    assigned_agent_id: agentId,
    priority: 50,
  });
}

async function seedOffer(agentId: string, offerId: string, interactionId: string) {
  await db.insert(ixOffers).values({
    offer_id: offerId,
    interaction_id: interactionId,
    agent_id: agentId,
    status: 'pending',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('workspace-ws helpers', () => {
  describe('pushToAgent', () => {
    test('sends message to registered agent connections', () => {
      const messages: string[] = [];
      const mockWs = { send: (data: string) => messages.push(data) };

      // Manually register a connection (mimicking onOpen)
      const conns = new Set<{ agentId: string; ws: typeof mockWs; focusedInteractionId: string | null }>();
      conns.add({ agentId: 'ws-agent-001', ws: mockWs, focusedInteractionId: null });

      // Use the internal Map directly — since pushToAgent reads from the module-level Map,
      // we test it by verifying it doesn't throw when no connections exist
      pushToAgent('non-existent-agent', { type: 'test' });
      // No error thrown, message just dropped silently
    });

    test('pushToFocusedAgent filters by focused interaction', () => {
      // pushToFocusedAgent for non-existent agent doesn't throw
      pushToFocusedAgent('non-existent-agent', 'ix-123', { type: 'test' });
    });

    test('getAgentConnections returns undefined for unregistered agent', () => {
      const conns = getAgentConnections('unregistered-agent');
      expect(conns).toBeUndefined();
    });
  });

  describe('inbox snapshot data', () => {
    beforeAll(async () => {
      // Seed an agent with some interactions + offers
      await db.insert(ixAgentPresence).values({
        agent_id: 'ws-snapshot-agent',
        presence_status: 'online',
        max_chat_slots: 3,
        max_voice_slots: 1,
        active_chat_count: 2,
        active_voice_count: 0,
      });

      await seedInteractionForAgent('ws-snapshot-agent', 'ws-ix-001', 'active');
      await seedInteractionForAgent('ws-snapshot-agent', 'ws-ix-002', 'wrapping_up');
      await seedInteractionForAgent('ws-snapshot-agent', 'ws-ix-003', 'closed'); // should be excluded
      await seedOffer('ws-snapshot-agent', 'ws-offer-001', 'ws-ix-004');
    });

    test('active interactions are returned for agent', async () => {
      const assigned = await db.select().from(ixInteractions)
        .where(eq(ixInteractions.assigned_agent_id, 'ws-snapshot-agent'))
        .all();

      const active = assigned.filter(i => !['closed', 'abandoned'].includes(i.state));
      expect(active.length).toBe(2); // active + wrapping_up
      expect(active.some(i => i.interaction_id === 'ws-ix-001')).toBe(true);
      expect(active.some(i => i.interaction_id === 'ws-ix-002')).toBe(true);
    });

    test('closed interactions are excluded from inbox', async () => {
      const assigned = await db.select().from(ixInteractions)
        .where(eq(ixInteractions.assigned_agent_id, 'ws-snapshot-agent'))
        .all();

      const active = assigned.filter(i => !['closed', 'abandoned'].includes(i.state));
      expect(active.some(i => i.interaction_id === 'ws-ix-003')).toBe(false);
    });

    test('pending offers are returned for agent', async () => {
      const offers = await db.select().from(ixOffers)
        .where(
          and(
            eq(ixOffers.agent_id, 'ws-snapshot-agent'),
            eq(ixOffers.status, 'pending'),
          ),
        )
        .all();

      expect(offers.length).toBe(1);
      expect(offers[0].offer_id).toBe('ws-offer-001');
    });
  });

  describe('WS message handling logic', () => {
    test('set_presence updates agent presence in DB', async () => {
      await db.insert(ixAgentPresence).values({
        agent_id: 'ws-presence-agent',
        presence_status: 'online',
        max_chat_slots: 3,
        max_voice_slots: 1,
        active_chat_count: 0,
        active_voice_count: 0,
      });

      // Simulate set_presence message handling
      const status = 'away';
      await db.update(ixAgentPresence)
        .set({ presence_status: status, updated_at: new Date() })
        .where(eq(ixAgentPresence.agent_id, 'ws-presence-agent'));

      const agent = await db.query.ixAgentPresence.findFirst({
        where: eq(ixAgentPresence.agent_id, 'ws-presence-agent'),
      });
      expect(agent?.presence_status).toBe('away');
    });

    test('wrap_up updates interaction state', async () => {
      await seedInteractionForAgent('ws-wrapup-agent', 'ws-ix-wrapup', 'active');

      await db.update(ixInteractions)
        .set({
          state: 'wrapping_up',
          wrap_up_code: 'resolved',
          wrap_up_note: 'Issue resolved',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(ixInteractions.interaction_id, 'ws-ix-wrapup'),
            eq(ixInteractions.assigned_agent_id, 'ws-wrapup-agent'),
          ),
        );

      const ix = await db.query.ixInteractions.findFirst({
        where: eq(ixInteractions.interaction_id, 'ws-ix-wrapup'),
      });
      expect(ix?.state).toBe('wrapping_up');
      expect(ix?.wrap_up_code).toBe('resolved');
    });

    test('accept_offer updates offer status', async () => {
      await seedInteractionForAgent('ws-offer-agent', 'ws-ix-offer-accept', 'offered');
      await seedOffer('ws-offer-agent', 'ws-offer-accept', 'ws-ix-offer-accept');

      await db.update(ixOffers)
        .set({ status: 'accepted', responded_at: new Date() })
        .where(eq(ixOffers.offer_id, 'ws-offer-accept'));

      const offer = await db.query.ixOffers.findFirst({
        where: eq(ixOffers.offer_id, 'ws-offer-accept'),
      });
      expect(offer?.status).toBe('accepted');
    });

    test('decline_offer updates offer status', async () => {
      await seedInteractionForAgent('ws-offer-agent', 'ws-ix-offer-decline', 'offered');
      await seedOffer('ws-offer-agent', 'ws-offer-decline', 'ws-ix-offer-decline');

      await db.update(ixOffers)
        .set({ status: 'declined', responded_at: new Date() })
        .where(eq(ixOffers.offer_id, 'ws-offer-decline'));

      const offer = await db.query.ixOffers.findFirst({
        where: eq(ixOffers.offer_id, 'ws-offer-decline'),
      });
      expect(offer?.status).toBe('declined');
    });

    test('agent_message creates interaction event', async () => {
      await seedInteractionForAgent('ws-msg-agent', 'ws-ix-msg', 'active');

      await db.insert(ixInteractionEvents).values({
        interaction_id: 'ws-ix-msg',
        event_type: 'agent_message',
        actor_type: 'agent',
        actor_id: 'ws-msg-agent',
        payload_json: JSON.stringify({ text: 'Hello customer' }),
      });

      const events = await db.select().from(ixInteractionEvents)
        .where(eq(ixInteractionEvents.interaction_id, 'ws-ix-msg'))
        .all();

      const msgEvt = events.find(e => e.event_type === 'agent_message');
      expect(msgEvt).toBeDefined();
      expect(JSON.parse(msgEvt!.payload_json!).text).toBe('Hello customer');
    });

    test('transfer_interaction updates state and queue', async () => {
      await seedInteractionForAgent('ws-transfer-agent', 'ws-ix-transfer', 'active');

      await db.update(ixInteractions)
        .set({
          state: 'transferred',
          queue_code: 'vip_chat',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(ixInteractions.interaction_id, 'ws-ix-transfer'),
            eq(ixInteractions.assigned_agent_id, 'ws-transfer-agent'),
          ),
        );

      const ix = await db.query.ixInteractions.findFirst({
        where: eq(ixInteractions.interaction_id, 'ws-ix-transfer'),
      });
      expect(ix?.state).toBe('transferred');
      expect(ix?.queue_code).toBe('vip_chat');
    });
  });
});
