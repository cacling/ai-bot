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
  first_response_due_at: string | null;
  next_response_due_at: string | null;
  routing_mode: string | null;
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
  /** Joined from interaction */
  queue_code: string | null;
  channel: string | null;
  priority: number | null;
  handoff_summary: string | null;
  customer_party_id: string | null;
}

// ── Inbox state ────────────────────────────────────────────────────────────

export interface AgentPresenceData {
  status: string;
  active_chat_count: number;
  max_chat_slots: number;
  active_voice_count: number;
  max_voice_slots: number;
  queue_codes?: string[];
}

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
  /** Per-interaction typing indicator. */
  typingMap: Map<string, boolean>;
  /** Per-interaction bot/human mode. */
  botModeMap: Map<string, 'bot' | 'human'>;
  /** Per-interaction input value (preserved across switches). */
  inputValueMap: Map<string, string>;
  /** Agent presence/capacity from backend. */
  presence: AgentPresenceData | null;
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
  /** Inject a message from external source (legacy WS) into a specific interaction. */
  dispatchExternalMessage: (interactionId: string, msg: AgentMessage) => void;
  /** Inject a card event from external source (legacy WS) into a specific interaction. */
  dispatchExternalCardEvent: (interactionId: string, cardId: string, data: unknown) => void;
  /** Set typing indicator for a specific interaction. */
  setTyping: (interactionId: string, typing: boolean) => void;
  /** Set bot/human mode for a specific interaction. */
  setBotMode: (interactionId: string, mode: 'bot' | 'human') => void;
  /** Update card states for a specific interaction (e.g., reorder, collapse). */
  updateCardStates: (interactionId: string, cards: CardState[]) => void;
  /** Set input value for a specific interaction. */
  setInputValue: (interactionId: string, value: string) => void;
  /** Update an existing message by ID (for streaming deltas). */
  updateMessageInPlace: (interactionId: string, msgId: number, updater: (msg: AgentMessage) => AgentMessage) => void;
  /** Remove a message by ID. */
  removeMessage: (interactionId: string, msgId: number) => void;
  /** Clear all messages for an interaction. */
  clearMessages: (interactionId: string) => void;
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

/** Get typing state for the currently focused interaction. */
export function getFocusedTyping(inbox: InboxState): boolean {
  if (!inbox.focusedInteractionId) return false;
  return inbox.typingMap.get(inbox.focusedInteractionId) ?? false;
}

/** Get bot/human mode for the currently focused interaction. */
export function getFocusedBotMode(inbox: InboxState): 'bot' | 'human' {
  if (!inbox.focusedInteractionId) return 'bot';
  return inbox.botModeMap.get(inbox.focusedInteractionId) ?? 'bot';
}

/** Get input value for the currently focused interaction. */
export function getFocusedInputValue(inbox: InboxState): string {
  if (!inbox.focusedInteractionId) return '';
  return inbox.inputValueMap.get(inbox.focusedInteractionId) ?? '';
}
