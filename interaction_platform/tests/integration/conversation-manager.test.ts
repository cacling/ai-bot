/**
 * conversation-manager.test.ts — Integration tests for conversation create/reuse.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initTestDb } from '../helpers/test-db';

const testDb = initTestDb('conv-mgr');

beforeAll(async () => { await testDb.pushSchema(); });
afterAll(() => testDb.cleanup());

const { findOrCreateConversation, getConversation } = await import('../../src/services/conversation-manager');
const { db, ixConversations, eq } = await import('../../src/db');

describe('conversation-manager', () => {
  describe('findOrCreateConversation', () => {
    test('creates new conversation when none exists', async () => {
      const result = await findOrCreateConversation('party-cm-001', 'webchat');

      expect(result.created).toBe(true);
      expect(result.conversation_id).toBeDefined();

      // Verify in DB
      const conv = await getConversation(result.conversation_id);
      expect(conv).toBeDefined();
      expect(conv!.customer_party_id).toBe('party-cm-001');
      expect(conv!.channel).toBe('webchat');
      expect(conv!.status).toBe('active');
    });

    test('returns existing active conversation for same party+channel', async () => {
      const r1 = await findOrCreateConversation('party-cm-002', 'webchat');
      const r2 = await findOrCreateConversation('party-cm-002', 'webchat');

      expect(r1.created).toBe(true);
      expect(r2.created).toBe(false);
      expect(r1.conversation_id).toBe(r2.conversation_id);
    });

    test('creates separate conversations for different channels', async () => {
      const r1 = await findOrCreateConversation('party-cm-003', 'webchat');
      const r2 = await findOrCreateConversation('party-cm-003', 'voice');

      expect(r1.created).toBe(true);
      expect(r2.created).toBe(true);
      expect(r1.conversation_id).not.toBe(r2.conversation_id);
    });

    test('creates separate conversations for different parties', async () => {
      const r1 = await findOrCreateConversation('party-cm-004', 'webchat');
      const r2 = await findOrCreateConversation('party-cm-005', 'webchat');

      expect(r1.created).toBe(true);
      expect(r2.created).toBe(true);
      expect(r1.conversation_id).not.toBe(r2.conversation_id);
    });

    test('creates new conversation when existing one is closed', async () => {
      const r1 = await findOrCreateConversation('party-cm-006', 'webchat');
      expect(r1.created).toBe(true);

      // Close the conversation
      await db.update(ixConversations)
        .set({ status: 'closed' })
        .where(eq(ixConversations.conversation_id, r1.conversation_id));

      // Now should create a new one
      const r2 = await findOrCreateConversation('party-cm-006', 'webchat');
      expect(r2.created).toBe(true);
      expect(r2.conversation_id).not.toBe(r1.conversation_id);
    });

    test('stores subject when provided', async () => {
      const result = await findOrCreateConversation('party-cm-007', 'webchat', {
        subject: 'Test subject',
      });

      const conv = await getConversation(result.conversation_id);
      expect(conv!.subject).toBe('Test subject');
    });

    test('stores metadata when provided', async () => {
      const metadata = { source: 'test', ref_id: '12345' };
      const result = await findOrCreateConversation('party-cm-008', 'webchat', {
        metadata,
      });

      const conv = await getConversation(result.conversation_id);
      expect(conv!.metadata_json).toBe(JSON.stringify(metadata));
    });

    test('does not update existing conversation metadata on reuse', async () => {
      await findOrCreateConversation('party-cm-009', 'webchat', {
        subject: 'First subject',
      });

      const r2 = await findOrCreateConversation('party-cm-009', 'webchat', {
        subject: 'Second subject',
      });
      expect(r2.created).toBe(false);

      const conv = await getConversation(r2.conversation_id);
      expect(conv!.subject).toBe('First subject'); // Not overwritten
    });
  });

  describe('getConversation', () => {
    test('returns null for non-existent conversation', async () => {
      const conv = await getConversation('non-existent-conv');
      expect(conv).toBeUndefined();
    });
  });
});
