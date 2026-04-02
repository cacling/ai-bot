/**
 * useWorkspaceWs.ts — WebSocket hook for the agent workspace.
 *
 * Connects to interaction_platform's /ws/workspace endpoint.
 * Manages inbox state: interactions, offers, per-interaction messages/cards.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AgentMessage } from '../AgentContext';
import { type CardState } from '../cards/registry';
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

interface UseWorkspaceWsOptions {
  agentId: string;
  enabled?: boolean;
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
}

const EMPTY_INBOX: InboxState = {
  interactions: [],
  offers: [],
  focusedInteractionId: null,
  messagesMap: new Map(),
  cardStatesMap: new Map(),
};

export function useWorkspaceWs({ agentId, enabled = true }: UseWorkspaceWsOptions): UseWorkspaceWsReturn {
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
            setInbox((prev) => ({
              ...prev,
              interactions: assigned.map((i) => ({
                ...i,
                unreadCount: 0,
                lastMessagePreview: null,
                lastMessageAt: null,
              })),
              offers,
            }));
            break;
          }

          case 'interaction_assigned': {
            const interaction = msg.interaction as InboxInteraction;
            if (!interaction) break;
            setInbox((prev) => ({
              ...prev,
              interactions: [
                ...prev.interactions.filter((i) => i.interaction_id !== interaction.interaction_id),
                { ...interaction, unreadCount: 1, lastMessagePreview: interaction.handoff_summary, lastMessageAt: interaction.created_at },
              ],
            }));
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

            setInbox((prev) => ({
              ...prev,
              interactions: prev.interactions.map((i) =>
                i.interaction_id === interactionId ? { ...i, state } : i,
              ),
            }));
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
  };
}
