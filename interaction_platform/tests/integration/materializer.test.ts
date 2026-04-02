/**
 * materializer + router-kernel integration test
 *
 * Uses the shared test DB helper for consistency with other test files.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('materializer');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

// Import after env is set
const { materializeInteraction } = await import('../../src/services/materializer');
const { db, ixAgentPresence, ixInteractionEvents, eq } = await import('../../src/db');

describe('materializer + router', () => {
  test('materialize with no agents → queued', async () => {
    // Use isolated tenant to ensure no agents are found
    const result = await materializeInteraction({
      conversation_id: 'conv-test-001',
      customer_party_id: 'party-001',
      channel: 'webchat',
      work_model: 'live_chat',
      queue_code: 'default_chat',
      handoff_summary: 'Test handoff',
      tenant_id: 'mat-no-agent',
    });

    expect(result.success).toBe(true);
    expect(result.interaction_id).toBeDefined();
    expect(result.conversation_id).toBe('conv-test-001');
    expect(result.state).toBe('queued'); // No agents → queued
    expect(result.assigned_agent_id).toBeUndefined();
  });

  test('materialize with available agent → assigned', async () => {
    const tenant = 'mat-with-agent';
    // Seed an online agent with capacity
    await db.insert(ixAgentPresence).values({
      agent_id: 'test-agent-001',
      presence_status: 'online',
      max_chat_slots: 3,
      max_voice_slots: 1,
      active_chat_count: 0,
      active_voice_count: 0,
      tenant_id: tenant,
    });

    const result = await materializeInteraction({
      conversation_id: 'conv-test-002',
      customer_party_id: 'party-002',
      channel: 'webchat',
      work_model: 'live_chat',
      queue_code: 'default_chat',
      tenant_id: tenant,
    });

    expect(result.success).toBe(true);
    expect(result.state).toBe('assigned');
    expect(result.assigned_agent_id).toBe('test-agent-001');

    // Verify agent workload updated
    const agent = await db.query.ixAgentPresence.findFirst({
      where: eq(ixAgentPresence.agent_id, 'test-agent-001'),
    });
    expect(agent?.active_chat_count).toBe(1);
  });

  test('interaction events are recorded', async () => {
    const events = await db.select().from(ixInteractionEvents).all();
    // At minimum: 2 interactions × (created + routing event)
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  test('voice interaction routing respects exclusivity', async () => {
    // Agent has 1 active chat from previous test → voice should not assign
    const result = await materializeInteraction({
      conversation_id: 'conv-test-003',
      customer_party_id: 'party-003',
      channel: 'phone',
      work_model: 'live_voice',
      queue_code: 'default_voice',
      tenant_id: 'mat-with-agent',
    });

    expect(result.success).toBe(true);
    // Agent has active chat, so voice can't be assigned → queued
    expect(result.state).toBe('queued');
  });
});
