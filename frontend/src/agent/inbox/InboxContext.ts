/**
 * InboxContext.ts — Per-interaction state for the Inbox model.
 *
 * Replaces the old single-phone state model with a Map<interactionId, ...>
 * so agents can handle multiple concurrent interactions.
 */
import { createContext, useContext } from 'react';
import { type AgentMessage } from '../AgentContext';
import { type CardState } from '../cards/registry';

// ── Interaction item in inbox ──────────────────────────────────────────────

export interface InboxInteraction {
  interaction_id: string;
  conversation_id: string;
  customer_party_id: string | null;
  channel: string;
  work_model: string;
  state: string;
  queue_code: string | null;
  handoff_summary: string | null;
  assigned_agent_id: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
  /** Client-side unread message count. */
  unreadCount: number;
  /** Last message preview text. */
  lastMessagePreview: string | null;
  /** Last message timestamp. */
  lastMessageAt: string | null;
}

export interface InboxOffer {
  offer_id: string;
  interaction_id: string;
  agent_id: string;
  status: string;
  offered_at: string;
  expires_at: string | null;
}

// ── Inbox state ────────────────────────────────────────────────────────────

export interface InboxState {
  /** All assigned interactions. */
  interactions: InboxInteraction[];
  /** Pending offers. */
  offers: InboxOffer[];
  /** Currently focused interaction ID. */
  focusedInteractionId: string | null;
  /** Per-interaction message lists. */
  messagesMap: Map<string, AgentMessage[]>;
  /** Per-interaction card states. */
  cardStatesMap: Map<string, CardState[]>;
}

// ── Inbox context value ────────────────────────────────────────────────────

export interface InboxContextValue {
  /** Inbox state. */
  inbox: InboxState;
  /** Whether the workspace WS is connected. */
  isConnected: boolean;
  /** Focus on a specific interaction. */
  focusInteraction: (interactionId: string) => void;
  /** Accept a pending offer. */
  acceptOffer: (offerId: string) => void;
  /** Decline a pending offer. */
  declineOffer: (offerId: string) => void;
  /** Send a message to the focused interaction. */
  sendMessage: (text: string) => void;
  /** Wrap up an interaction. */
  wrapUp: (interactionId: string, code?: string, note?: string) => void;
  /** Transfer an interaction. */
  transferInteraction: (interactionId: string, targetQueue?: string) => void;
  /** Set agent presence status. */
  setPresence: (status: 'online' | 'away' | 'dnd' | 'offline') => void;
}

export const InboxContext = createContext<InboxContextValue | null>(null);

export function useInboxContext(): InboxContextValue {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error('useInboxContext must be used within InboxProvider');
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Get messages for the currently focused interaction. */
export function getFocusedMessages(inbox: InboxState): AgentMessage[] {
  if (!inbox.focusedInteractionId) return [];
  return inbox.messagesMap.get(inbox.focusedInteractionId) ?? [];
}

/** Get card states for the currently focused interaction. */
export function getFocusedCardStates(inbox: InboxState): CardState[] {
  if (!inbox.focusedInteractionId) return [];
  return inbox.cardStatesMap.get(inbox.focusedInteractionId) ?? [];
}

/** Get the focused interaction object. */
export function getFocusedInteraction(inbox: InboxState): InboxInteraction | undefined {
  if (!inbox.focusedInteractionId) return undefined;
  return inbox.interactions.find((i) => i.interaction_id === inbox.focusedInteractionId);
}
