import { createContext, useContext } from 'react';
import { type Lang } from '../i18n';
import { type CardData } from '../chat/CardMessage';
import { type CardState } from './cards/registry';

export interface AgentMessage {
  id: number;
  msgId?: string;
  sender: 'bot' | 'agent' | 'customer';
  text: string;
  translated_text?: string;
  time: string;
  card?: CardData;
  _ms?: number;
}

export interface AgentContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  isConnected: boolean;
  messages: AgentMessage[];
  cardStates: CardState[];
  inputValue: string;
  isTyping: boolean;
  botMode: 'bot' | 'human';
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onTransferToBot: () => void;
  onUpdateCards: (cards: CardState[]) => void;
}

export const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgentContext(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgentContext must be used within AgentLayout');
  return ctx;
}
