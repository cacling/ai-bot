/**
 * conversation-manager.ts — Conversation 创建/复用
 *
 * 客户连接时自动查找或创建 conversation。
 * 基于 customer_party_id + channel 查找活跃 conversation，
 * 如无则新建。
 */
import { db, ixConversations, eq, and } from '../db';

export interface FindOrCreateResult {
  conversation_id: string;
  created: boolean;
}

/**
 * Find an active conversation for the given party+channel, or create a new one.
 */
export async function findOrCreateConversation(
  customerPartyId: string,
  channel: string,
  options?: { subject?: string; metadata?: Record<string, unknown> },
): Promise<FindOrCreateResult> {
  // Look for an existing active conversation
  const existing = await db.query.ixConversations.findFirst({
    where: and(
      eq(ixConversations.customer_party_id, customerPartyId),
      eq(ixConversations.channel, channel),
      eq(ixConversations.status, 'active'),
    ),
  });

  if (existing) {
    return { conversation_id: existing.conversation_id, created: false };
  }

  // Create a new conversation
  const conversationId = crypto.randomUUID();
  await db.insert(ixConversations).values({
    conversation_id: conversationId,
    customer_party_id: customerPartyId,
    channel,
    domain_scope: 'private_interaction',
    status: 'active',
    subject: options?.subject ?? null,
    metadata_json: options?.metadata ? JSON.stringify(options.metadata) : null,
  });

  return { conversation_id: conversationId, created: true };
}

/**
 * Get a conversation by ID.
 */
export async function getConversation(conversationId: string) {
  return db.query.ixConversations.findFirst({
    where: eq(ixConversations.conversation_id, conversationId),
  });
}
