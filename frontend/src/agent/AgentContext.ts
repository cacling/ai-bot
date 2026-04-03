import { createContext, useContext } from 'react';
import { type Lang } from '../i18n';
import { type CardData } from '../chat/CardMessage';

export interface AgentMessage {
  id: number;
  msgId?: string;
  sender: 'bot' | 'agent' | 'customer' | 'system';
  text: string;
  translated_text?: string;
  time: string;
  card?: CardData;
  _ms?: number;
}

/**
 * AgentContext — Layout-level context (slimmed down).
 *
 * Messages, cards, typing, botMode, inputValue are now in InboxContext
 * (per-interaction). AgentContext retains only shared layout state.
 */
export interface AgentContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Legacy WS connection (for bot/card events). */
  isConnected: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onTransferToBot: () => void;
}

export const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentContext must be used within AgentLayout');
  return ctx;
}
