/**
 * public-private-bridge.ts — Public engagement → Private conversation bridge.
 *
 * When triage recommends 'convert_private' or 'materialize', this service:
 *   1. Creates or finds a private conversation for the engagement author
 *   2. Materializes an interaction linked to the engagement item
 *   3. Routes the interaction to an agent
 */
import { db, ixEngagementItems, eq } from '../db';
import { findOrCreateConversation } from './conversation-manager';
import { materializeInteraction } from './materializer';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BridgeResult {
  success: boolean;
  conversation_id?: string;
  interaction_id?: string;
  assigned_agent_id?: string;
  error?: string;
}

// ── Bridge ─────────────────────────────────────────────────────────────────

/**
 * Convert a public engagement item into a private interaction.
 *
 * For 'materialize': creates conversation + interaction + routes immediately.
 * For 'convert_private': creates conversation + interaction but with lower priority.
 */
export async function bridgeToPrivate(
  itemId: string,
  options?: {
    queue_code?: string;
    priority?: number;
  },
): Promise<BridgeResult> {
  try {
    const item = await db.query.ixEngagementItems.findFirst({
      where: eq(ixEngagementItems.item_id, itemId),
    });
    if (!item) return { success: false, error: 'Engagement item not found' };

    // Use author as a pseudo party ID (in production would resolve via CDP)
    const partyId = item.author_id ?? `anon-${item.provider}-${itemId.slice(0, 8)}`;

    // Find or create conversation for this author+channel
    const channel = `${item.provider}_public`;
    const conv = await findOrCreateConversation(partyId, channel, {
      subject: item.body?.slice(0, 100),
      metadata: {
        source: 'public_engagement',
        engagement_item_id: itemId,
        provider: item.provider,
        author_name: item.author_name,
      },
    });

    // Materialize an interaction
    const result = await materializeInteraction({
      conversation_id: conv.conversation_id,
      customer_party_id: partyId,
      channel,
      work_model: 'async_public_engagement',
      queue_code: options?.queue_code ?? 'default_chat',
      priority: options?.priority ?? 40,
      handoff_summary: `[${item.item_type}] ${item.author_name ?? 'Anonymous'}: ${item.body?.slice(0, 200)}`,
    });

    // Update engagement item status
    await db.update(ixEngagementItems)
      .set({ status: 'actioned' })
      .where(eq(ixEngagementItems.item_id, itemId));

    return {
      success: true,
      conversation_id: result.conversation_id,
      interaction_id: result.interaction_id,
      assigned_agent_id: result.assigned_agent_id,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
