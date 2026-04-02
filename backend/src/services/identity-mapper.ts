/**
 * identity-mapper.ts — Phone → Party → Conversation mapping.
 *
 * Phase 0: Stub implementation that wraps cdp-client's resolveIdentity
 *          and provides the interface for future conversation resolution.
 * Phase 1: Will call interaction_platform service to resolve/create conversations.
 *
 * This module is the single entry point for translating a phone-based
 * session identifier into the interaction platform's identity model.
 */
import { resolveIdentity } from './cdp-client';
import { logger } from './logger';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IdentityMapping {
  /** CDP party ID (null if identity resolution failed). */
  partyId: string | null;
  /** Display name from CDP (null if unknown). */
  displayName: string | null;
  /** Conversation ID in interaction platform (null until Phase 1). */
  conversationId: string | null;
  /** Active interaction ID if one exists (null until Phase 1). */
  interactionId: string | null;
}

// ── Mapper ─────────────────────────────────────────────────────────────────

/**
 * Resolve a phone number into the interaction platform's identity model.
 *
 * Phase 0: Only resolves party via CDP; conversation/interaction are null stubs.
 * Phase 1: Will also resolve or create conversation via interaction_platform service.
 */
export async function mapPhoneToIdentity(phone: string): Promise<IdentityMapping> {
  const result = await resolveIdentity(phone);

  if (!result?.resolved || !result.party_id) {
    logger.info('identity-mapper', 'resolve_miss', { phone });
    return { partyId: null, displayName: null, conversationId: null, interactionId: null };
  }

  return {
    partyId: result.party_id,
    displayName: result.display_name ?? null,
    // Phase 0 stubs — will be populated in Phase 1
    conversationId: null,
    interactionId: null,
  };
}
