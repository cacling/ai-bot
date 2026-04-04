/**
 * useWorkspaceWs.ts — WebSocket hook for the agent workspace.
 *
 * Connects to interaction_platform's /ws/workspace endpoint.
 * Manages inbox state: interactions, offers, per-interaction messages/cards.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AgentMessage } from '../AgentContext';
import { type CardState, buildInitialCardStates, findCardByEvent } from '../cards/registry';
import {
  type InboxState,
  type InboxInteraction,
  type InboxOffer,
} from './InboxContext';

/** Build WS base URL — uses /ix-ws proxy in dev, direct URL if env override provided */
function getWsBase(): string {
  const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_INTERACTION_PLATFORM_URL;
  if (envUrl) return envUrl.replace(/^http/, 'ws');
  // Use vite proxy path (works in dev; in production, configure nginx/caddy to proxy /ix-ws → interaction_platform)
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ix-ws`;
}

/** Counter for unique system message IDs. */
let systemMsgIdCounter = 100_000;

/** Create a system message to show in the conversation timeline. */
function makeSystemMessage(text: string): AgentMessage {
  return {
    id: systemMsgIdCounter++,
    sender: 'system',
    text,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Readable state labels for system event timeline. */
const STATE_LABELS: Record<string, Record<string, string>> = {
  assigned: { zh: '会话已分配给当前坐席', en: 'Interaction assigned to you' },
  active: { zh: '会话已激活', en: 'Interaction activated' },
  wrapping_up: { zh: '会话进入收尾阶段', en: 'Interaction wrapping up' },
  closed: { zh: '会话已关闭', en: 'Interaction closed' },
  queued: { zh: '会话已转入队列', en: 'Interaction queued' },
};

interface UseWorkspaceWsOptions {
  agentId: string;
  enabled?: boolean;
  /** Language for system event messages. Defaults to 'zh'. */
  lang?: 'zh' | 'en';
}

interface UseWorkspaceWsReturn {
  inbox: InboxState;
  isConnected: boolean;
  focusInteraction: (interactionId: string) => void;
  acceptOffer: (offerId: string) => void;
  declineOffer: (offerId: string) => void;
  sendMessage: (text: string) => void;
  wrapUp: (interactionId: string, code?: string, note?: string) => void;
  transferInteraction: (interactionId: string, targetQueue?: string) => void;
  setPresence: (status: string) => void;
  /** Inject a message from an external source (e.g., legacy /ws/agent). */
  dispatchExternalMessage: (interactionId: string, msg: AgentMessage) => void;
  /** Inject a card event from an external source. */
  dispatchExternalCardEvent: (interactionId: string, cardId: string, data: unknown) => void;
  /** Set typing indicator for a specific interaction. */
  setTyping: (interactionId: string, typing: boolean) => void;
  /** Set bot/human mode for a specific interaction. */
  setBotMode: (interactionId: string, mode: 'bot' | 'human') => void;
  /** Update card states for a specific interaction (reorder, collapse, etc.). */
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

const EMPTY_INBOX: InboxState = {
  interactions: [],
  offers: [],
  focusedInteractionId: null,
  messagesMap: new Map(),
  cardStatesMap: new Map(),
  typingMap: new Map(),
  botModeMap: new Map(),
  inputValueMap: new Map(),
  presence: null,
};

export function useWorkspaceWs({ agentId, enabled = true, lang = 'zh' }: UseWorkspaceWsOptions): UseWorkspaceWsReturn {
  const [inbox, setInbox] = useState<InboxState>(EMPTY_INBOX);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const msgIdCounter = useRef(0);

  // ── Send helper ──────────────────────────────────────────────────────────

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // ── Connection lifecycle ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !agentId) return;

    function connect() {
      const wsUrl = `${getWsBase()}/ws/workspace?agentId=${encodeURIComponent(agentId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 3s
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (evt) => {
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'inbox_snapshot': {
            const assigned = (msg.assigned as InboxInteraction[]) ?? [];
            const offers = (msg.offers as InboxOffer[]) ?? [];
            const presence = (msg.presence as InboxState['presence']) ?? null;
            setInbox((prev) => ({
              ...prev,
              interactions: assigned.map((i) => ({
                ...i,
                unreadCount: 0,
                lastMessagePreview: null,
                lastMessageAt: null,
              })),
              offers,
              presence,
            }));
            break;
          }

          case 'interaction_assigned': {
            const interaction = msg.interaction as InboxInteraction;
            if (!interaction) break;
            setInbox((prev) => {
              const iid = interaction.interaction_id;
              const existingMsgs = prev.messagesMap.get(iid) ?? [];
              const newMsgMap = new Map(prev.messagesMap);
              newMsgMap.set(iid, [...existingMsgs, makeSystemMessage(STATE_LABELS.assigned[lang])]);
              // Initialize card states for new interaction if not already present
              const newCardMap = new Map(prev.cardStatesMap);
              if (!newCardMap.has(iid)) {
                newCardMap.set(iid, buildInitialCardStates());
              }
              // Populate route_context card data from the interaction
              const cardDef = findCardByEvent('interaction_assigned');
              if (cardDef) {
                const cardStates = newCardMap.get(iid) ?? buildInitialCardStates();
                const updated = cardStates.map((c) =>
                  c.id === cardDef.id ? { ...c, data: cardDef.dataExtractor(msg), isOpen: true, isCollapsed: false } : c,
                );
                newCardMap.set(iid, updated);
              }
              return {
                ...prev,
                interactions: [
                  ...prev.interactions.filter((i) => i.interaction_id !== iid),
                  { ...interaction, unreadCount: 1, lastMessagePreview: interaction.handoff_summary, lastMessageAt: interaction.created_at },
                ],
                messagesMap: newMsgMap,
                cardStatesMap: newCardMap,
              };
            });
            break;
          }

          case 'offer_created': {
            const offer = msg.offer as InboxOffer;
            if (!offer) break;
            setInbox((prev) => ({
              ...prev,
              offers: [...prev.offers.filter((o) => o.offer_id !== offer.offer_id), offer],
            }));
            break;
          }

          case 'interaction_message': {
            const interactionId = msg.interaction_id as string;
            const text = msg.text as string;
            const sender = (msg.sender as 'bot' | 'agent' | 'customer') ?? 'customer';
            if (!interactionId || !text) break;

            const newMsg: AgentMessage = {
              id: ++msgIdCounter.current,
              msgId: msg.msg_id as string,
              sender,
              text,
              translated_text: msg.translated_text as string | undefined,
              time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              card: msg.card as AgentMessage['card'],
            };

            setInbox((prev) => {
              const newMap = new Map(prev.messagesMap);
              const existing = newMap.get(interactionId) ?? [];
              newMap.set(interactionId, [...existing, newMsg]);

              // Update unread if not focused
              const interactions = prev.interactions.map((i) => {
                if (i.interaction_id !== interactionId) return i;
                const isFocused = prev.focusedInteractionId === interactionId;
                return {
                  ...i,
                  unreadCount: isFocused ? 0 : i.unreadCount + 1,
                  lastMessagePreview: text.slice(0, 80),
                  lastMessageAt: new Date().toISOString(),
                };
              });

              return { ...prev, messagesMap: newMap, interactions };
            });
            break;
          }

          case 'interaction_state_changed': {
            const interactionId = msg.interaction_id as string;
            const state = msg.state as string;
            if (!interactionId || !state) break;

            setInbox((prev) => {
              const newMap = new Map(prev.messagesMap);
              const label = STATE_LABELS[state]?.[lang] ?? state;
              const existing = newMap.get(interactionId) ?? [];
              newMap.set(interactionId, [...existing, makeSystemMessage(label)]);
              return {
                ...prev,
                interactions: prev.interactions.map((i) =>
                  i.interaction_id === interactionId ? { ...i, state } : i,
                ),
                messagesMap: newMap,
              };
            });
            break;
          }

          case 'handoff_card': {
            // Populate handoff card data for the interaction
            const iid = msg.interaction_id as string;
            if (!iid) break;
            const cardDef = findCardByEvent('handoff_card');
            if (cardDef) {
              setInbox((prev) => {
                const newCardMap = new Map(prev.cardStatesMap);
                const cardStates = newCardMap.get(iid) ?? buildInitialCardStates();
                const updated = cardStates.map((c) =>
                  c.id === cardDef.id ? { ...c, data: cardDef.dataExtractor(msg), isOpen: true, isCollapsed: false } : c,
                );
                newCardMap.set(iid, updated);
                return { ...prev, cardStatesMap: newCardMap };
              });
            }
            break;
          }

          case 'unread_updated': {
            const interactionId = msg.interaction_id as string;
            const count = msg.count as number;
            if (!interactionId) break;

            setInbox((prev) => ({
              ...prev,
              interactions: prev.interactions.map((i) =>
                i.interaction_id === interactionId ? { ...i, unreadCount: count } : i,
              ),
            }));
            break;
          }
        }
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [agentId, enabled]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const focusInteraction = useCallback((interactionId: string) => {
    send({ type: 'focus_interaction', interaction_id: interactionId });
    setInbox((prev) => ({
      ...prev,
      focusedInteractionId: interactionId,
      // Clear unread for newly focused interaction
      interactions: prev.interactions.map((i) =>
        i.interaction_id === interactionId ? { ...i, unreadCount: 0 } : i,
      ),
    }));
  }, [send]);

  const acceptOffer = useCallback((offerId: string) => {
    send({ type: 'accept_offer', offer_id: offerId });
    setInbox((prev) => ({
      ...prev,
      offers: prev.offers.filter((o) => o.offer_id !== offerId),
    }));
  }, [send]);

  const declineOffer = useCallback((offerId: string) => {
    send({ type: 'decline_offer', offer_id: offerId });
    setInbox((prev) => ({
      ...prev,
      offers: prev.offers.filter((o) => o.offer_id !== offerId),
    }));
  }, [send]);

  const sendMessage = useCallback((text: string) => {
    const interactionId = inbox.focusedInteractionId;
    if (!interactionId || !text.trim()) return;
    send({ type: 'agent_message', interaction_id: interactionId, text });

    // Optimistic local update
    const newMsg: AgentMessage = {
      id: ++msgIdCounter.current,
      sender: 'agent',
      text,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };
    setInbox((prev) => {
      const newMap = new Map(prev.messagesMap);
      const existing = newMap.get(interactionId) ?? [];
      newMap.set(interactionId, [...existing, newMsg]);
      return { ...prev, messagesMap: newMap };
    });
  }, [send, inbox.focusedInteractionId]);

  const wrapUp = useCallback((interactionId: string, code?: string, note?: string) => {
    send({ type: 'wrap_up', interaction_id: interactionId, code, note });
  }, [send]);

  const transferInteraction = useCallback((interactionId: string, targetQueue?: string) => {
    send({ type: 'transfer_interaction', interaction_id: interactionId, target_queue: targetQueue });
  }, [send]);

  const setPresence = useCallback((status: string) => {
    send({ type: 'set_presence', status });
  }, [send]);

  // ── External injection (bridge from legacy /ws/agent) ───────────────────

  const dispatchExternalMessage = useCallback((interactionId: string, msg: AgentMessage) => {
    setInbox((prev) => {
      const newMap = new Map(prev.messagesMap);
      const existing = newMap.get(interactionId) ?? [];
      // Deduplicate by msgId if present
      if (msg.msgId && existing.some((m) => m.msgId === msg.msgId)) return prev;
      newMap.set(interactionId, [...existing, msg]);

      // Update last message preview
      const interactions = prev.interactions.map((i) => {
        if (i.interaction_id !== interactionId) return i;
        const isFocused = prev.focusedInteractionId === interactionId;
        return {
          ...i,
          unreadCount: isFocused ? 0 : i.unreadCount + 1,
          lastMessagePreview: msg.text.slice(0, 80),
          lastMessageAt: new Date().toISOString(),
        };
      });

      return { ...prev, messagesMap: newMap, interactions };
    });
  }, []);

  const dispatchExternalCardEvent = useCallback((interactionId: string, cardId: string, data: unknown, merge?: (prev: CardState) => CardState) => {
    setInbox((prev) => {
      const newMap = new Map(prev.cardStatesMap);
      const cards = newMap.get(interactionId) ?? buildInitialCardStates();
      newMap.set(
        interactionId,
        cards.map((c) => {
          if (c.id !== cardId) return c;
          if (merge) return merge(c);
          return { ...c, data, isOpen: true };
        }),
      );
      return { ...prev, cardStatesMap: newMap };
    });
  }, []);

  /** Update an existing message by ID within an interaction (for streaming deltas). */
  const updateMessageInPlace = useCallback((interactionId: string, msgId: number, updater: (msg: AgentMessage) => AgentMessage) => {
    setInbox((prev) => {
      const newMap = new Map(prev.messagesMap);
      const msgs = newMap.get(interactionId);
      if (!msgs) return prev;
      newMap.set(interactionId, msgs.map((m) => (m.id === msgId ? updater(m) : m)));
      return { ...prev, messagesMap: newMap };
    });
  }, []);

  /** Remove a message by ID from an interaction. */
  const removeMessage = useCallback((interactionId: string, msgId: number) => {
    setInbox((prev) => {
      const newMap = new Map(prev.messagesMap);
      const msgs = newMap.get(interactionId);
      if (!msgs) return prev;
      newMap.set(interactionId, msgs.filter((m) => m.id !== msgId));
      return { ...prev, messagesMap: newMap };
    });
  }, []);

  /** Clear all messages for a specific interaction (on new_session). */
  const clearMessages = useCallback((interactionId: string) => {
    setInbox((prev) => {
      const newMap = new Map(prev.messagesMap);
      newMap.set(interactionId, []);
      return { ...prev, messagesMap: newMap };
    });
  }, []);

  const setTypingFn = useCallback((interactionId: string, typing: boolean) => {
    setInbox((prev) => {
      const newMap = new Map(prev.typingMap);
      newMap.set(interactionId, typing);
      return { ...prev, typingMap: newMap };
    });
  }, []);

  const setBotModeFn = useCallback((interactionId: string, mode: 'bot' | 'human') => {
    setInbox((prev) => {
      const newMap = new Map(prev.botModeMap);
      newMap.set(interactionId, mode);
      return { ...prev, botModeMap: newMap };
    });
  }, []);

  const updateCardStatesFn = useCallback((interactionId: string, cards: CardState[]) => {
    setInbox((prev) => {
      const newMap = new Map(prev.cardStatesMap);
      newMap.set(interactionId, cards);
      return { ...prev, cardStatesMap: newMap };
    });
  }, []);

  const setInputValueFn = useCallback((interactionId: string, value: string) => {
    setInbox((prev) => {
      const newMap = new Map(prev.inputValueMap);
      newMap.set(interactionId, value);
      return { ...prev, inputValueMap: newMap };
    });
  }, []);

  /**
   * Ensure a synthetic interaction exists for the given phone.
   * Used when legacy WS receives messages but no real interaction has been materialized yet
   * (e.g., bot-only conversations before handoff).
   * Returns the interaction_id (synthetic or existing).
   */
  const ensureSyntheticInteraction = useCallback((phone: string): string => {
    const syntheticId = `synthetic-${phone}`;
    setInbox((prev) => {
      // Already exists?
      if (prev.interactions.some((i) => i.interaction_id === syntheticId)) return prev;

      const now = new Date().toISOString();
      const synthetic: InboxInteraction = {
        interaction_id: syntheticId,
        conversation_id: `conv-${phone}`,
        customer_party_id: phone,
        channel: 'webchat',
        work_model: 'live_chat',
        state: 'active',
        queue_code: null,
        handoff_summary: null,
        assigned_agent_id: null,
        priority: 50,
        first_response_due_at: null,
        next_response_due_at: null,
        routing_mode: null,
        created_at: now,
        updated_at: now,
        unreadCount: 0,
        lastMessagePreview: null,
        lastMessageAt: null,
      };

      const newCardMap = new Map(prev.cardStatesMap);
      if (!newCardMap.has(syntheticId)) {
        newCardMap.set(syntheticId, buildInitialCardStates());
      }

      return {
        ...prev,
        interactions: [...prev.interactions, synthetic],
        cardStatesMap: newCardMap,
        // Auto-focus if nothing focused yet
        focusedInteractionId: prev.focusedInteractionId ?? syntheticId,
      };
    });
    return syntheticId;
  }, []);

  return {
    inbox,
    isConnected,
    focusInteraction,
    acceptOffer,
    declineOffer,
    sendMessage,
    wrapUp,
    transferInteraction,
    setPresence,
    dispatchExternalMessage,
    dispatchExternalCardEvent,
    setTyping: setTypingFn,
    setBotMode: setBotModeFn,
    updateCardStates: updateCardStatesFn,
    setInputValue: setInputValueFn,
    updateMessageInPlace,
    removeMessage,
    clearMessages,
    ensureSyntheticInteraction,
  };
}
